"""Orquestra a coleta e mantém a cobertura em dia.

A coleta grava no banco a cada janela concluída. É o mesmo cuidado que o
PowerShell tinha ao salvar o CSV bruto a cada janela: interromper no meio nunca
custa o que já veio.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Sequence

from . import banco, janelas as _janelas
from .cobertura import Cobertura
from .modalidades import Modalidade
from .pncp import ClientePNCP, Falha, converter_item


@dataclass
class Progresso:
    passo: int
    total: int
    modalidade: Modalidade
    inicio: date
    fim: date
    itens_ate_agora: int
    paginas_lidas: int
    falhas: int

    def descrever(self) -> str:
        return (f"{self.passo}/{self.total} · {self.modalidade.nome} · "
                f"{self.inicio:%d/%m} a {self.fim:%d/%m} · "
                f"{self.itens_ate_agora} editais")


@dataclass
class ResultadoColeta:
    coleta_id: int
    cobertura: Cobertura
    guardados: int
    paginas_lidas: int
    falhas: list[Falha] = field(default_factory=list)
    interrompida: bool = False


def executar(
    cliente: ClientePNCP,
    conexao: sqlite3.Connection,
    *,
    uf: str,
    data_inicial: date,
    data_final: date,
    modalidades: Sequence[Modalidade],
    dias_por_janela: int = 10,
    ao_progredir: Callable[[Progresso], None] | None = None,
) -> ResultadoColeta:
    lista_janelas = _janelas.gerar(data_inicial, data_final, dias_por_janela)
    planejadas = len(lista_janelas) * len(modalidades)

    coleta_id = banco.iniciar_coleta(
        conexao,
        uf=uf,
        data_inicial=data_inicial,
        data_final=data_final,
        dias_por_janela=dias_por_janela,
        modalidades=[m.codigo for m in modalidades],
        consultas_planejadas=planejadas,
    )

    concluidas = 0
    guardados = 0
    paginas = 0
    falhas: list[Falha] = []
    passo = 0
    interrompida = False

    try:
        for inicio, fim in lista_janelas:
            for modalidade in modalidades:
                passo += 1
                resultado = cliente.percorrer_janela(
                    modalidade=modalidade.codigo, inicio=inicio, fim=fim, uf=uf
                )

                linhas = [
                    converter_item(item, modalidade.codigo, modalidade.nome)
                    for item in resultado.itens
                ]
                guardados += banco.guardar_editais(conexao, coleta_id, linhas)
                paginas += resultado.paginas_lidas

                if resultado.completa:
                    concluidas += 1
                else:
                    for falha in resultado.falhas:
                        falhas.append(falha)
                        banco.registrar_falha(conexao, coleta_id, falha)

                banco.anotar_progresso(
                    conexao, coleta_id, concluidas=concluidas,
                    paginas=paginas, falhas=len(falhas),
                )

                if ao_progredir is not None:
                    ao_progredir(Progresso(
                        passo=passo, total=planejadas, modalidade=modalidade,
                        inicio=inicio, fim=fim, itens_ate_agora=guardados,
                        paginas_lidas=paginas, falhas=len(falhas),
                    ))
    except KeyboardInterrupt:
        # O que já veio está no banco. A cobertura vai dizer que faltou pedaço.
        interrompida = True

    cobertura = Cobertura(planejadas=planejadas, concluidas=concluidas, falhas=len(falhas))
    banco.finalizar_coleta(conexao, coleta_id, cobertura)

    return ResultadoColeta(
        coleta_id=coleta_id,
        cobertura=cobertura,
        guardados=guardados,
        paginas_lidas=paginas,
        falhas=falhas,
        interrompida=interrompida,
    )
