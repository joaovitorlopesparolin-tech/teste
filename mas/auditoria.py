"""Fluxo de Validação (modo auditoria): Solicitação de Compra -> JSON de protocolo."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Iterable

from mas import unidades
from mas.conhecimento import BaseConhecimento
from mas.modelos import (
    BLOQUEIO_ORCAMENTARIO,
    Compra,
    Divergencia,
    NoConhecimento,
    PENDENCIA_TECNICA,
    Solicitacao,
    SolicitacaoInvalida,
    TRAVA_DUPLICIDADE,
)
from mas.textos import normalizar, normalizar_centro_de_custo

APROVADO = "APROVADO"
REPROVADO = "REPROVADO"

#: Centros de custo curinga: o nó vale para qualquer centro ("*" normaliza para vazio).
CURINGAS = {"", "todos", "qualquer", "todos os centros", "n a"}

_ORDEM_CHECKS = (
    "Indexação",
    "Check de Histórico",
    "Check de Compatibilização",
    "Check de Padrão",
    "Check Orçamentário",
)


def auditar(
    solicitacao: Solicitacao | dict[str, Any],
    base: BaseConhecimento | str | Path,
    *,
    detalhado: bool = False,
) -> dict[str, Any]:
    """Audita a solicitação e devolve o objeto do Protocolo de Resposta."""
    if not isinstance(base, BaseConhecimento):
        base = BaseConhecimento(base)

    try:
        pedido = solicitacao if isinstance(solicitacao, Solicitacao) else Solicitacao.de_dict(solicitacao)
    except SolicitacaoInvalida as erro:
        return _resposta(
            [
                Divergencia(
                    tipo=PENDENCIA_TECNICA,
                    motivo=f"Solicitação de Compra inconsistente: {erro}.",
                    acao="Reenvie a solicitação com todos os campos exigidos pela integração Sienge.",
                    check="Indexação",
                )
            ],
            detalhado=detalhado,
        )

    no = base.buscar(pedido.insumo, pedido.centro_de_custo, pedido.data_solicitacao)
    if no is None:
        return _resposta(
            [
                Divergencia(
                    tipo=PENDENCIA_TECNICA,
                    motivo=(
                        f"Insumo '{pedido.insumo}' não possui nó de conhecimento indexado na base; "
                        "não há diretriz vigente do setor de compras para validar o pedido."
                    ),
                    acao=(
                        "Encaminhe a diretriz do setor de compras para indexação (Fluxo de Indexação) "
                        "e reenvie a solicitação após a criação do nó."
                    ),
                    check="Indexação",
                )
            ],
            detalhado=detalhado,
        )

    divergencias: list[Divergencia] = []
    divergencias += _check_indexacao(pedido, no)
    divergencias += _check_historico(pedido, no)
    divergencias += _check_padrao(pedido, no)
    divergencias += _check_compatibilizacao(pedido, no)
    divergencias += _check_orcamentario(pedido, no)
    return _resposta(divergencias, detalhado=detalhado, no=no, pedido=pedido)


# --------------------------------------------------------------------------- checks


def _check_indexacao(pedido: Solicitacao, no: NoConhecimento) -> list[Divergencia]:
    """Vigência da diretriz e aderência do centro de custo ao nó encontrado."""
    achados: list[Divergencia] = []
    if no.data_vigencia > pedido.data_solicitacao:
        achados.append(
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"A diretriz indexada para '{no.insumo}' só entra em vigência em "
                    f"{_data(no.data_vigencia)}, posterior à data da solicitação ({_data(pedido.data_solicitacao)})."
                ),
                acao="Confirme com o setor de compras a diretriz vigente na data do pedido e reindexe o nó.",
                check="Indexação",
            )
        )
    curinga = normalizar(no.centro_de_custo)
    if curinga and curinga not in CURINGAS and no.chave_centro_de_custo != pedido.chave_centro_de_custo:
        achados.append(
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"Centro de custo da solicitação ('{pedido.centro_de_custo}') difere do centro de custo "
                    f"da regra indexada ('{no.centro_de_custo}')."
                ),
                acao=(
                    "Corrija o centro de custo no Sienge ou solicite a indexação de uma diretriz específica "
                    "para este centro de custo."
                ),
                check="Indexação",
            )
        )
    return achados


def _check_historico(pedido: Solicitacao, no: NoConhecimento) -> list[Divergencia]:
    """Trava de Duplicidade: mesmo insumo + mesmo centro de custo dentro da janela."""
    janela = no.janela_duplicidade_dias
    colisoes = [
        (compra, abs((pedido.data_solicitacao - compra.data_faturamento).days))
        for compra in pedido.compras_recentes
        if _mesmo_insumo(compra, pedido, no) and _mesmo_centro(compra, pedido)
    ]
    colisoes = [(compra, dias) for compra, dias in colisoes if dias < janela]
    if not colisoes:
        return []

    compra, dias = min(colisoes, key=lambda item: item[1])
    documento = f", documento {compra.documento}" if compra.documento else ""
    quantidade = f" ({_num(compra.quantidade)} {compra.unidade or no.unidade_sienge})" if compra.quantidade is not None else ""
    return [
        Divergencia(
            tipo=TRAVA_DUPLICIDADE,
            motivo=(
                f"Duplicidade de faturamento: '{compra.insumo}'{quantidade} já foi faturado para o centro de custo "
                f"'{compra.centro_de_custo}' em {_data(compra.data_faturamento)}{documento}, há {dias} dia(s) — "
                f"dentro da janela de {janela} dias prevista na diretriz."
            ),
            acao=(
                f"Consulte o saldo em estoque/obra do pedido de {_data(compra.data_faturamento)} antes de comprar novamente. "
                f"Se o consumo já foi comprovado, anexe a medição e reapresente a solicitação após "
                f"{janela - dias} dia(s) ou com liberação formal do setor de compras."
            ),
            check="Check de Histórico",
        )
    ]


def _check_padrao(pedido: Solicitacao, no: NoConhecimento) -> list[Divergencia]:
    """Check de Padrão: unidade do pedido precisa ser a unidade do Sienge."""
    unidade = pedido.unidade
    bloqueadas = {normalizar(u) for u in no.unidades_bloqueadas}

    # A unidade cadastrada no nó prevalece: se o pedido veio nela, o padrão está atendido.
    if normalizar(unidade) not in bloqueadas and unidades.equivalentes(unidade, no.unidade_sienge):
        return []

    if unidades.eh_ambigua(unidade) or normalizar(unidade) in bloqueadas:
        return [
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"Unidade ambígua: '{unidade}' ({unidades.motivo_ambiguidade(unidade)}). "
                    f"A unidade cadastrada no Sienge para '{no.insumo}' é '{no.unidade_sienge}'."
                ),
                acao=(
                    f"Reemita a solicitação convertendo a quantidade para '{no.unidade_sienge}' "
                    "conforme a unidade de medida cadastrada no Sienge."
                ),
                check="Check de Padrão",
            )
        ]

    reconhecida = unidades.canonica(unidade)
    detalhe = "não corresponde à unidade cadastrada" if reconhecida else "não é uma unidade de medida reconhecida"
    return [
        Divergencia(
            tipo=PENDENCIA_TECNICA,
            motivo=(
                f"Unidade divergente do padrão Sienge: solicitado em '{unidade}' ({detalhe}), "
                f"enquanto '{no.insumo}' é cadastrado em '{no.unidade_sienge}'."
            ),
            acao=f"Converta a quantidade para '{no.unidade_sienge}' e reenvie a solicitação.",
            check="Check de Padrão",
        )
    ]


def _check_compatibilizacao(pedido: Solicitacao, no: NoConhecimento) -> list[Divergencia]:
    """Insumos estruturais precisam bater com a extração do modelo."""
    if not no.estrutural:
        return []

    fontes = no.fontes_modelo
    referencia = ", ".join(fontes) or "modelo estrutural de referência"
    quantitativo = pedido.quantitativo_modelo
    if quantitativo is None:
        return [
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"Insumo estrutural '{no.insumo}' enviado sem o quantitativo extraído do modelo "
                    f"({referencia}); a compatibilização de quantidades não pôde ser executada."
                ),
                acao=(
                    f"Anexe à solicitação o relatório de extração de quantitativos ({referencia}), "
                    "com quantidade, unidade e data da extração."
                ),
                check="Check de Compatibilização",
            )
        ]

    if fontes and quantitativo.fonte and not any(normalizar(s) == normalizar(quantitativo.fonte) for s in fontes):
        return [
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"Quantitativo extraído de '{quantitativo.fonte}', fora das fontes homologadas para "
                    f"'{no.insumo}' ({referencia})."
                ),
                acao=f"Reextraia o quantitativo a partir de {referencia} e reenvie a solicitação.",
                check="Check de Compatibilização",
            )
        ]

    unidade_modelo = quantitativo.unidade or no.unidade_sienge
    if not unidades.conversivel(unidade_modelo, no.unidade_sienge):
        return [
            Divergencia(
                tipo=PENDENCIA_TECNICA,
                motivo=(
                    f"Quantitativo do modelo informado em '{unidade_modelo}', incompatível com a unidade "
                    f"cadastrada no Sienge ('{no.unidade_sienge}')."
                ),
                acao=f"Padronize o relatório de extração em '{no.unidade_sienge}' e reenvie a solicitação.",
                check="Check de Compatibilização",
            )
        ]

    if not unidades.conversivel(pedido.unidade, no.unidade_sienge):
        return []  # divergência de unidade já reportada pelo Check de Padrão

    solicitado = unidades.converter(pedido.quantidade, pedido.unidade, no.unidade_sienge)
    previsto = unidades.converter(quantitativo.quantidade, unidade_modelo, no.unidade_sienge)
    diferenca = solicitado - previsto
    tolerancia = no.tolerancia_quantitativo_percentual
    limite = abs(previsto) * tolerancia / 100.0
    if abs(diferenca) <= max(limite, 1e-9):
        return []

    percentual = (diferenca / previsto * 100.0) if previsto else float("inf")
    regra_tolerancia = f"tolerância de {_num(tolerancia)}%" if tolerancia else "alinhamento estrito exigido"
    return [
        Divergencia(
            tipo=PENDENCIA_TECNICA,
            motivo=(
                f"Quantidade solicitada ({_num(solicitado)} {no.unidade_sienge}) diverge da extração do modelo "
                f"({_num(previsto)} {no.unidade_sienge}) em {_num(diferenca)} {no.unidade_sienge} "
                f"({_percentual(percentual)}) — {regra_tolerancia} para insumo estrutural."
            ),
            acao=(
                f"Ajuste a quantidade para {_num(previsto)} {no.unidade_sienge} ou apresente memória de cálculo "
                f"da diferença (perdas, emendas ou revisão do modelo) aprovada pelo responsável técnico."
            ),
            check="Check de Compatibilização",
        )
    ]


def _check_orcamentario(pedido: Solicitacao, no: NoConhecimento) -> list[Divergencia]:
    """Bloqueio Orçamentário: teto do nó e saldo do centro de custo no Sienge."""
    achados: list[Divergencia] = []
    total = pedido.valor_total_efetivo

    if no.preco_unitario_maximo is not None and pedido.valor_unitario is not None:
        if pedido.valor_unitario > no.preco_unitario_maximo + 1e-9:
            achados.append(
                Divergencia(
                    tipo=BLOQUEIO_ORCAMENTARIO,
                    motivo=(
                        f"Preço unitário de {_moeda(pedido.valor_unitario)}/{no.unidade_sienge} excede o teto "
                        f"indexado de {_moeda(no.preco_unitario_maximo)}/{no.unidade_sienge}."
                    ),
                    acao=(
                        "Reapresente a cotação dentro do teto ou anexe três cotações e a justificativa técnica "
                        "para aprovação do setor de compras."
                    ),
                    check="Check Orçamentário",
                )
            )

    if no.teto_orcamentario is not None and total is not None and total > no.teto_orcamentario + 1e-9:
        achados.append(
            Divergencia(
                tipo=BLOQUEIO_ORCAMENTARIO,
                motivo=(
                    f"Valor total de {_moeda(total)} excede o teto orçamentário indexado de "
                    f"{_moeda(no.teto_orcamentario)} para '{no.insumo}'."
                ),
                acao="Fracione o pedido dentro do teto ou solicite aditivo orçamentário formal antes de reenviar.",
                check="Check Orçamentário",
            )
        )

    if pedido.saldo_orcamentario is not None and total is not None and total > pedido.saldo_orcamentario + 1e-9:
        achados.append(
            Divergencia(
                tipo=BLOQUEIO_ORCAMENTARIO,
                motivo=(
                    f"Valor total de {_moeda(total)} supera o saldo orçamentário de "
                    f"{_moeda(pedido.saldo_orcamentario)} no centro de custo '{pedido.centro_de_custo}'."
                ),
                acao=(
                    "Ajuste a quantidade ao saldo disponível ou providencie remanejamento orçamentário no Sienge "
                    "antes de reenviar a solicitação."
                ),
                check="Check Orçamentário",
            )
        )
    return achados


# --------------------------------------------------------------------------- saída


def _resposta(
    divergencias: Iterable[Divergencia],
    *,
    detalhado: bool = False,
    no: NoConhecimento | None = None,
    pedido: Solicitacao | None = None,
) -> dict[str, Any]:
    achados = sorted(divergencias, key=lambda d: _ORDEM_CHECKS.index(d.check) if d.check in _ORDEM_CHECKS else 99)
    if not achados:
        resposta: dict[str, Any] = {"status": APROVADO, "motivo_bloqueio": None, "acao_corretiva": None}
    else:
        resposta = {
            "status": REPROVADO,
            "motivo_bloqueio": " | ".join(f"[{d.tipo}] {d.motivo}" for d in achados),
            "acao_corretiva": " | ".join(dict.fromkeys(d.acao for d in achados)),
        }
    if detalhado:
        resposta["_diagnostico"] = {
            "no": str(no.caminho) if no and no.caminho else None,
            "insumo_indexado": no.insumo if no else None,
            "unidade_sienge": no.unidade_sienge if no else None,
            "janela_duplicidade_dias": no.janela_duplicidade_dias if no else None,
            "compras_analisadas": len(pedido.compras_recentes) if pedido else 0,
            "divergencias": [
                {"check": d.check, "tipo": d.tipo, "motivo": d.motivo, "acao_corretiva": d.acao} for d in achados
            ],
        }
    return resposta


def _mesmo_insumo(compra: Compra, pedido: Solicitacao, no: NoConhecimento) -> bool:
    return no.casa_insumo(compra.insumo) or normalizar(compra.insumo) == normalizar(pedido.insumo)


def _mesmo_centro(compra: Compra, pedido: Solicitacao) -> bool:
    return normalizar_centro_de_custo(compra.centro_de_custo) == pedido.chave_centro_de_custo


def _data(valor: date) -> str:
    return valor.strftime("%d/%m/%Y")


def _num(valor: float | None) -> str:
    if valor is None:
        return "—"
    inteiro, _, decimal = f"{valor:,.3f}".partition(".")
    decimal = decimal.rstrip("0")
    inteiro = inteiro.replace(",", ".")
    return f"{inteiro},{decimal}" if decimal else inteiro


def _moeda(valor: float) -> str:
    return "R$ " + f"{valor:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def _percentual(valor: float) -> str:
    if valor == float("inf"):
        return "quantitativo de referência igual a zero"
    return f"{'+' if valor > 0 else ''}{_num(round(valor, 2))}%"
