import unittest
from datetime import date

from mas import frontmatter


class TestFrontmatter(unittest.TestCase):
    def test_ida_e_volta(self):
        meta = {
            "insumo": "Concreto Usinado FCK 30 MPa",
            "unidade_sienge": "m³",
            "centro_de_custo": "02.01.03 - Estrutura",
            "data_vigencia": date(2026, 1, 5),
            "estrutural": True,
            "projetos": ["Projeto Recanto"],
        }
        texto = frontmatter.serializar(meta, "# Título\n\ncorpo")
        lido, corpo = frontmatter.carregar(texto)
        self.assertEqual(lido["insumo"], meta["insumo"])
        self.assertEqual(lido["unidade_sienge"], "m³")
        self.assertEqual(str(lido["data_vigencia"]), "2026-01-05")
        self.assertIs(lido["estrutural"], True)
        self.assertEqual(lido["projetos"], ["Projeto Recanto"])
        self.assertIn("corpo", corpo)

    def test_campos_obrigatorios_vem_primeiro(self):
        texto = frontmatter.serializar(
            {"zzz": 1, "insumo": "X", "unidade_sienge": "kg", "centro_de_custo": "01", "data_vigencia": "2026-01-01"},
            "corpo",
        )
        linhas = [l.split(":")[0] for l in texto.splitlines()[1:5]]
        self.assertEqual(linhas, ["insumo", "unidade_sienge", "centro_de_custo", "data_vigencia"])

    def test_valores_com_wikilink_sao_escapados(self):
        texto = frontmatter.serializar({"projetos": ["[[Projeto Recanto]]"]}, "corpo")
        meta, _ = frontmatter.carregar(texto)
        self.assertEqual(meta["projetos"], ["[[Projeto Recanto]]"])

    def test_sem_cabecalho(self):
        with self.assertRaises(frontmatter.FrontmatterInvalido):
            frontmatter.carregar("# só markdown")
        with self.assertRaises(frontmatter.FrontmatterInvalido):
            frontmatter.carregar("---\ninsumo: X\n\nsem fechamento")

    def test_parser_de_reserva(self):
        texto = frontmatter.serializar(
            {"insumo": "Aço", "estrutural": True, "aliases": ["A", "B"], "janela_duplicidade_dias": 15}, "corpo"
        )
        bloco, _ = frontmatter.separar(texto)
        meta = frontmatter._parse_simples(bloco)
        self.assertEqual(meta["insumo"], "Aço")
        self.assertIs(meta["estrutural"], True)
        self.assertEqual(meta["aliases"], ["A", "B"])
        self.assertEqual(meta["janela_duplicidade_dias"], 15)


if __name__ == "__main__":
    unittest.main()
