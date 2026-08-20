import unittest
from datetime import date

from mas.conhecimento import BaseConhecimento, NoInvalido, Registro, carregar_no, wikilinks
from tests.apoio import TesteComBase


class TestRegistro(unittest.TestCase):
    def test_classificacao_de_termos(self):
        registro = Registro(projetos=["Projeto Recanto"])
        self.assertEqual(registro.classificar("Revit"), "software")
        self.assertEqual(registro.classificar("eberick"), "software")
        self.assertEqual(registro.classificar("Projeto Recanto"), "projeto")
        self.assertEqual(registro.classificar("Obra Sede Nova"), "projeto")
        self.assertEqual(registro.classificar("almoxarifado"), "outro")

    def test_extracao_de_wikilinks(self):
        self.assertEqual(wikilinks("[[Projeto Recanto]] e [[Revit]] e [[Revit]]"), ["Projeto Recanto", "Revit"])


class TestBaseConhecimento(TesteComBase):
    def test_carrega_todos_os_nos(self):
        self.assertEqual(len(self.base), 2)
        self.assertEqual(self.base.erros, [])

    def test_busca_por_nome_e_por_alias(self):
        for consulta in ("Concreto Usinado FCK 30 MPa", "concreto usinado fck 30 mpa", "CONCRETO USINADO 30MPA"):
            no = self.base.buscar(consulta, "02.01.03 - Estrutura", date(2026, 3, 10))
            self.assertIsNotNone(no, consulta)
            self.assertEqual(no.insumo, "Concreto Usinado FCK 30 MPa")

    def test_insumo_desconhecido(self):
        self.assertIsNone(self.base.buscar("Manta asfáltica 4mm", "02.01.09", date(2026, 3, 10)))

    def test_campos_do_no(self):
        no = self.base.buscar("Concreto Usinado FCK 30 MPa")
        self.assertEqual(no.unidade_sienge, "m³")
        self.assertEqual(no.data_vigencia, date(2026, 1, 5))
        self.assertEqual(no.janela_duplicidade_dias, 15)
        self.assertEqual(no.tolerancia_quantitativo_percentual, 3.0)
        self.assertEqual(no.fontes_modelo, ["Eberick", "Revit"])  # Sienge é ERP, não fonte de modelo
        self.assertEqual(no.projetos, ["Projeto Recanto"])
        self.assertEqual(len(no.regras), 3)

    def test_centro_de_custo_normalizado_pelo_codigo(self):
        no = self.base.buscar("Concreto Usinado FCK 30 MPa")
        self.assertEqual(no.chave_centro_de_custo, "02.01.03")

    def test_no_mais_recente_vence(self):
        (self.diretorio / "concreto-2027.md").write_text(
            "---\ninsumo: Concreto Usinado FCK 30 MPa\nunidade_sienge: m³\n"
            "centro_de_custo: 02.01.03 - Estrutura\ndata_vigencia: 2027-01-01\n---\n\n# novo\n",
            encoding="utf-8",
        )
        base = BaseConhecimento(self.diretorio)
        self.assertEqual(base.buscar("Concreto Usinado FCK 30 MPa", None, date(2026, 6, 1)).data_vigencia, date(2026, 1, 5))
        self.assertEqual(base.buscar("Concreto Usinado FCK 30 MPa", None, date(2027, 6, 1)).data_vigencia, date(2027, 1, 1))

    def test_no_invalido_e_reportado_sem_derrubar_a_base(self):
        (self.diretorio / "quebrado.md").write_text("---\ninsumo: Sem unidade\n---\n\ncorpo\n", encoding="utf-8")
        base = BaseConhecimento(self.diretorio)
        self.assertEqual(len(base), 2)
        self.assertEqual(len(base.erros), 1)
        self.assertIn("unidade_sienge", base.erros[0])

    def test_carregar_no_exige_frontmatter(self):
        caminho = self.diretorio / "sem_cabecalho.md"
        caminho.write_text("# nó sem frontmatter\n", encoding="utf-8")
        with self.assertRaises(NoInvalido):
            carregar_no(caminho)


if __name__ == "__main__":
    unittest.main()
