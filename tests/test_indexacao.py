import tempfile
import unittest
from datetime import date
from pathlib import Path

from mas.conhecimento import Registro, carregar_no
from mas.indexacao import DadosInsuficientes, classificar, indexar, interligar
from mas.modelos import BLOQUEIO_ORCAMENTARIO, PENDENCIA_TECNICA, TRAVA_DUPLICIDADE

DIRETRIZ = """Insumo: Concreto Usinado FCK 30 MPa
Unidade Sienge: m3
Centro de Custo: 02.01.03 - Estrutura
Vigência: 2026-01-05

O concreto do Projeto Recanto só pode ser requisitado em m³; pedidos em caminhão ou betoneira serão devolvidos.
O volume deve estar alinhado ao quantitativo extraído do Eberick, com tolerância de 3%.
É vedado emitir nova solicitação do mesmo insumo para o mesmo centro de custo em intervalo inferior a 15 dias.
O preço unitário máximo homologado é de R$ 480,00 por m³.
"""


class TestClassificacao(unittest.TestCase):
    def test_bloqueio_orcamentario(self):
        tipo, _ = classificar("O teto orçamentário do pacote é de R$ 250.000,00 por pavimento.")
        self.assertEqual(tipo, BLOQUEIO_ORCAMENTARIO)

    def test_trava_de_duplicidade(self):
        tipo, _ = classificar("Nova compra do mesmo insumo no mesmo centro de custo dentro de 15 dias fica bloqueada.")
        self.assertEqual(tipo, TRAVA_DUPLICIDADE)

    def test_pendencia_tecnica(self):
        tipo, _ = classificar("A quantidade deve bater com o quantitativo extraído do Eberick.")
        self.assertEqual(tipo, PENDENCIA_TECNICA)

    def test_sentenca_neutra_cai_em_pendencia_para_revisao(self):
        tipo, revisar = classificar("O fornecedor deve avisar a portaria na véspera.")
        self.assertEqual(tipo, PENDENCIA_TECNICA)
        self.assertTrue(revisar)


class TestInterligacao(unittest.TestCase):
    def setUp(self):
        self.registro = Registro(projetos=["Projeto Recanto"])

    def test_projetos_e_softwares_viram_wikilinks(self):
        texto, projetos, softwares = interligar(
            "O Projeto Recanto usa Revit e Eberick, integrados ao Sienge.", self.registro
        )
        self.assertIn("[[Projeto Recanto]]", texto)
        self.assertIn("[[Revit]]", texto)
        self.assertEqual(projetos, ["Projeto Recanto"])
        self.assertEqual(sorted(softwares), ["Eberick", "Revit", "Sienge"])

    def test_nao_duplica_link_existente(self):
        texto, _, _ = interligar("Modelo do [[Projeto Recanto]] no [[Revit]].", self.registro)
        self.assertNotIn("[[[[", texto)
        self.assertEqual(texto.count("[[Projeto Recanto]]"), 1)

    def test_preserva_espacamento_ao_linkar_projeto_novo(self):
        texto, projetos, _ = interligar("A Obra Sede Nova recebeu o pedido.", Registro())
        self.assertIn("[[Obra Sede Nova]] recebeu", texto)
        self.assertEqual(projetos, ["Obra Sede Nova"])


class TestIndexacao(unittest.TestCase):
    def setUp(self):
        self.no = indexar(DIRETRIZ, registro=Registro(projetos=["Projeto Recanto"]))

    def test_frontmatter_obrigatorio(self):
        meta = self.no.meta
        self.assertEqual(meta["insumo"], "Concreto Usinado FCK 30 MPa")
        self.assertEqual(meta["unidade_sienge"], "m³")  # 'm3' normalizado para o padrão Sienge
        self.assertEqual(meta["centro_de_custo"], "02.01.03 - Estrutura")
        self.assertEqual(meta["data_vigencia"], date(2026, 1, 5))

    def test_regras_classificadas_nos_tres_tipos(self):
        tipos = {r.tipo for r in self.no.regras}
        self.assertEqual(tipos, {BLOQUEIO_ORCAMENTARIO, TRAVA_DUPLICIDADE, PENDENCIA_TECNICA})

    def test_parametros_extraidos_do_texto(self):
        self.assertTrue(self.no.meta["estrutural"])
        self.assertEqual(self.no.meta["janela_duplicidade_dias"], 15)
        self.assertEqual(self.no.meta["tolerancia_quantitativo_percentual"], 3.0)
        self.assertEqual(self.no.meta["preco_unitario_maximo"], 480.0)
        self.assertIn("caminhao", self.no.meta["unidades_bloqueadas"])
        self.assertIn("betoneira", self.no.meta["unidades_bloqueadas"])

    def test_teto_total_nao_vira_preco_unitario(self):
        no = indexar(
            "Insumo: Aço CA-50\nUnidade: kg\nCentro de Custo: 02.01.03\nVigência: 2026-01-05\n\n"
            "O teto orçamentário do pacote de armadura é de R$ 250.000,00 por pavimento.\n"
        )
        self.assertEqual(no.meta["teto_orcamentario"], 250000.0)
        self.assertNotIn("preco_unitario_maximo", no.meta)

    def test_cabecalho_nao_vira_regra(self):
        descricoes = " ".join(r.descricao for r in self.no.regras)
        self.assertNotIn("Centro de Custo:", descricoes)
        self.assertNotIn("Unidade Sienge:", descricoes)

    def test_campos_ausentes_interrompem_a_indexacao(self):
        with self.assertRaises(DadosInsuficientes) as erro:
            indexar("Só pode comprar concreto em m³.")
        self.assertEqual(
            sorted(erro.exception.faltando),
            ["centro_de_custo", "data_vigencia", "insumo", "unidade_sienge"],
        )

    def test_no_gravado_pode_ser_relido(self):
        with tempfile.TemporaryDirectory() as temp:
            caminho = self.no.salvar(temp)
            self.assertEqual(Path(caminho).name, "concreto-usinado-fck-30-mpa.md")
            relido = carregar_no(caminho)
            self.assertEqual(relido.insumo, "Concreto Usinado FCK 30 MPa")
            self.assertEqual(relido.unidade_sienge, "m³")
            self.assertEqual(len(relido.regras), len(self.no.regras))
            self.assertTrue(relido.estrutural)
            with self.assertRaises(FileExistsError):
                self.no.salvar(temp)


if __name__ == "__main__":
    unittest.main()
