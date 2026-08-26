"""Fatiamento do período em janelas de data.

A consulta do PNCP falha com erro 500 em paginação profunda. Fatiar o período
mantém cada consulta rasa. As janelas precisam ser contíguas: um vão entre duas
janelas é edital perdido sem ninguém perceber, e por isso existe teste para isso.
"""

from datetime import date, timedelta


def gerar(inicio: date, fim: date, dias_por_janela: int = 10) -> list[tuple[date, date]]:
    if dias_por_janela < 1:
        raise ValueError("dias_por_janela precisa ser pelo menos 1")
    if fim < inicio:
        raise ValueError("fim anterior ao início")

    janelas: list[tuple[date, date]] = []
    cursor = inicio
    while cursor <= fim:
        termino = min(cursor + timedelta(days=dias_por_janela), fim)
        janelas.append((cursor, termino))
        cursor = termino + timedelta(days=1)
    return janelas
