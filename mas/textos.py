"""Normalização de texto usada para casar insumos, centros de custo e unidades."""

from __future__ import annotations

import re
import unicodedata

_NAO_ALFANUM = re.compile(r"[^a-z0-9]+")
_ESPACOS = re.compile(r"\s+")


def remover_acentos(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def normalizar(texto: str) -> str:
    """Chave canônica para comparação (sem acento, sem pontuação, minúscula)."""
    base = remover_acentos(str(texto)).lower()
    return _NAO_ALFANUM.sub(" ", base).strip()


def normalizar_centro_de_custo(texto: str) -> str:
    """Centro de custo do Sienge: compara pelo código quando houver.

    ``"02.01.03 - Estrutura"`` e ``"02.01.03"`` apontam para o mesmo centro.
    """
    bruto = str(texto).strip()
    codigo = re.match(r"^[\d][\d.\-/]*", bruto)
    if codigo:
        return codigo.group(0).rstrip(".-/")
    return normalizar(bruto)


def slug(texto: str) -> str:
    base = normalizar(texto)
    return _ESPACOS.sub("-", base) or "sem-titulo"


def sentencas(texto: str) -> list[str]:
    """Quebra o texto bruto em regras candidatas (linhas, itens e frases)."""
    partes: list[str] = []
    for linha in texto.splitlines():
        limpa = linha.strip().lstrip("-*•").strip()
        limpa = re.sub(r"^\d+[.)]\s*", "", limpa)
        if not limpa:
            continue
        for frase in re.split(r"(?<=[.;!?])\s+(?=[A-ZÀ-Ú])", limpa):
            frase = frase.strip()
            if len(frase) > 3:
                partes.append(frase)
    return partes
