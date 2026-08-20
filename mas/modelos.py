"""Estruturas de dados do MAS: regras, nós de conhecimento e solicitações."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

from mas.textos import normalizar, normalizar_centro_de_custo

BLOQUEIO_ORCAMENTARIO = "Bloqueio Orçamentário"
TRAVA_DUPLICIDADE = "Trava de Duplicidade"
PENDENCIA_TECNICA = "Pendência Técnica"
TIPOS_REGRA = (BLOQUEIO_ORCAMENTARIO, TRAVA_DUPLICIDADE, PENDENCIA_TECNICA)

JANELA_DUPLICIDADE_PADRAO = 15

#: Softwares que produzem extração de quantitativos (o Sienge é ERP, não modelo).
SOFTWARES_MODELAGEM = (
    "Revit", "Eberick", "AutoCAD", "Navisworks", "SketchUp", "TQS", "QiBuilder",
    "AltoQi", "Robot", "Civil 3D", "BIM 360", "Solibri",
)


class SolicitacaoInvalida(ValueError):
    """Payload da Solicitação de Compra sem os campos mínimos de auditoria."""


def como_data(valor: Any, campo: str = "data") -> date:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    if not texto:
        raise SolicitacaoInvalida(f"campo '{campo}' vazio")
    # Aceita ISO (com ou sem hora/timezone) e o formato brasileiro.
    iso = texto.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso).date()
    except ValueError:
        pass
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", texto):
        return datetime.strptime(texto, "%d/%m/%Y").date()
    raise SolicitacaoInvalida(f"campo '{campo}' com data inválida: {valor!r}")


def como_numero(valor: Any, campo: str) -> float:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)
    texto = str(valor).strip()
    # "1.234,56" (pt-BR) e "1234.56" (Sienge/JSON).
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})*(,\d+)?", texto):
        texto = texto.replace(".", "").replace(",", ".")
    else:
        texto = texto.replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        raise SolicitacaoInvalida(f"campo '{campo}' com número inválido: {valor!r}") from None


@dataclass(frozen=True)
class Regra:
    """Regra extraída de uma diretriz do setor de compras."""

    tipo: str
    descricao: str
    revisar: bool = False

    def como_linha(self) -> str:
        marca = " *(classificação automática — revisar)*" if self.revisar else ""
        return f"- **{self.tipo}:** {self.descricao}{marca}"


@dataclass
class NoConhecimento:
    """Nó indexado da base Markdown."""

    insumo: str
    unidade_sienge: str
    centro_de_custo: str
    data_vigencia: date
    regras: list[Regra] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    projetos: list[str] = field(default_factory=list)
    softwares: list[str] = field(default_factory=list)
    estrutural: bool = False
    janela_duplicidade_dias: int = JANELA_DUPLICIDADE_PADRAO
    tolerancia_quantitativo_percentual: float = 0.0
    unidades_bloqueadas: list[str] = field(default_factory=list)
    preco_unitario_maximo: float | None = None
    teto_orcamentario: float | None = None
    corpo: str = ""
    caminho: Path | None = None

    @property
    def chaves_insumo(self) -> set[str]:
        return {normalizar(self.insumo)} | {normalizar(a) for a in self.aliases}

    @property
    def chave_centro_de_custo(self) -> str:
        return normalizar_centro_de_custo(self.centro_de_custo)

    def casa_insumo(self, insumo: str) -> bool:
        alvo = normalizar(insumo)
        return any(alvo == chave or alvo.startswith(chave) or chave.startswith(alvo) for chave in self.chaves_insumo)

    @property
    def fontes_modelo(self) -> list[str]:
        """Softwares de modelagem citados no nó (exclui ERP e outros sistemas)."""
        conhecidos = {normalizar(s) for s in SOFTWARES_MODELAGEM}
        return [s for s in self.softwares if normalizar(s) in conhecidos]

    def regras_do_tipo(self, tipo: str) -> list[Regra]:
        return [r for r in self.regras if r.tipo == tipo]


@dataclass(frozen=True)
class Compra:
    """Item do array de compras recentes vindo da API do Sienge."""

    insumo: str
    centro_de_custo: str
    data_faturamento: date
    quantidade: float | None = None
    unidade: str | None = None
    documento: str | None = None

    @classmethod
    def de_dict(cls, dado: dict[str, Any]) -> "Compra":
        if not isinstance(dado, dict):
            raise SolicitacaoInvalida("cada item de 'compras_recentes' deve ser um objeto JSON")
        insumo = _primeiro(dado, "insumo", "descricao", "material", "produto")
        centro = _primeiro(dado, "centro_de_custo", "centro_custo", "centroCusto", "cost_center")
        data = _primeiro(dado, "data_faturamento", "dataFaturamento", "data", "data_nota", "data_emissao")
        if insumo is None or centro is None or data is None:
            raise SolicitacaoInvalida(
                "item de 'compras_recentes' exige 'insumo', 'centro_de_custo' e 'data_faturamento'"
            )
        quantidade = _primeiro(dado, "quantidade", "qtd", "quantity")
        return cls(
            insumo=str(insumo),
            centro_de_custo=str(centro),
            data_faturamento=como_data(data, "compras_recentes.data_faturamento"),
            quantidade=None if quantidade is None else como_numero(quantidade, "compras_recentes.quantidade"),
            unidade=_texto(_primeiro(dado, "unidade", "unidade_sienge", "un")),
            documento=_texto(
                _primeiro(dado, "documento", "nota_fiscal", "numero_nota", "pedido", "numero_pedido", "id")
            ),
        )


@dataclass(frozen=True)
class Quantitativo:
    """Quantidade extraída do modelo (Revit/Eberick) para compatibilização."""

    quantidade: float
    unidade: str | None = None
    fonte: str | None = None
    data_extracao: date | None = None

    @classmethod
    def de_dict(cls, dado: Any) -> "Quantitativo":
        if isinstance(dado, (int, float)) and not isinstance(dado, bool):
            return cls(quantidade=float(dado))
        if not isinstance(dado, dict):
            raise SolicitacaoInvalida("'quantitativo_modelo' deve ser objeto JSON ou número")
        quantidade = _primeiro(dado, "quantidade", "qtd", "quantity", "valor")
        if quantidade is None:
            raise SolicitacaoInvalida("'quantitativo_modelo' exige 'quantidade'")
        data = _primeiro(dado, "data_extracao", "data", "dataExtracao")
        return cls(
            quantidade=como_numero(quantidade, "quantitativo_modelo.quantidade"),
            unidade=_texto(_primeiro(dado, "unidade", "un")),
            fonte=_texto(_primeiro(dado, "fonte", "software", "origem", "modelo")),
            data_extracao=None if data is None else como_data(data, "quantitativo_modelo.data_extracao"),
        )


@dataclass
class Solicitacao:
    """Solicitação de Compra recebida para validação."""

    insumo: str
    centro_de_custo: str
    quantidade: float
    unidade: str
    data_solicitacao: date
    numero: str | None = None
    solicitante: str | None = None
    projeto: str | None = None
    valor_unitario: float | None = None
    valor_total: float | None = None
    saldo_orcamentario: float | None = None
    quantitativo_modelo: Quantitativo | None = None
    compras_recentes: list[Compra] = field(default_factory=list)

    @property
    def chave_centro_de_custo(self) -> str:
        return normalizar_centro_de_custo(self.centro_de_custo)

    @property
    def valor_total_efetivo(self) -> float | None:
        if self.valor_total is not None:
            return self.valor_total
        if self.valor_unitario is not None:
            return self.valor_unitario * self.quantidade
        return None

    @classmethod
    def de_dict(cls, dado: dict[str, Any]) -> "Solicitacao":
        if not isinstance(dado, dict):
            raise SolicitacaoInvalida("a Solicitação de Compra deve ser um objeto JSON")
        dado = _achatar(dado)
        obrigatorios = {
            "insumo": _primeiro(dado, "insumo", "descricao", "material", "produto"),
            "centro_de_custo": _primeiro(dado, "centro_de_custo", "centro_custo", "centroCusto", "cost_center"),
            "quantidade": _primeiro(dado, "quantidade", "qtd", "quantity"),
            "unidade": _primeiro(dado, "unidade", "un", "unidade_medida"),
            "data_solicitacao": _primeiro(dado, "data_solicitacao", "dataSolicitacao", "data", "data_pedido"),
        }
        faltando = [campo for campo, valor in obrigatorios.items() if valor in (None, "")]
        if faltando:
            raise SolicitacaoInvalida("campos obrigatórios ausentes: " + ", ".join(sorted(faltando)))

        historico = _primeiro(dado, "compras_recentes", "historico_sienge", "historico", "comprasRecentes") or []
        if not isinstance(historico, list):
            raise SolicitacaoInvalida("'compras_recentes' deve ser uma lista")
        quantitativo = _primeiro(dado, "quantitativo_modelo", "quantitativo", "extracao_modelo", "quantitativoModelo")
        valor_unitario = _primeiro(dado, "valor_unitario", "preco_unitario", "valorUnitario")
        valor_total = _primeiro(dado, "valor_total", "valorTotal")
        saldo = _primeiro(dado, "saldo_orcamentario", "saldo", "saldoOrcamentario", "verba_disponivel")

        return cls(
            insumo=str(obrigatorios["insumo"]),
            centro_de_custo=str(obrigatorios["centro_de_custo"]),
            quantidade=como_numero(obrigatorios["quantidade"], "quantidade"),
            unidade=str(obrigatorios["unidade"]),
            data_solicitacao=como_data(obrigatorios["data_solicitacao"], "data_solicitacao"),
            numero=_texto(_primeiro(dado, "numero", "numero_solicitacao", "id", "codigo")),
            solicitante=_texto(_primeiro(dado, "solicitante", "requisitante", "usuario")),
            projeto=_texto(_primeiro(dado, "projeto", "obra", "empreendimento")),
            valor_unitario=None if valor_unitario is None else como_numero(valor_unitario, "valor_unitario"),
            valor_total=None if valor_total is None else como_numero(valor_total, "valor_total"),
            saldo_orcamentario=None if saldo is None else como_numero(saldo, "saldo_orcamentario"),
            quantitativo_modelo=None if quantitativo is None else Quantitativo.de_dict(quantitativo),
            compras_recentes=[Compra.de_dict(item) for item in historico],
        )


@dataclass(frozen=True)
class Divergencia:
    """Divergência encontrada por um dos checks da auditoria."""

    tipo: str
    motivo: str
    acao: str
    check: str


def _achatar(dado: dict[str, Any]) -> dict[str, Any]:
    """Aceita o payload com a solicitação aninhada em 'solicitacao'/'solicitacao_de_compra'."""
    for chave in ("solicitacao", "solicitacao_de_compra", "solicitacaoCompra", "requisicao"):
        aninhado = dado.get(chave)
        if isinstance(aninhado, dict):
            mesclado = {**aninhado}
            for k, v in dado.items():
                if k != chave and k not in mesclado:
                    mesclado[k] = v
            return mesclado
    return dado


def _primeiro(dado: dict[str, Any], *chaves: str) -> Any:
    for chave in chaves:
        if chave in dado and dado[chave] is not None:
            return dado[chave]
    return None


def _texto(valor: Any) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None
