"""Fixtures compartilhadas pelos testes."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from mas.conhecimento import BaseConhecimento

NO_CONCRETO = """---
insumo: Concreto Usinado FCK 30 MPa
unidade_sienge: m³
centro_de_custo: 02.01.03 - Estrutura
data_vigencia: 2026-01-05
aliases:
  - CONCRETO USINADO 30MPA
estrutural: true
janela_duplicidade_dias: 15
tolerancia_quantitativo_percentual: 3.0
preco_unitario_maximo: 480.0
unidades_bloqueadas:
  - caminhao
softwares:
  - Eberick
  - Revit
  - Sienge
projetos:
  - Projeto Recanto
---

# Concreto Usinado FCK 30 MPa

## Regras

- **Trava de Duplicidade:** Nova solicitação do mesmo insumo em menos de 15 dias fica bloqueada.
- **Pendência Técnica:** Volume alinhado ao quantitativo do [[Eberick]].
- **Bloqueio Orçamentário:** Preço unitário máximo de R$ 480,00 por m³.
"""

NO_CIMENTO = """---
insumo: Cimento Portland CP II-Z-32
unidade_sienge: sc
centro_de_custo: "*"
data_vigencia: 2026-01-01
estrutural: false
teto_orcamentario: 25000.0
---

# Cimento Portland CP II-Z-32

## Regras

- **Bloqueio Orçamentário:** Teto de R$ 25.000,00 por pedido.
"""


class TesteComBase(unittest.TestCase):
    """Cria uma base de conhecimento temporária com dois nós."""

    nos: dict[str, str] = {"concreto.md": NO_CONCRETO, "cimento.md": NO_CIMENTO}

    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.diretorio = Path(self._temp.name)
        for nome, conteudo in self.nos.items():
            (self.diretorio / nome).write_text(conteudo, encoding="utf-8")
        self.addCleanup(self._temp.cleanup)
        self.base = BaseConhecimento(self.diretorio)

    def solicitacao(self, **campos):
        pedido = {
            "insumo": "Concreto Usinado FCK 30 MPa",
            "centro_de_custo": "02.01.03 - Estrutura",
            "quantidade": 20.0,
            "unidade": "m³",
            "data_solicitacao": "2026-03-10",
            "quantitativo_modelo": {"quantidade": 20.0, "unidade": "m³", "fonte": "Eberick"},
            "compras_recentes": [],
        }
        pedido.update(campos)
        return {k: v for k, v in pedido.items() if v is not None}
