# -*- coding: utf-8 -*-
"""Publica pranchas do Revit no padrao Martins Notari.

Exporta PDF + DWG das folhas selecionadas com o nome no padrao
    Obra_SIGLA_NNN_RXX  (ex.: VilaNord_ARQ_001_R04.pdf)
e gera o arquivo manifesto_pranchas.json, que o aplicativo de obra
importa com um clique (modo Engenharia > "Importar do Revit").

Requisitos no modelo:
  - Numero de projeto (Informacoes do projeto) = codigo da obra (ex.: 20001)
  - Nome do edificio (Informacoes do projeto)  = nome da obra (ex.: Vila Nord)
  - Folhas numeradas como SIGLA-NNN (ex.: ARQ-001, EST-010)
  - Revisoes numericas aplicadas na folha (a revisao atual vira RXX)

PDF nativo exige Revit 2022 ou superior. DWG e manifesto funcionam em
qualquer versao com pyRevit.
"""

__title__ = 'Publicar\nPranchas'
__author__ = 'Martins Notari'

import os
import re
import json
import codecs
import shutil
from datetime import datetime

from pyrevit import revit, forms, script

from Autodesk.Revit.DB import (
    FilteredElementCollector, ViewSheet, BuiltInParameter, ElementId,
    DWGExportOptions,
)
from System.Collections.Generic import List

# PDFExportOptions so existe no Revit 2022+
try:
    from Autodesk.Revit.DB import PDFExportOptions
    PDF_DISPONIVEL = True
except ImportError:
    PDF_DISPONIVEL = False

doc = revit.doc
output = script.get_output()

# ---------------------------------------------------------------------------
# Tabela oficial de siglas (Guia de Nomenclatura v2.2)
# ---------------------------------------------------------------------------
SIGLAS = {
    # Arquitetura e acabamentos
    'ARQ': u'Arquitetônico',
    'INT': u'Interiores',
    'PAI': u'Paisagismo',
    'LUM': u'Luminotécnico',
    'IMP': u'Impermeabilização',
    'ESQ': u'Esquadrias',
    'COM': u'Comunicação visual',
    'ACU': u'Acústica',
    # Estrutura
    'EST': u'Estrutural',
    'FUN': u'Fundações',
    'EMT': u'Estrutura metálica',
    'DET': u'Detalhamentos',
    # Instalacoes
    'HID': u'Hidrossanitário',
    'PLU': u'Águas pluviais',
    'ELE': u'Elétrica',
    'SPD': u'SPDA',
    'AVA': u'Climatização (AVAC)',
    'GAS': u'Gás',
    'INC': u'Incêndio (PPCI)',
    # Tecnologia e sistemas
    'DAD': u'Dados / Telecom',
    'BMS': u'Automação (BMS)',
    'ELV': u'Elevadores',
    # Terreno e externas
    'TOP': u'Topografia / Implantação',
    'TER': u'Terraplenagem',
    'PAV': u'Pavimentação',
}

ACENTOS = u'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ'
SEM_ACENTO = u'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'


def sem_acentos(texto):
    return u''.join(
        SEM_ACENTO[ACENTOS.index(c)] if c in ACENTOS else c for c in texto
    )


def camel(texto):
    """'vila nord' -> 'VilaNord' (sem espacos, acentos ou simbolos)."""
    partes = re.split(r'[^0-9A-Za-z]+', sem_acentos(texto or u''))
    return u''.join(p[:1].upper() + p[1:] for p in partes if p)


def param_texto(elemento, builtin):
    p = elemento.get_Parameter(builtin)
    if p is None:
        return u''
    v = p.AsString()
    return (v or u'').strip()


def rev_normalizada(texto_rev):
    """'4', '04', 'R4', 'Rev. 04' -> 'R04'. Sem digitos -> None."""
    m = re.search(r'\d+', texto_rev or u'')
    if not m:
        return None
    return u'R{:02d}'.format(int(m.group(0)))


def parse_numero_folha(sheet_number):
    """'ARQ-001' -> ('ARQ', '001'). Aceita ARQ_001, ARQ 001, ARQ001."""
    m = re.match(r'^\s*([A-Za-z]{2,4})[-_. ]?(\d{1,4})\s*$', sheet_number or u'')
    if not m:
        return None, None
    return m.group(1).upper(), m.group(2).zfill(3)


