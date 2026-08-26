"""Normalização de texto.

Acento corrompido ou acento presente onde a configuração não tem fazem o filtro
de município não casar com nada e devolver zero em silêncio. Por isso toda
comparação passa por aqui.
"""

import re
import unicodedata

_ESPACOS = re.compile(r"\s+")


def remover_acento(texto: str | None) -> str:
    """Devolve o texto em minúsculas e sem sinais diacríticos."""
    if not texto:
        return ""
    decomposto = unicodedata.normalize("NFD", texto)
    sem_marca = "".join(c for c in decomposto if not unicodedata.combining(c))
    return sem_marca.lower()


def normalizar(texto: str | None) -> str:
    """Sem acento, sem espaço repetido, sem espaço nas pontas."""
    return _ESPACOS.sub(" ", remover_acento(texto)).strip()


def contem(texto: str | None, termo: str) -> bool:
    """Casa por trecho, como o `.Contains` do PowerShell.

    É proposital: termos como "constru" e "pavimenta" existem justamente para
    pegar "construção", "construtora", "pavimentação" e "pavimentar".
    """
    return normalizar(termo) in normalizar(texto)
