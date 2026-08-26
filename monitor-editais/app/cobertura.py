"""Cobertura de uma coleta, e números que carregam a própria cobertura.

Regra do projeto: nenhum total circula sozinho. `contar_editais` devolve uma
`Contagem`, não um `int`, porque um número sem a cobertura da coleta que o
produziu é exatamente o que o item 14 do escopo proíbe. Uma coleta com falha
só pode *subestimar* — página que não veio é edital que não entrou — então o
número parcial se apresenta como "≥ 1.284".
"""

from dataclasses import dataclass


def formatar_milhar(valor: int | float) -> str:
    return f"{valor:,.0f}".replace(",", ".")


@dataclass(frozen=True)
class Cobertura:
    planejadas: int
    concluidas: int
    falhas: int

    @property
    def completa(self) -> bool:
        return self.falhas == 0 and self.concluidas >= self.planejadas

    @property
    def status(self) -> str:
        if self.planejadas and self.concluidas == 0:
            return "falhou"
        return "completa" if self.completa else "parcial"

    def resumir(self) -> str:
        return f"{self.concluidas} de {self.planejadas} consultas responderam"


@dataclass(frozen=True)
class Contagem:
    """Um total e a garantia que ele carrega."""

    valor: int
    completa: bool

    def __str__(self) -> str:
        prefixo = "" if self.completa else "≥ "
        return f"{prefixo}{formatar_milhar(self.valor)}"

    def __int__(self) -> int:
        return self.valor
