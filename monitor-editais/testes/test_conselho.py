import unittest
from datetime import date

from app.coletar import _conselho
from app.pncp import Falha


def _falha(motivo, http=None):
    return Falha(6, date(2026, 8, 1), date(2026, 8, 10), 1, motivo, http)


class Conselho(unittest.TestCase):
    """Conselho errado é pior que nenhum: a dica precisa casar com o motivo."""

    def test_rede_manda_olhar_a_conexao_e_o_proxy(self):
        texto = _conselho([_falha("rede")])
        self.assertIn("proxy", texto)
        self.assertNotIn("--dias-por-janela", texto)

    def test_limite_de_taxa_manda_esperar(self):
        self.assertIn("alguns minutos", _conselho([_falha("limite_de_taxa", 429)]))

    def test_teto_manda_fatiar_mais_fino(self):
        self.assertIn("--dias-por-janela 5", _conselho([_falha("teto")]))

    def test_erro_do_servidor_manda_fatiar_mais_fino(self):
        self.assertIn("--dias-por-janela 5", _conselho([_falha("http", 500)]))