def dados_da_obra():
    """Le codigo e nome da obra das Informacoes do Projeto; pergunta se faltar."""
    info = doc.ProjectInformation
    codigo = param_texto(info, BuiltInParameter.PROJECT_NUMBER)
    nome = param_texto(info, BuiltInParameter.PROJECT_BUILDING_NAME)
    if not nome:
        nome = param_texto(info, BuiltInParameter.PROJECT_NAME)

    if not codigo or codigo.lower() in (u'numero do projeto', u'project number'):
        codigo = forms.ask_for_string(
            prompt=u'Código da obra (ex.: 20001).\n'
                   u'Dica: preencha "Número do projeto" nas Informações do '
                   u'Projeto para não precisar digitar de novo.',
            title=u'Código da obra')
    if not nome or nome.lower() in (u'nome do edificio', u'building name'):
        nome = forms.ask_for_string(
            prompt=u'Nome da obra (ex.: Vila Nord).\n'
                   u'Dica: preencha "Nome do edifício" nas Informações do '
                   u'Projeto para não precisar digitar de novo.',
            title=u'Nome da obra')
    if not codigo or not nome:
        return None, None, None
    return codigo.strip(), nome.strip(), camel(nome)


def exportar_pdf(pasta, sheet, nome_base):
    opcoes = PDFExportOptions()
    opcoes.Combine = True
    opcoes.FileName = nome_base
    ids = List[ElementId]()
    ids.Add(sheet.Id)
    doc.Export(pasta, ids, opcoes)
    return os.path.join(pasta, nome_base + u'.pdf')


def exportar_dwg(pasta, sheet, nome_base):
    """Exporta em subpasta temporaria e renomeia, porque o Revit as vezes
    acrescenta 'Sheet - ...' ao nome dependendo da versao."""
    tmp = os.path.join(pasta, u'_tmp_dwg_mn')
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    opcoes = DWGExportOptions()
    opcoes.MergedViews = True  # um DWG unico, sem xrefs por vista
    ids = List[ElementId]()
    ids.Add(sheet.Id)
    doc.Export(tmp, nome_base, ids, opcoes)

    destino = os.path.join(pasta, nome_base + u'.dwg')
    gerados = [f for f in os.listdir(tmp) if f.lower().endswith(u'.dwg')]
    if not gerados:
        shutil.rmtree(tmp)
        return None
    exato = nome_base + u'.dwg'
    origem = exato if exato in gerados else gerados[0]
    if os.path.exists(destino):
        os.remove(destino)
    shutil.move(os.path.join(tmp, origem), destino)
    shutil.rmtree(tmp)
    return destino


