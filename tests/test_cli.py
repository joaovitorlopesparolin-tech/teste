import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from mas.cli import main
from tests.apoio import TesteComBase


def rodar(*argv: str) -> tuple[int, dict, str]:
    saida, erros = io.StringIO(), io.StringIO()
    with redirect_stdout(saida), redirect_stderr(erros):
        codigo = main(list(argv))
    texto = saida.getvalue()
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        dados = {"_texto": texto}
    return codigo, dados, erros.getvalue()


class TestCLI(TesteComBase):
    def _pedido(self, **campos) -> str:
        caminho = self.diretorio / "pedido.json"
        caminho.write_text(json.dumps(self.solicitacao(**campos)), encoding="utf-8")
        return str(caminho)

    def test_auditar_aprovado(self):
        codigo, resposta, _ = rodar("--base", str(self.diretorio), "auditar", self._pedido())
        self.assertEqual(codigo, 0)
        self.assertEqual(resposta["status"], "APROVADO")

    def test_auditar_reprovado_usa_codigo_2(self):
        codigo, resposta, _ = rodar("--base", str(self.diretorio), "auditar", self._pedido(unidade="caminhão"))
        self.assertEqual(codigo, 2)
        self.assertEqual(resposta["status"], "REPROVADO")

    def test_auditar_com_json_invalido(self):
        caminho = self.diretorio / "ruim.json"
        caminho.write_text("{isto não é json}", encoding="utf-8")
        codigo, _, erros = rodar("--base", str(self.diretorio), "auditar", str(caminho))
        self.assertEqual(codigo, 1)
        self.assertIn("erro", erros)

    def test_indexar_grava_o_no(self):
        diretriz = self.diretorio / "diretriz.txt"
        diretriz.write_text(
            "Insumo: Tela soldada Q-196\nUnidade: m2\nCentro de Custo: 02.01.03\nVigência: 2026-02-01\n\n"
            "Nova solicitação do mesmo insumo em menos de 15 dias fica bloqueada.\n",
            encoding="utf-8",
        )
        codigo, resposta, _ = rodar("--base", str(self.diretorio), "indexar", str(diretriz), "--alias", "TELA Q196")
        self.assertEqual(codigo, 0)
        self.assertTrue(Path(resposta["arquivo"]).is_file())
        self.assertEqual(resposta["regras"][0]["tipo"], "Trava de Duplicidade")

    def test_indexar_sem_campos_obrigatorios(self):
        diretriz = self.diretorio / "incompleta.txt"
        diretriz.write_text("Comprar sempre pelo menor preço.\n", encoding="utf-8")
        codigo, _, erros = rodar("--base", str(self.diretorio), "indexar", str(diretriz))
        self.assertEqual(codigo, 1)
        self.assertIn("campos_faltando", erros)

    def test_listar(self):
        codigo, resposta, _ = rodar("--base", str(self.diretorio), "listar")
        self.assertEqual(codigo, 0)
        self.assertEqual(len(resposta["nos"]), 2)
        self.assertEqual(resposta["erros"], [])

    def test_base_inexistente(self):
        codigo, _, erros = rodar("--base", str(self.diretorio / "nao-existe"), "listar")
        self.assertEqual(codigo, 1)
        self.assertIn("erro", erros)


class TestExemplosDoRepositorio(unittest.TestCase):
    """Os exemplos versionados precisam continuar produzindo o veredito esperado."""

    esperado = {
        "01-aprovado-concreto.json": ("APROVADO", None),
        "02-duplicidade-concreto.json": ("REPROVADO", "Trava de Duplicidade"),
        "03-unidade-ambigua.json": ("REPROVADO", "Unidade ambígua"),
        "04-divergencia-modelo-aco.json": ("REPROVADO", "diverge da extração do modelo"),
        "05-bloqueio-orcamentario-cimento.json": ("REPROVADO", "Bloqueio Orçamentário"),
        "06-insumo-nao-indexado.json": ("REPROVADO", "não possui nó de conhecimento indexado"),
    }

    def test_exemplos(self):
        raiz = Path(__file__).resolve().parent.parent
        for arquivo, (status, trecho) in self.esperado.items():
            with self.subTest(arquivo=arquivo):
                codigo, resposta, _ = rodar(
                    "--base", str(raiz / "base_conhecimento"), "auditar", str(raiz / "exemplos" / arquivo)
                )
                self.assertEqual(resposta["status"], status)
                self.assertEqual(codigo, 0 if status == "APROVADO" else 2)
                if trecho:
                    self.assertIn(trecho, resposta["motivo_bloqueio"])


if __name__ == "__main__":
    unittest.main()
