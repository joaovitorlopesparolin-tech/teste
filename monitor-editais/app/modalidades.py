"""Modalidades de contratação do PNCP.

Guardadas como sequência de objetos e sempre buscadas por código. A versão em
PowerShell usou uma tabela hash indexada por número, que no PowerShell devolve
o item pela *posição* e não pela chave — todas as modalidades saíam rotuladas
erradas, sem erro nenhum na tela. `por_codigo` existe para que isso não se
repita, e há um teste que fixa esse comportamento.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Modalidade:
    codigo: int
    nome: str
    dispensavel: bool = False


MODALIDADES: tuple[Modalidade, ...] = (
    Modalidade(4, "Concorrência Eletrônica"),
    Modalidade(5, "Concorrência Presencial"),
    Modalidade(6, "Pregão Eletrônico"),
    Modalidade(7, "Pregão Presencial"),
    Modalidade(8, "Dispensa", dispensavel=True),
    Modalidade(9, "Inexigibilidade", dispensavel=True),
)


def por_codigo(codigo: int) -> Modalidade:
    for modalidade in MODALIDADES:
        if modalidade.codigo == codigo:
            return modalidade
    raise KeyError(f"modalidade desconhecida: {codigo}")


def padrao(com_dispensa: bool = False) -> tuple[Modalidade, ...]:
    """Dispensa e inexigibilidade ficam fora por padrão: volume alto, relevância
    baixa para obra. Continua sendo escolha de quem opera."""
    if com_dispensa:
        return MODALIDADES
    return tuple(m for m in MODALIDADES if not m.dispensavel)
