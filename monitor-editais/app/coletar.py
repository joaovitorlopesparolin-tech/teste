"""Linha de comando da coleta — a etapa 1 do monitor, ainda sem interface.

    python -m app.coletar --meses 1
    python -m app.coletar --meses 6 --uf-inteira
    python -m app.coletar --amostra

Serve para conferir que o porte traz os mesmos editais que o retrato-pncp.ps1
na mesma janela de datas, e para medir de saída duas coisas que o script atual
não mede: quanto da coleta ficou de fora, e quantos editais o filtro binário
descarta apesar de conterem termo de obra.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from . import banco, config_inicial, filtro_legado, modalidades as _modalidades
from .textos import remover_acento
from .cobertura import Contagem, formatar_milhar
from .coleta import Progresso, executar
from .pncp import ClientePNCP, criar_cliente_http

COLUNAS_CSV = ("publicacao", "abertura", "encerramento", "municipio", "orgao",
               "modalidade_nome", "objeto", "valor", "situacao", "id_pncp", "link")


def _argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    analisador = argparse.ArgumentParser(
        prog="python -m app.coletar",
        description="Coleta editais do PNCP e grava no banco local.",
    )
    analisador.add_argument("--meses", type=int, default=6,
                            help="quantos meses para trás (padrão: 6)")
    analisador.add_argument("--uf", default=config_inicial.UF)
    analisador.add_argument("--dias-por-janela", type=int,
                            default=config_inicial.DIAS_POR_JANELA)
    analisador.add_argument("--com-dispensa", action="store_true",
                            help="inclui dispensa e inexigibilidade")
    analisador.add_argument("--uf-inteira", action="store_true",
                            help="não recorta pela região configurada")
    analisador.add_argument("--banco", default="dados/monitor.sqlite3")
    analisador.add_argument("--csv", default=None,
                            help="grava também um CSV, para conferir contra o PowerShell")
    analisador.add_argument("--amostra", action="store_true",
                            help="busca uma página e mostra um registro cru da API")
    return analisador.parse_args(argv)


def _amostra(cliente: ClientePNCP, uf: str) -> int:
    fim = date.today()
    inicio = fim - timedelta(days=45)
    print("\nConsultando uma página para conferir a API...")
    envelope, falha = cliente.buscar_pagina(
        modalidade=6, inicio=inicio, fim=fim, uf=uf, pagina=1
    )
    if falha is not None:
        print(f"  não deu certo: {falha.descrever()}")
        return 1
    if envelope is None:
        print("  a API respondeu sem conteúdo para esse período.")
        return 1

    print("\nCampos do envelope:")
    for chave in envelope:
        print(f"  {chave}")
    dados = envelope.get("data") or []
    if dados:
        print("\n--- registro cru ---")
        print(json.dumps(dados[0], indent=2, ensure_ascii=False))
    return 0


def _mostrar_progresso(progresso: Progresso) -> None:
    aviso = f"  ! {progresso.falhas} falha(s)" if progresso.falhas else ""
    linha = f"\r  {progresso.descrever()}{aviso}"
    sys.stdout.write(linha.ljust(96)[:96])
    sys.stdout.flush()


def _retrato(conexao, resultado, *, municipios, uf_inteira: bool) -> None:
    cobertura = resultado.cobertura
    total = banco.contar_editais(conexao, resultado.coleta_id)
    na_regiao = (total if uf_inteira
                 else banco.contar_editais(conexao, resultado.coleta_id,
                                           municipios=municipios))

    print("\n" + "=" * 68)
    print("RETRATO")
    print("=" * 68)

    if resultado.interrompida:
        print("  interrompida por você — o que já veio está guardado.\n")
    if cobertura.status == "falhou":
        print("  NENHUMA consulta respondeu. Isto não é um retrato do PNCP —")
        print("  é uma falha de coleta. Não leia os números abaixo como resposta.\n")
    if cobertura.completa:
        print(f"  cobertura .......... completa ({cobertura.resumir()})")
    else:
        print(f"  cobertura .......... PARCIAL ({cobertura.resumir()})")
        print(f"  {len(resultado.falhas)} consulta(s) não puderam ser concluídas:")
        for falha in resultado.falhas[:12]:
            print(f"     · {_modalidades.por_codigo(falha.modalidade).nome} — {falha.descrever()}")
        if len(resultado.falhas) > 12:
            print(f"     · e mais {len(resultado.falhas) - 12}")
        print("  Os números abaixo são o mínimo garantido, não o total.")
        print(f"  {_conselho(resultado.falhas)}")

    print(f"\n  editais trazidos ... {total}")
    if not uf_inteira:
        print(f"  dentro da região ... {na_regiao}")
    print(f"  páginas lidas ...... {resultado.paginas_lidas}")

    linhas = banco.editais_da_coleta(conexao, resultado.coleta_id)
    obras = [l for l in _no_recorte(linhas, municipios, uf_inteira)
             if filtro_legado.e_obra(l["objeto"])]
    print(f"  obra / engenharia .. {Contagem(len(obras), cobertura.completa)}"
          "   <<< o número comparável ao PowerShell")

    valores = sorted(l["valor"] for l in obras if l["valor"] is not None)
    if valores:
        soma = sum(valores)
        mediana = valores[len(valores) // 2]
        print(f"  soma estimada ...... R$ {formatar_milhar(soma)}")
        print(f"  mediana ............ R$ {formatar_milhar(mediana)}")

    # O que o filtro binário joga fora apesar de conter termo de obra.
    descartados = []
    for linha in _no_recorte(linhas, municipios, uf_inteira):
        motivo = filtro_legado.motivo_do_descarte(linha["objeto"])
        if motivo:
            descartados.append((linha, motivo))
    if descartados:
        print(f"\n  ATENÇÃO — {len(descartados)} edital(is) foram descartados por termo")
        print("  negativo apesar de conterem termo de obra. Exemplos:")
        for linha, motivo in descartados[:5]:
            print(f"     · {linha['objeto'][:78]}")
            print(f"       {motivo}")
        print("  Na etapa 4 estes deixam de sumir: negativa passa a subtrair pontos.")

    if not uf_inteira and int(na_regiao) == 0 and int(total) > 0:
        print("\n  ! Nenhum edital caiu na região configurada.")
        print("    Municípios que a API devolveu (os mais frequentes):")
        for nome, quantos in banco.municipios_mais_frequentes(conexao, resultado.coleta_id):
            print(f"      {quantos:5}  {nome}")

    print("\n  Agora a pergunta que o painel vai responder:")
    print("  de quantos desses vocês souberam?\n")


def _conselho(falhas) -> str:
    """A dica precisa casar com o motivo. Conselho errado é pior que nenhum."""
    motivos = {falha.motivo for falha in falhas}
    if motivos & {"rede"}:
        return ("Foi a rede, não o PNCP: confira a conexão, o proxy da empresa "
                "e se o firewall libera pncp.gov.br.")
    if "limite_de_taxa" in motivos:
        return "O PNCP limitou a taxa de consulta. Tente de novo daqui a alguns minutos."
    if "teto" in motivos:
        return ("A janela tinha páginas demais: rode de novo com "
                "--dias-por-janela 5 para fatiar mais fino.")
    return "Rodar de novo com --dias-por-janela 5 costuma resolver."


def _no_recorte(linhas, municipios, uf_inteira: bool):
    if uf_inteira:
        return list(linhas)
    alvo = {remover_acento(m) for m in municipios}
    return [l for l in linhas if remover_acento(l["municipio"]) in alvo]


def _gravar_csv(caminho: str, linhas) -> None:
    destino = Path(caminho)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", newline="", encoding="utf-8-sig") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_CSV, delimiter=";",
                                  extrasaction="ignore")
        escritor.writeheader()
        for linha in linhas:
            escritor.writerow({coluna: linha[coluna] for coluna in COLUNAS_CSV})
    print(f"  CSV em: {destino.resolve()}")


def principal(argv: list[str] | None = None) -> int:
    opcoes = _argumentos(argv)
    http = criar_cliente_http()
    cliente = ClientePNCP(http)

    try:
        if opcoes.amostra:
            return _amostra(cliente, opcoes.uf)

        fim = date.today()
        inicio = fim - timedelta(days=30 * opcoes.meses)
        escolhidas = _modalidades.padrao(com_dispensa=opcoes.com_dispensa)

        conexao = banco.abrir(opcoes.banco)
        print(f"\nPNCP · {opcoes.uf} · {opcoes.meses} mês(es) · "
              f"{'UF inteira' if opcoes.uf_inteira else f'{len(config_inicial.REGIAO)} municípios'}")
        print("  modalidades: " + ", ".join(m.nome for m in escolhidas))
        if not opcoes.com_dispensa:
            print("  (dispensa e inexigibilidade fora — use --com-dispensa para incluir)")
        print()

        resultado = executar(
            cliente, conexao,
            uf=opcoes.uf, data_inicial=inicio, data_final=fim,
            modalidades=escolhidas, dias_por_janela=opcoes.dias_por_janela,
            ao_progredir=_mostrar_progresso,
        )
        sys.stdout.write("\r" + " " * 96 + "\r")

        _retrato(conexao, resultado, municipios=config_inicial.REGIAO,
                 uf_inteira=opcoes.uf_inteira)

        if opcoes.csv:
            linhas = _no_recorte(
                banco.editais_da_coleta(conexao, resultado.coleta_id),
                config_inicial.REGIAO, opcoes.uf_inteira,
            )
            _gravar_csv(opcoes.csv, [l for l in linhas if filtro_legado.e_obra(l["objeto"])])

        conexao.close()
        return 0 if resultado.cobertura.completa else 2
    finally:
        http.close()


if __name__ == "__main__":
    raise SystemExit(principal())
