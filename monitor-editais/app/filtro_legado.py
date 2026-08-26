"""O filtro binário do PowerShell, reproduzido fielmente.

Existe por um motivo só: permitir conferir que a coleta portada traz os mesmos
editais que o script atual. Não é o filtro do produto.

O produto vai usar `relevancia.py` (etapa 4), onde termo negativo *subtrai
pontos* em vez de eliminar. A diferença não é estética: aqui, um objeto como
"Reforma da UBS Vila C, incluindo aquisição de material" é descartado por
"aquisicao de material" antes de "reforma" sequer ser consultada — e some sem
deixar rastro. Numa ferramenta feita para medir o que se perde, isso é o
problema, não a solução.
"""

from .config_inicial import NEGATIVAS, POSITIVAS
from .textos import normalizar


def e_obra(objeto: str | None, *, positivas=POSITIVAS, negativas=NEGATIVAS) -> bool:
    """Negativa vence, e vence antes de qualquer positiva ser olhada."""
    alvo = normalizar(objeto)
    for termo in negativas:
        if normalizar(termo) in alvo:
            return False
    for termo in positivas:
        if normalizar(termo) in alvo:
            return True
    return False


def motivo_do_descarte(objeto: str | None, *, positivas=POSITIVAS,
                       negativas=NEGATIVAS) -> str | None:
    """Qual termo negativo eliminou o objeto, e qual positiva ele tinha.

    Serve para medir o tamanho do falso negativo antes da etapa 4 existir.
    """
    alvo = normalizar(objeto)
    vetou = next((t for t in negativas if normalizar(t) in alvo), None)
    if vetou is None:
        return None
    tinha = [t for t in positivas if normalizar(t) in alvo]
    if not tinha:
        return None
    return f"vetado por “{vetou}” apesar de conter {', '.join(f'“{t}”' for t in tinha)}"