def main():
    # 1. Obra ------------------------------------------------------------
    obra_cod, obra_nome, obra_arquivo = dados_da_obra()
    if not obra_cod:
        forms.alert(u'Publicação cancelada — obra não informada.')
        return

    # 2. Folhas ----------------------------------------------------------
    todas = [s for s in FilteredElementCollector(doc).OfClass(ViewSheet)
             if not s.IsPlaceholder]
    if not todas:
        forms.alert(u'Este modelo não tem folhas (pranchas).')
        return
    folhas = forms.select_sheets(
        title=u'Quais pranchas publicar?',
        button_name=u'Publicar selecionadas')
    if not folhas:
        return

    # 3. O que exportar ---------------------------------------------------
    opcoes_menu = [u'PDF + DWG + manifesto', u'Só PDF + manifesto',
                   u'Só DWG + manifesto', u'Só manifesto (sem arquivos)']
    if not PDF_DISPONIVEL:
        opcoes_menu = [u'Só DWG + manifesto', u'Só manifesto (sem arquivos)']
    escolha = forms.CommandSwitchWindow.show(
        opcoes_menu,
        message=u'O que exportar? (o manifesto é o arquivo que o app importa)')
    if not escolha:
        return
    quer_pdf = u'PDF' in escolha
    quer_dwg = u'DWG' in escolha

    # 4. Pasta de destino -------------------------------------------------
    pasta = forms.pick_folder(
        title=u'Pasta de destino (ex.: a pasta da obra no Dropbox/SharePoint)')
    if not pasta:
        return

    # 5. Loop de publicacao ----------------------------------------------
    hoje = datetime.now().strftime('%d/%m/%Y')
    pranchas = []
    avisos = []
    linhas_tabela = []

    with forms.ProgressBar(title=u'Publicando pranchas... ({value} de {max_value})') as pb:
        for i, sheet in enumerate(folhas):
            pb.update_progress(i + 1, len(folhas))

            numero = sheet.SheetNumber
            titulo = sheet.Name
            sigla, num3 = parse_numero_folha(numero)

            if not sigla:
                avisos.append(u'{}: número fora do padrão SIGLA-NNN — prancha pulada.'.format(numero))
                continue
            disciplina = SIGLAS.get(sigla)
            if not disciplina:
                disciplina = sigla
                avisos.append(u'{}: sigla "{}" não está na tabela oficial — '
                              u'usada como está.'.format(numero, sigla))

            rev_texto = param_texto(sheet, BuiltInParameter.SHEET_CURRENT_REVISION)
            rev = rev_normalizada(rev_texto)
            if rev is None:
                if rev_texto:
                    avisos.append(u'{}: revisão "{}" não é numérica — usei R00. '
                                  u'Ajuste a numeração de revisões do projeto '
                                  u'para números.'.format(numero, rev_texto))
                rev = u'R00'

            data_rev = param_texto(sheet, BuiltInParameter.SHEET_CURRENT_REVISION_DATE) or hoje
            obs_rev = param_texto(sheet, BuiltInParameter.SHEET_CURRENT_REVISION_DESCRIPTION)
            autor = param_texto(sheet, BuiltInParameter.SHEET_DRAWN_BY)
            if autor.lower() in (u'autor', u'author', u''):
                autor = param_texto(sheet, BuiltInParameter.SHEET_DESIGNED_BY)

            nome_base = u'{}_{}_{}_{}'.format(obra_arquivo, sigla, num3, rev)

            arquivos = []
            if quer_pdf:
                try:
                    exportar_pdf(pasta, sheet, nome_base)
                    arquivos.append(u'PDF')
                except Exception as e:
                    avisos.append(u'{}: falha no PDF — {}'.format(numero, e))
            if quer_dwg:
                try:
                    if exportar_dwg(pasta, sheet, nome_base):
                        arquivos.append(u'DWG')
                    else:
                        avisos.append(u'{}: o Revit não gerou o DWG.'.format(numero))
                except Exception as e:
                    avisos.append(u'{}: falha no DWG — {}'.format(numero, e))

            pranchas.append({
                u'num': u'{}-{}'.format(sigla, num3),
                u'titulo': titulo,
                u'sigla': sigla,
                u'disc': disciplina,
                u'rev': rev,
                u'data': data_rev,
                u'autor': autor or u'—',
                u'obs': obs_rev,
                u'arquivo': nome_base,
            })
            linhas_tabela.append([u'{}-{}'.format(sigla, num3), titulo, rev,
                                  u' + '.join(arquivos) if arquivos else u'—'])

    if not pranchas:
        forms.alert(u'Nenhuma prancha dentro do padrão foi publicada.\n\n'
                    u'Use o botão "Conferir Nomenclatura" para ver o que ajustar.')
        return

    # 6. Manifesto --------------------------------------------------------
    manifesto = {
        u'formato': u'mn-manifesto-v1',
        u'gerado_em': datetime.now().strftime('%d/%m/%Y %H:%M'),
        u'origem': os.path.basename(doc.PathName) if doc.PathName else u'Revit',
        u'obra': {u'id': obra_cod, u'nome': obra_nome, u'arquivo': obra_arquivo},
        u'pranchas': pranchas,
    }
    caminho_manifesto = os.path.join(pasta, u'manifesto_pranchas.json')
    with codecs.open(caminho_manifesto, 'w', encoding='utf-8') as f:
        f.write(json.dumps(manifesto, ensure_ascii=False, indent=1))

    # 7. Relatorio --------------------------------------------------------
    output.print_md(u'# Publicação concluída — {} · {}'.format(obra_nome, obra_cod))
    output.print_md(u'**Pasta:** `{}`'.format(pasta))
    output.print_table(
        table_data=linhas_tabela,
        columns=[u'Prancha', u'Título', u'Revisão', u'Arquivos'])
    output.print_md(u'**Manifesto:** `{}`'.format(caminho_manifesto))
    output.print_md(u'Agora abra o aplicativo de obra em modo **Engenharia** e '
                    u'use **Importar do Revit**, escolhendo o arquivo '
                    u'`manifesto_pranchas.json`. As revisões anteriores são '
                    u'marcadas como superadas automaticamente.')
    if avisos:
        output.print_md(u'## Avisos ({})'.format(len(avisos)))
        for a in avisos:
            output.print_md(u'- ' + a)
    if not PDF_DISPONIVEL:
        output.print_md(u'> Este Revit não tem exportação nativa de PDF '
                        u'(precisa do Revit 2022 ou mais novo).')


if __name__ == '__main__':
    main()
