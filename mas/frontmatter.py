"""Leitura e escrita do cabeçalho YAML (frontmatter) dos nós de conhecimento.

Usa PyYAML quando disponível; caso contrário cai em um parser mínimo que cobre
o subconjunto plano gerado pelo próprio MAS (escalares e listas de escalares).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

try:  # pragma: no cover - depende do ambiente
    import yaml
except ModuleNotFoundError:  # pragma: no cover
    yaml = None

DELIMITADOR = "---"
CAMPOS_OBRIGATORIOS = ("insumo", "unidade_sienge", "centro_de_custo", "data_vigencia")
_ORDEM_PREFERIDA = list(CAMPOS_OBRIGATORIOS)
_PRECISA_ASPAS = re.compile(r"^[\s>|&*!%@`\[{]|[:#]\s|[:#]$|^$|^[-?]\s|\s$")


class FrontmatterInvalido(ValueError):
    """O arquivo não possui cabeçalho YAML delimitado por ``---``."""


def separar(texto: str) -> tuple[str, str]:
    """Devolve ``(bloco_yaml, corpo_markdown)``."""
    linhas = texto.lstrip("﻿").splitlines()
    if not linhas or linhas[0].strip() != DELIMITADOR:
        raise FrontmatterInvalido("nó sem cabeçalho YAML iniciado por '---'")
    for i in range(1, len(linhas)):
        if linhas[i].strip() == DELIMITADOR:
            return "\n".join(linhas[1:i]), "\n".join(linhas[i + 1 :]).strip("\n")
    raise FrontmatterInvalido("cabeçalho YAML não foi fechado por '---'")


def carregar(texto: str) -> tuple[dict[str, Any], str]:
    bloco, corpo = separar(texto)
    if yaml is not None:
        meta = yaml.safe_load(bloco) or {}
        if not isinstance(meta, dict):
            raise FrontmatterInvalido("cabeçalho YAML deve ser um mapa de campos")
    else:  # pragma: no cover - só sem PyYAML
        meta = _parse_simples(bloco)
    return meta, corpo


def serializar(meta: dict[str, Any], corpo: str) -> str:
    chaves = [c for c in _ORDEM_PREFERIDA if c in meta]
    chaves += sorted(k for k in meta if k not in _ORDEM_PREFERIDA)
    linhas = [DELIMITADOR]
    for chave in chaves:
        valor = meta[chave]
        if isinstance(valor, (list, tuple)):
            linhas.append(f"{chave}:")
            linhas.extend(f"  - {_escalar(item)}" for item in valor)
        else:
            linhas.append(f"{chave}: {_escalar(valor)}")
    linhas.append(DELIMITADOR)
    return "\n".join(linhas) + "\n\n" + corpo.strip("\n") + "\n"


def _escalar(valor: Any) -> str:
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, date):
        return valor.isoformat()
    texto = str(valor)
    if _PRECISA_ASPAS.search(texto) or texto.lower() in {"true", "false", "null", "yes", "no"}:
        return '"' + texto.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return texto


def _parse_simples(bloco: str) -> dict[str, Any]:  # pragma: no cover - fallback
    meta: dict[str, Any] = {}
    chave_atual: str | None = None
    for linha in bloco.splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        if linha.lstrip().startswith("- ") and chave_atual:
            meta.setdefault(chave_atual, [])
            if isinstance(meta[chave_atual], list):
                meta[chave_atual].append(_valor_simples(linha.lstrip()[2:]))
            continue
        if ":" not in linha:
            continue
        chave, _, valor = linha.partition(":")
        chave_atual = chave.strip()
        valor = valor.strip()
        if not valor:
            meta[chave_atual] = []
        elif valor.startswith("[") and valor.endswith("]"):
            itens = [i.strip() for i in valor[1:-1].split(",") if i.strip()]
            meta[chave_atual] = [_valor_simples(i) for i in itens]
        else:
            meta[chave_atual] = _valor_simples(valor)
    return meta


def _valor_simples(bruto: str) -> Any:  # pragma: no cover - fallback
    texto = bruto.strip()
    if len(texto) >= 2 and texto[0] == texto[-1] and texto[0] in "\"'":
        return texto[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    baixo = texto.lower()
    if baixo in {"true", "yes"}:
        return True
    if baixo in {"false", "no"}:
        return False
    if baixo in {"null", "~", ""}:
        return None
    if re.fullmatch(r"-?\d+", texto):
        return int(texto)
    if re.fullmatch(r"-?\d+\.\d+", texto):
        return float(texto)
    return texto
