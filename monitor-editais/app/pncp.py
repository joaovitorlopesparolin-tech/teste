"""Cliente da API de consulta do PNCP.

Três comportamentos aqui não são detalhe de implementação — são o que separa um
retrato confiável de um número bonito e errado:

1. A resposta é decodificada como UTF-8 a partir dos *bytes*, ignorando o que o
   cabeçalho diz. Já apareceu "AquisiÃ§Ã£o" em produção, e texto corrompido faz
   o filtro de município não casar com nada e devolver zero sem erro.
2. Toda desistência vira uma `Falha` com a janela, a modalidade e a página que
   ela cobria. Página que não veio é edital que não entrou.
3. Bater no teto de páginas é falha, não aviso. A versão em PowerShell escrevia
   um aviso na tela e seguia, e o resumo final saía com cara de completo.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Callable

import httpx

BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
TAMANHO_PAGINA = 50
MAX_PAGINAS = 300


@dataclass(frozen=True)
class Falha:
    """Uma consulta que não pôde ser concluída, e o que ela cobria."""

    modalidade: int
    inicio: date
    fim: date
    pagina: int
    motivo: str  # http | rede | limite_de_taxa | teto | resposta_invalida
    http: int | None = None
    detalhe: str = ""

    def descrever(self) -> str:
        quando = f"{self.inicio:%d/%m/%Y} a {self.fim:%d/%m/%Y}"
        if self.motivo == "teto":
            return f"{quando} · página {self.pagina}: teto de páginas atingido, pode haver corte"
        if self.motivo == "limite_de_taxa":
            return f"{quando} · página {self.pagina}: o PNCP limitou a taxa de consulta"
        if self.motivo == "rede":
            return f"{quando} · página {self.pagina}: sem resposta da rede ({self.detalhe})"
        return f"{quando} · página {self.pagina}: HTTP {self.http}"


@dataclass
class ResultadoJanela:
    itens: list[dict] = field(default_factory=list)
    paginas_lidas: int = 0
    falhas: list[Falha] = field(default_factory=list)

    @property
    def completa(self) -> bool:
        return not self.falhas


def criar_cliente_http(timeout: float = 90.0) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        headers={"Accept": "application/json", "User-Agent": "monitor-editais/1.0"},
        follow_redirects=True,
    )


class ClientePNCP:
    def __init__(
        self,
        http: httpx.Client,
        *,
        dormir: Callable[[float], None] = time.sleep,
        tentativas_5xx: int = 1,
        tentativas_429: int = 3,
        pausa_entre_paginas: float = 0.12,
        max_paginas: int = MAX_PAGINAS,
    ) -> None:
        self._http = http
        self._dormir = dormir
        self._tentativas_5xx = tentativas_5xx
        self._tentativas_429 = tentativas_429
        self._pausa = pausa_entre_paginas
        self._max_paginas = max_paginas

    # ------------------------------------------------------------------ página

    def buscar_pagina(
        self, *, modalidade: int, inicio: date, fim: date, uf: str, pagina: int
    ) -> tuple[dict | None, Falha | None]:
        """Devolve (envelope, falha).

        (None, None) significa "sem conteúdo": a janela terminou normalmente.
        """
        parametros = {
            "dataInicial": f"{inicio:%Y%m%d}",
            "dataFinal": f"{fim:%Y%m%d}",
            "codigoModalidadeContratacao": modalidade,
            "uf": uf,
            "pagina": pagina,
            "tamanhoPagina": TAMANHO_PAGINA,
        }

        tentativas_rede = 0
        tentativas_servidor = 0
        tentativas_taxa = 0

        while True:
            try:
                resposta = self._http.get(BASE, params=parametros)
            except httpx.RequestError as erro:
                # A versão em PowerShell contava erro de rede como falha na hora.
                # Uma tentativa a mais evita marcar o retrato como parcial por
                # causa de uma oscilação de meio segundo.
                if tentativas_rede < 1:
                    tentativas_rede += 1
                    self._dormir(3)
                    continue
                return None, Falha(modalidade, inicio, fim, pagina, "rede",
                                   detalhe=type(erro).__name__)

            codigo = resposta.status_code

            if codigo == 204:
                return None, None

            if codigo == 429:
                # No PowerShell isto era recursão sem contador: com limite de taxa
                # persistente o script esperava cinco segundos para sempre, sem
                # erro e sem mensagem. Aqui a espera cresce e existe teto.
                if tentativas_taxa < self._tentativas_429:
                    tentativas_taxa += 1
                    self._dormir(5 * 2 ** (tentativas_taxa - 1))
                    continue
                return None, Falha(modalidade, inicio, fim, pagina, "limite_de_taxa", http=429)

            if codigo >= 500:
                if tentativas_servidor < self._tentativas_5xx:
                    tentativas_servidor += 1
                    self._dormir(3)
                    continue
                return None, Falha(modalidade, inicio, fim, pagina, "http", http=codigo)

            if codigo >= 400:
                return None, Falha(modalidade, inicio, fim, pagina, "http", http=codigo)

            bruto = resposta.content
            if not bruto:
                return None, None
            try:
                # De propósito a partir dos bytes: o cabeçalho do PNCP já veio
                # anunciando charset errado, e quem manda é o conteúdo.
                return json.loads(bruto.decode("utf-8-sig")), None
            except (UnicodeDecodeError, json.JSONDecodeError) as erro:
                return None, Falha(modalidade, inicio, fim, pagina, "resposta_invalida",
                                   http=codigo, detalhe=type(erro).__name__)

    # ------------------------------------------------------------------ janela

    def percorrer_janela(
        self, *, modalidade: int, inicio: date, fim: date, uf: str
    ) -> ResultadoJanela:
        resultado = ResultadoJanela()
        pagina = 1

        while True:
            envelope, falha = self.buscar_pagina(
                modalidade=modalidade, inicio=inicio, fim=fim, uf=uf, pagina=pagina
            )
            if falha is not None:
                resultado.falhas.append(falha)
                return resultado
            if envelope is None:
                return resultado

            itens = envelope.get("data") or []
            if not itens:
                return resultado

            resultado.itens.extend(itens)
            resultado.paginas_lidas += 1

            total_paginas = envelope.get("totalPaginas")
            restantes = envelope.get("paginasRestantes")
            if (total_paginas and pagina >= total_paginas) or (
                restantes is not None and restantes <= 0
            ):
                return resultado

            if pagina >= self._max_paginas:
                resultado.falhas.append(
                    Falha(modalidade, inicio, fim, pagina, "teto")
                )
                return resultado

            pagina += 1
            self._dormir(self._pausa)


# ---------------------------------------------------------------- conversão


def _data_curta(valor) -> str:
    if not valor:
        return ""
    texto = str(valor)
    return texto[:10] if len(texto) >= 10 else texto


def converter_item(item: dict, modalidade: int, nome_modalidade: str) -> dict:
    """Achata um registro da API no formato que o banco guarda."""
    unidade = item.get("unidadeOrgao") or {}
    orgao_entidade = item.get("orgaoEntidade") or {}

    orgao = orgao_entidade.get("razaoSocial") or unidade.get("nomeUnidade") or ""
    objeto = " ".join(str(item.get("objetoCompra") or "").split())

    valor = item.get("valorTotalEstimado")
    try:
        valor = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        valor = None

    return {
        "id_pncp": str(item.get("numeroControlePNCP") or ""),
        "publicacao": _data_curta(item.get("dataPublicacaoPncp")),
        "abertura": _data_curta(item.get("dataAberturaProposta")),
        "encerramento": _data_curta(item.get("dataEncerramentoProposta")),
        "municipio": str(unidade.get("municipioNome") or ""),
        "uf": str(unidade.get("ufSigla") or ""),
        "orgao": str(orgao),
        "modalidade_codigo": modalidade,
        "modalidade_nome": str(item.get("modalidadeNome") or nome_modalidade),
        "objeto": objeto,
        "valor": valor,
        "situacao": str(item.get("situacaoCompraNome") or ""),
        "link": str(item.get("linkSistemaOrigem") or ""),
    }
