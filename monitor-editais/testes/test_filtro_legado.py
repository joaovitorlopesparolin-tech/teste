import unittest

from app.filtro_legado import e_obra, motivo_do_descarte


class ComportamentoAtual(unittest.TestCase):
    """Fixa o que o PowerShell faz hoje — inclusive o que ele faz de errado."""

    def test_reconhece_obra(self):
        self.assertTrue(e_obra("Pavimentação asfáltica de vias urbanas"))
        self.assertTrue(e_obra("Contratação de empresa para reforma da creche"))

    def test_negativa_elimina_antes_de_olhar_positiva(self):
        objeto = "Reforma e ampliação da UBS Vila C, incluindo aquisição de material"
        self.assertFalse(e_obra(objeto))

    def test_mede_o_tamanho_do_falso_negativo(self):
        objeto = "Reforma e ampliação da UBS Vila C, incluindo aquisição de material"
        motivo = motivo_do_descarte(objeto)
        self.assertIsNotNone(motivo)
        self.assertIn("aquisicao de material", motivo)
        self.assertIn("reforma", motivo)

    def test_descarte_legitimo_nao_vira_alarme(self):
        # Sem termo de obra nenhum, o descarte está certo e não deve ser apontado.
        self.assertIsNone(motivo_do_descarte("Aquisição de material de expediente"))
