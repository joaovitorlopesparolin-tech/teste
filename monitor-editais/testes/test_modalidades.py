import unittest

from app import modalidades


class PorCodigo(unittest.TestCase):
    def test_busca_pela_chave_e_nao_pela_posicao(self):
        # No PowerShell, a tabela hash indexada por número devolvia o item pela
        # posição: pedir 6 trazia o sétimo. Todas as modalidades saíam rotuladas
        # erradas, sem erro na tela. Este teste fixa o comportamento certo.
        self.assertEqual(modalidades.por_codigo(4).nome, "Concorrência Eletrônica")
        self.assertEqual(modalidades.por_codigo(6).nome, "Pregão Eletrônico")
        self.assertEqual(modalidades.por_codigo(9).nome, "Inexigibilidade")

    def test_codigo_desconhecido_falha_alto(self):
        with self.assertRaises(KeyError):
            modalidades.por_codigo(99)


class Padrao(unittest.TestCase):
    def test_dispensa_e_inexigibilidade_ficam_de_fora(self):
        codigos = [m.codigo for m in modalidades.padrao()]
        self.assertEqual(codigos, [4, 5, 6, 7])

    def test_podem_ser_incluidas(self):
        codigos = [m.codigo for m in modalidades.padrao(com_dispensa=True)]
        self.assertEqual(codigos, [4, 5, 6, 7, 8, 9])
