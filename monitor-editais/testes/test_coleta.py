import unittest
from datetime import date

import httpx

from app import banco, modalidades
from app.coleta import executar
from app.pncp import ClientePNCP
from testes.apoio import Espiao, edital, pagina, resposta_json


def _cliente(roteiro, **opcoes) -> tuple[ClientePNCP, Espiao]:
    espiao = Espiao(roteiro)
    http = httpx.Client(transport=httpx.MockTransport(espiao))
    opcoes.setdefault("dormir", lambda _: None)
    opcoes.setdefault("pausa_entre_paginas", 0)
    return ClientePNCP(http, **opcoes), espiao


class Base(unittest.TestCase):
    def setUp(self):
        self.con = banco.abrir(":memory:")
        self.addCleanup(self.con.close)
        self.escolhidas = modalidades.padrao()  # 4 modalidades

    def _executar(self, roteiro, **opcoes):
        cliente, self.espiao = _cliente(roteiro, **opcoes)
        return executar(
            cliente, self.con, uf="PR",
            data_inicial=date(2026, 8, 1), data_final=date(2026, 8, 20),
            modalidades=self.escolhidas, dias_por_janela=10,
        )


class ColetaCompleta(Base):
    def test_planeja_uma_consulta_por_janela_e_modalidade(self):
        resultado = self._executar([resposta_json(pagina([]))])
        # 01-11 e 12-20 = 2 janelas, 4 modalidades
        self.assertEqual(resultado.cobertura.planejadas, 8)
        self.assertEqual(resultado.cobertura.concluidas, 8)
        self.assertTrue(resultado.cobertura.completa)

    def test_guarda_os_editais_e_marca_a_coleta_como_completa(self):
        def roteiro(_requisicao, numero):
            return resposta_json(pagina([edital(f"PNCP-{numero}")]))
        resultado = self._executar(roteiro)

        self.assertEqual(resultado.guardados, 8)
        total = banco.contar_editais(self.con, resultado.coleta_id)
        self.assertEqual(int(total), 8)
        self.assertTrue(total.completa)
        self.assertEqual(str(total), "8")

        linha = self.con.execute("SELECT status FROM coletas WHERE id = ?",
                                 (resultado.coleta_id,)).fetchone()
        self.assertEqual(linha["status"], "completa")


class ColetaParcial(Base):
    def test_uma_janela_perdida_derruba_a_coleta_inteira_para_parcial(self):
        def roteiro(_requisicao, numero):
            if numero in (3, 4):  # a segunda consulta e o seu retry
                return httpx.Response(500)
            return resposta_json(pagina([edital(f"PNCP-{numero}")]))

        resultado = self._executar(roteiro)

        self.assertFalse(resultado.cobertura.completa)
        self.assertEqual(resultado.cobertura.concluidas, 7)
        self.assertEqual(len(resultado.falhas), 1)

        total = banco.contar_editais(self.con, resultado.coleta_id)
        self.assertFalse(total.completa)
        self.assertTrue(str(total).startswith("≥ "),
                        "coleta com falha só pode subestimar")

    def test_a_falha_fica_gravada_com_o_que_ela_cobria(self):
        cliente_falho = [httpx.Response(500)]
        resultado = self._executar(cliente_falho)

        falhas = banco.falhas_da_coleta(self.con, resultado.coleta_id)
        self.assertEqual(len(falhas), 8, "uma por consulta perdida")
        primeira = falhas[0]
        self.assertEqual(primeira["motivo"], "http")
        self.assertEqual(primeira["http"], 500)
        self.assertEqual(primeira["janela_inicio"], "2026-08-01")
        self.assertEqual(primeira["pagina"], 1)
        self.assertIn(primeira["modalidade"], [m.codigo for m in self.escolhidas])

    def test_status_falhou_quando_nada_responde(self):
        resultado = self._executar([httpx.Response(500)])
        self.assertEqual(resultado.cobertura.status, "falhou")


class GravacaoIncremental(Base):
    def test_o_que_ja_veio_esta_no_banco_antes_do_fim(self):
        """Interromper no meio nunca pode custar o que já foi coletado."""
        vistos: list[int] = []

        def roteiro(_requisicao, numero):
            # a cada consulta, conta quantos editais já estão gravados
            vistos.append(self.con.execute("SELECT COUNT(*) FROM editais").fetchone()[0])
            return resposta_json(pagina([edital(f"PNCP-{numero}")]))

        self._executar(roteiro)

        self.assertEqual(vistos[0], 0)
        self.assertGreater(vistos[-1], 0, "o banco cresceu durante a coleta, não no fim")
        self.assertEqual(vistos, sorted(vistos))


class Progresso(unittest.TestCase):
    def test_avisa_a_cada_consulta(self):
        con = banco.abrir(":memory:")
        self.addCleanup(con.close)
        cliente, _ = _cliente([resposta_json(pagina([]))])
        avisos = []

        executar(cliente, con, uf="PR",
                 data_inicial=date(2026, 8, 1), data_final=date(2026, 8, 20),
                 modalidades=modalidades.padrao(), dias_por_janela=10,
                 ao_progredir=avisos.append)

        self.assertEqual(len(avisos), 8)
        self.assertEqual(avisos[0].passo, 1)
        self.assertEqual(avisos[-1].passo, 8)
        self.assertEqual(avisos[-1].total, 8)
        self.assertIn("Concorrência Eletrônica", avisos[0].descrever())
