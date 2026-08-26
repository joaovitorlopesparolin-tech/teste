"""Um PNCP de mentira, para os testes não dependerem da rede."""

import json
from datetime import date

import httpx

from app.pncp import ClientePNCP


def resposta_json(dados: dict, *, status: int = 200,
                  content_type: str = "application/json") -> httpx.Response:
    corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
    return httpx.Response(status, content=corpo,
                          headers={"Content-Type": content_type})


def pagina(itens: list[dict], *, total_paginas: int = 1) -> dict:
    return {"data": itens, "totalPaginas": total_paginas,
            "paginasRestantes": max(0, total_paginas - 1)}


def edital(id_pncp: str = "PNCP-1", objeto: str = "Pavimentação de vias",
           municipio: str = "Foz do Iguaçu", valor: float = 100000.0) -> dict:
    return {
        "numeroControlePNCP": id_pncp,
        "objetoCompra": objeto,
        "valorTotalEstimado": valor,
        "dataPublicacaoPncp": "2026-08-21T10:00:00",
        "dataAberturaProposta": "2026-08-25T09:00:00",
        "dataEncerramentoProposta": "2026-09-15T09:00:00",
        "modalidadeNome": "Pregão Eletrônico",
        "situacaoCompraNome": "Divulgada no PNCP",
        "linkSistemaOrigem": "https://exemplo/1",
        "unidadeOrgao": {"municipioNome": municipio, "ufSigla": "PR",
                         "nomeUnidade": "Secretaria de Obras"},
        "orgaoEntidade": {"razaoSocial": "Município de Foz do Iguaçu"},
    }


class Espiao:
    """Conta chamadas e devolve respostas roteirizadas."""

    def __init__(self, roteiro):
        self.roteiro = roteiro
        self.chamadas: list[httpx.Request] = []

    def __call__(self, requisicao: httpx.Request) -> httpx.Response:
        self.chamadas.append(requisicao)
        if len(self.chamadas) > 40:  # rede de segurança contra laço infinito
            raise AssertionError("consultas demais — provável laço infinito")
        if callable(self.roteiro):
            return self.roteiro(requisicao, len(self.chamadas))
        indice = min(len(self.chamadas) - 1, len(self.roteiro) - 1)
        return self.roteiro[indice]

    @property
    def quantas(self) -> int:
        return len(self.chamadas)


def montar(roteiro, **opcoes) -> tuple[ClientePNCP, Espiao]:
    espiao = Espiao(roteiro)
    http = httpx.Client(transport=httpx.MockTransport(espiao))
    opcoes.setdefault("dormir", lambda _: None)
    opcoes.setdefault("pausa_entre_paginas", 0)
    return ClientePNCP(http, **opcoes), espiao


JANELA = {"modalidade": 6, "inicio": date(2026, 8, 1),
          "fim": date(2026, 8, 10), "uf": "PR"}
