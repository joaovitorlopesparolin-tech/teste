import unittest
from datetime import date, timedelta

from app import janelas


class Gerar(unittest.TestCase):
    def test_cobre_o_periodo_inteiro(self):
        inicio, fim = date(2026, 1, 1), date(2026, 3, 31)
        geradas = janelas.gerar(inicio, fim, 10)
        self.assertEqual(geradas[0][0], inicio)
        self.assertEqual(geradas[-1][1], fim)

    def test_sem_vao_e_sem_sobreposicao(self):
        # Um vão entre duas janelas é edital perdido sem ninguém perceber.
        geradas = janelas.gerar(date(2026, 1, 1), date(2026, 6, 30), 10)
        for anterior, seguinte in zip(geradas, geradas[1:]):
            self.assertEqual(seguinte[0], anterior[1] + timedelta(days=1))

    def test_nenhuma_janela_passa_do_tamanho(self):
        for inicio, fim in janelas.gerar(date(2026, 1, 1), date(2026, 6, 30), 10):
            self.assertLessEqual((fim - inicio).days, 10)

    def test_periodo_de_um_dia(self):
        self.assertEqual(janelas.gerar(date(2026, 5, 5), date(2026, 5, 5), 10),
                         [(date(2026, 5, 5), date(2026, 5, 5))])

    def test_recusa_parametros_impossiveis(self):
        with self.assertRaises(ValueError):
            janelas.gerar(date(2026, 5, 5), date(2026, 5, 1), 10)
        with self.assertRaises(ValueError):
            janelas.gerar(date(2026, 5, 1), date(2026, 5, 5), 0)
