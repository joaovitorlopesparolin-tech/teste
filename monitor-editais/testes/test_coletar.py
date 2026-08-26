"""Prova do entregável da etapa 1: a linha de comando roda de ponta a ponta.

Nenhum destes testes toca a rede — o PNCP é de mentira, mas o caminho do código
é o de verdade, do argumento até o CSV.
"""

import contextlib
import csv
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx

from app import coletar
from app.pncp import ClientePNCP as ClienteReal
from testes.apoio import Espiao, edital, pagina, resposta_json

OBJETO_VETADO = "Reforma e ampliação da UBS Vila C, incluindo aquisição de material"


def _http(roteiro) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(Espiao(roteiro)))


class Base(unittest.TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp())
        self.banco = str(self.pasta / "monitor.sqlite3")

    def _rodar(self, roteiro, extras=()):
        saida = io.StringIO()
        def sem_espera(http, **_opcoes):
            return ClienteReal(http, dormir=lambda _: None, pausa_entre_paginas=0)

        with mock.patch.object(coletar, "criar_cliente_http", lambda *a, **k: _http(roteiro)), \
             mock.patch.object(coletar, "ClientePNCP", sem_espera), \
             contextlib.redirect_stdout(saida):
            codigo = coletar.principal(["--meses", "1", "--banco", self.banco, *extras])
        return codigo, saida.getvalue()


class ColetaQueDeuCerto(Base):
    def test_imprime_o_retrato_e_sai_com_zero(self):
        def roteiro(_req, numero):
            return resposta_json(pagina([
                edital(f"PNCP-{numero}-a", objeto="Pavimentação asfáltica de vias"),
                edital(f"PNCP-{numero}-b", objeto=OBJETO_VETADO),
            ]))
        codigo, texto = self._rodar(roteiro)

        self.assertEqual(codigo, 0)
        self.assertIn("RETRATO", texto)
        self.assertIn("cobertura .......... completa", texto)
        self.assertIn("obra / engenharia", texto)
        self.assertIn("de quantos desses vocês souberam?", texto)
        self.assertNotIn("≥", texto, "coleta completa não mostra piso")

    def test_aponta_o_que_o_filtro_binario_joga_fora(self):
        def roteiro(_req, numero):
            return resposta_json(pagina([edital(f"PNCP-{numero}", objeto=OBJETO_VETADO)]))
        _codigo, texto = self._rodar(roteiro)

        self.assertIn("ATENÇÃO", texto)
        self.assertIn("descartados por termo", texto)
        self.assertIn("aquisicao de material", texto)

    def test_grava_csv_com_acento_e_ponto_e_virgula(self):
        def roteiro(_req, numero):
            return resposta_json(pagina([
                edital(f"PNCP-{numero}", objeto="Construção de creche em Foz do Iguaçu")]))
        destino = self.pasta / "editais.csv"
        codigo, _texto = self._rodar(roteiro, ["--csv", str(destino)])

        self.assertEqual(codigo, 0)
        with destino.open(encoding="utf-8-sig", newline="") as arquivo:
            linhas = list(csv.DictReader(arquivo, delimiter=";"))
        self.assertTrue(linhas)
        self.assertIn("Iguaçu", linhas[0]["objeto"])
        self.assertIn("Construção", linhas[0]["objeto"])


class ColetaQueFalhou(Base):
    def test_diz_que_esta_parcial_e_sai_com_dois(self):
        codigo, texto = self._rodar([httpx.Response(500)])

        self.assertEqual(codigo, 2, "código de saída diferente quando o retrato é parcial")
        self.assertIn("cobertura .......... PARCIAL", texto)
        self.assertIn("não puderam ser concluídas", texto)
        self.assertIn("mínimo garantido", texto)
        self.assertIn("HTTP 500", texto)

    def test_mostra_os_municipios_quando_a_regiao_da_zero(self):
        def roteiro(_req, numero):
            return resposta_json(pagina([
                edital(f"PNCP-{numero}", objeto="Pavimentação", municipio="Curitiba")]))
        _codigo, texto = self._rodar(roteiro)

        self.assertIn("Nenhum edital caiu na região configurada", texto)
        self.assertIn("Curitiba", texto)


class Amostra(Base):
    def test_mostra_um_registro_cru_da_api(self):
        def roteiro(_req, _numero):
            return resposta_json(pagina([edital(objeto="Reforma da praça central")]))
        _codigo, texto = self._rodar(roteiro, ["--amostra"])

        self.assertIn("Campos do envelope", texto)
        self.assertIn("registro cru", texto)
        self.assertIn("Reforma da praça central", texto)
