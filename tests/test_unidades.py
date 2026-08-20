import unittest

from mas import unidades


class TestUnidades(unittest.TestCase):
    def test_grafias_equivalentes_do_metro_cubico(self):
        for grafia in ("m3", "m³", "M3", "metro cúbico", "metros cubicos"):
            self.assertEqual(unidades.canonica(grafia), "m³", grafia)

    def test_unidade_desconhecida(self):
        self.assertIsNone(unidades.canonica("caminhão"))
        self.assertIsNone(unidades.canonica("xpto"))

    def test_unidades_de_campo_sao_ambiguas(self):
        for grafia in ("caminhão", "CAMINHAO", "betoneira", "viagem", "carrada", "pallet"):
            self.assertTrue(unidades.eh_ambigua(grafia), grafia)
        self.assertFalse(unidades.eh_ambigua("m³"))
        self.assertFalse(unidades.eh_ambigua("kg"))

    def test_motivo_da_ambiguidade(self):
        self.assertIn("veículo", unidades.motivo_ambiguidade("caminhão"))

    def test_equivalencia_e_conversao(self):
        self.assertTrue(unidades.equivalentes("m3", "m³"))
        self.assertFalse(unidades.equivalentes("kg", "m³"))
        self.assertTrue(unidades.conversivel("t", "kg"))
        self.assertFalse(unidades.conversivel("kg", "m³"))
        self.assertEqual(unidades.converter(1.5, "t", "kg"), 1500.0)
        self.assertEqual(unidades.converter(2, "m³", "m3"), 2.0)

    def test_conversao_invalida(self):
        with self.assertRaises(ValueError):
            unidades.converter(1, "kg", "m³")
        with self.assertRaises(ValueError):
            unidades.converter(1, "caminhão", "m³")


if __name__ == "__main__":
    unittest.main()
