# -*- coding: utf-8 -*-
"""Confere se as folhas do modelo seguem o padrao de nomenclatura
Martins Notari (SIGLA-NNN + revisao numerica), sem exportar nada.

Use antes de "Publicar Pranchas" para corrigir numeros fora do padrao.
"""

__title__ = 'Conferir\nNomenclatura'
__author__ = 'Martins Notari'

import re

from pyrevit import revit, script

from Autodesk.Revit.DB import FilteredElementCollector, ViewSheet, BuiltInParameter

doc = revit.doc
output = script.get_output()

SIGLAS_VALIDAS = [
    'ARQ', 'INT', 'PAI', 'LUM', 'IMP', 'ESQ', 'COM', 'ACU',
    'EST', 'FUN', 'EMT', 'DET',
    'HID', 'PLU', 'ELE', 'SPD', 'AVA', 'GAS', 'INC',
    'DAD', 'BMS', 'ELV',
    'TOP', 'TER', 'PAV',
]


def param_texto(elemento, builtin):
    p = elemento.get_Parameter(builtin)
    if p is None:
        return u''
    return (p.AsString() or u'').strip()


def conferir(sheet):
    """Retorna (situacao, detalhes) para uma folha."""
    numero = sheet.SheetNumber
    problemas = []
    sugestao = u''

    m = re.match(r'^\s*([A-Za-z]{2,4})[-_. ]?(\d{1,4})\s*$', numero or u'')
    if not m:
        problemas.append(u'número fora do padrão SIGLA-NNN')
    else:
        sigla = m.group(1).upper()
        digitos = m.group(2)
        if sigla not in SIGLAS_VALIDAS:
            problemas.append(u'sigla "{}" não está na tabela oficial'.format(sigla))
        if len(digitos) != 3:
            problemas.append(u'número com {} dígito(s) — o padrão pede 3'.format(len(digitos)))
        forma_certa = u'{}-{}'.format(sigla, digitos.zfill(3))
        if numero != forma_certa:
            sugestao = forma_certa

    rev_texto = param_texto(sheet, BuiltInParameter.SHEET_CURRENT_REVISION)
    if not rev_texto:
        problemas.append(u'sem revisão na folha (será publicada como R00)')
    elif not re.search(r'\d', rev_texto):
        problemas.append(u'revisão "{}" não é numérica'.format(rev_texto))

    return problemas, sugestao


def main():
    folhas = sorted(
        [s for s in FilteredElementCollector(doc).OfClass(ViewSheet)
         if not s.IsPlaceholder],
        key=lambda s: s.SheetNumber)
    if not folhas:
        output.print_md(u'Este modelo não tem folhas (pranchas).')
        return

    ok, com_problema = [], []
    for sheet in folhas:
        problemas, sugestao = conferir(sheet)
        if problemas:
            com_problema.append((sheet, problemas, sugestao))
        else:
            ok.append(sheet)

    output.print_md(u'# Conferência de nomenclatura — {} folha(s)'.format(len(folhas)))
    output.print_md(u'**No padrão:** {} · **Com pendência:** {}'.format(
        len(ok), len(com_problema)))

    if com_problema:
        linhas = []
        for sheet, problemas, sugestao in com_problema:
            linhas.append([
                sheet.SheetNumber,
                sheet.Name,
                u'; '.join(problemas),
                sugestao or u'—',
            ])
        output.print_table(
            table_data=linhas,
            columns=[u'Folha', u'Título', u'Pendência', u'Renumerar para'])
        output.print_md(u'Corrija o número/revisão das folhas acima e rode de '
                        u'novo. Quando tudo estiver no padrão, use '
                        u'**Publicar Pranchas**.')
    else:
        output.print_md(u'Tudo certo — pode usar **Publicar Pranchas**.')


if __name__ == '__main__':
    main()
