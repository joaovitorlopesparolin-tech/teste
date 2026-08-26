import unittest

from app.textos import contem, normalizar, remover_acento


class RemoverAcento(unittest.TestCase):
    def test_tira_diacritico_e_baixa_caixa(self):
        self.assertEqual(remover_acento("Foz do Iguaçu"), "foz do iguacu")
        self.assertEqual(remover_acento("SÃO MIGUEL"), "sao miguel")
        self.assertEqual(remover_acento("Guaíra"), "guaira")

    def test_aceita_vazio_e_nulo(self):
        self.assertEqual(remover_acento(""), "")
        self.assertEqual(remover_acento(None), "")


class Normalizar(unittest.TestCase):
    def test_colapsa_espaco(self):
        self.assertEqual(normalizar("  Reforma   da   UBS \n Vila C "), "reforma da ubs vila c")


class Contem(unittest.TestCase):
    def test_casa_com_e_sem_acento_nos_dois_lados(self):
        self.assertTrue(contem("PAVIMENTAÇÃO asfáltica", "pavimenta"))
        self.assertTrue(contem("Pavimentacao asfaltica", "pavimentação"))

    def test_prefixo_e_proposital(self):
        self.assertTrue(contem("Serviços de construção civil", "constru"))
        self.assertTrue(contem("CONSTRUTORA contratada", "constru"))
