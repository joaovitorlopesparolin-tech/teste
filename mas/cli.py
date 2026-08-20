"""Interface de linha de comando do Motor de Auditoria de Suprimentos."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from mas.auditoria import REPROVADO, auditar
from mas.conhecimento import BaseConhecimento, Registro
from mas.indexacao import DadosInsuficientes, indexar

BASE_PADRAO = "base_conhecimento"
CODIGO_ERRO = 1
CODIGO_REPROVADO = 2


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mas",
        description="Motor de Auditoria de Suprimentos — indexação de diretrizes e auditoria de solicitações.",
    )
    parser.add_argument("--base", default=BASE_PADRAO, help=f"diretório da base de conhecimento (padrão: {BASE_PADRAO})")
    sub = parser.add_subparsers(dest="comando", required=True)

    indexar_cmd = sub.add_parser("indexar", help="converte uma diretriz bruta em nó de conhecimento Markdown")
    indexar_cmd.add_argument("texto", nargs="?", default="-", help="arquivo com a diretriz ('-' para stdin)")
    indexar_cmd.add_argument("--insumo")
    indexar_cmd.add_argument("--unidade", dest="unidade_sienge")
    indexar_cmd.add_argument("--centro-de-custo", dest="centro_de_custo")
    indexar_cmd.add_argument("--vigencia", dest="data_vigencia")
    indexar_cmd.add_argument(
        "--alias",
        action="append",
        default=[],
        help="descrição alternativa do insumo no Sienge (repetível)",
    )
    indexar_cmd.add_argument("--saida", help="diretório de destino (padrão: --base)")
    indexar_cmd.add_argument("--sobrescrever", action="store_true")
    indexar_cmd.add_argument("--stdout", action="store_true", help="imprime o Markdown sem gravar em disco")

    auditar_cmd = sub.add_parser("auditar", help="valida uma Solicitação de Compra contra a base")
    auditar_cmd.add_argument("solicitacao", nargs="?", default="-", help="arquivo JSON da solicitação ('-' para stdin)")
    auditar_cmd.add_argument("--detalhado", action="store_true", help="inclui diagnóstico fora do protocolo")

    sub.add_parser("listar", help="lista os nós indexados na base")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = construir_parser()
    args = parser.parse_args(argv)
    try:
        if args.comando == "indexar":
            return _indexar(args)
        if args.comando == "auditar":
            return _auditar(args)
        return _listar(args)
    except (OSError, ValueError, json.JSONDecodeError) as erro:
        print(json.dumps({"erro": str(erro)}, ensure_ascii=False), file=sys.stderr)
        return CODIGO_ERRO


def _indexar(args: argparse.Namespace) -> int:
    texto = _ler(args.texto)
    registro = Registro.carregar(args.base) if Path(args.base).is_dir() else Registro()
    try:
        no = indexar(
            texto,
            insumo=args.insumo,
            unidade_sienge=args.unidade_sienge,
            centro_de_custo=args.centro_de_custo,
            data_vigencia=args.data_vigencia,
            registro=registro,
            extras={"aliases": args.alias} if args.alias else None,
        )
    except DadosInsuficientes as erro:
        print(json.dumps({"erro": str(erro), "campos_faltando": erro.faltando}, ensure_ascii=False), file=sys.stderr)
        return CODIGO_ERRO

    if args.stdout:
        sys.stdout.write(no.conteudo)
        return 0

    caminho = no.salvar(args.saida or args.base, sobrescrever=args.sobrescrever)
    _imprimir(
        {
            "arquivo": str(caminho),
            "insumo": no.meta["insumo"],
            "regras": [{"tipo": r.tipo, "descricao": r.descricao, "revisar": r.revisar} for r in no.regras],
            "projetos": no.projetos,
            "softwares": no.softwares,
        }
    )
    return 0


def _auditar(args: argparse.Namespace) -> int:
    solicitacao = json.loads(_ler(args.solicitacao))
    resposta = auditar(solicitacao, args.base, detalhado=args.detalhado)
    _imprimir(resposta)
    return CODIGO_REPROVADO if resposta["status"] == REPROVADO else 0


def _listar(args: argparse.Namespace) -> int:
    base = BaseConhecimento(args.base)
    _imprimir(
        {
            "base": str(base.diretorio),
            "nos": [
                {
                    "insumo": no.insumo,
                    "unidade_sienge": no.unidade_sienge,
                    "centro_de_custo": no.centro_de_custo,
                    "data_vigencia": no.data_vigencia.isoformat(),
                    "estrutural": no.estrutural,
                    "regras": len(no.regras),
                    "arquivo": str(no.caminho),
                }
                for no in base
            ],
            "erros": base.erros,
        }
    )
    return CODIGO_ERRO if base.erros else 0


def _ler(origem: str) -> str:
    if origem == "-":
        return sys.stdin.read()
    return Path(origem).read_text(encoding="utf-8")


def _imprimir(dados: Any) -> None:
    print(json.dumps(dados, ensure_ascii=False, indent=2))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
