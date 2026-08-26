import unittest
from datetime import date

from app import banco
from app.cobertura import Cobertura, Contagem
from app.pncp import Falha


def _linha(id_pncp="PNCP-1", municipio="Foz do Iguaçu", objeto="Pavimentação",
           valor=1000.0):
    return {"id_pncp": id_pncp, "publicacao": "2026-08-21", "abertura": "",
            "encerramento": "", "municipio": municipio, "uf": "PR",
            "orgao": "Município", "modalidade_codigo": 6,
            "modalidade_nome": "Pregão Eletrônico", "objeto": objeto,
            "valor": valor, "situacao": "Divulgada", "link": ""}


class Base(unittest.TestCase):
    def setUp(self):
        self.con = banco.abrir(":memory:")
        self.addCleanup(self.con.close)

    def _coleta(self, planejadas=4):
        return banco.iniciar_coleta(
            self.con, uf="PR", data_inicial=date(2026, 8, 1),
            data_final=date(2026, 8, 20), dias_por_janela=10,
            modalidades=[4, 6], consultas_planejadas=planejadas)


class Editais(Base):
    def test_o_mesmo_edital_em_duas_coletas_nao_duplica(self):
        primeira = self._coleta()
        banco.guardar_editais(self.con, primeira, [_linha()])
        segunda = self._coleta()
        banco.guardar_editais(self.con, segunda, [_linha(objeto="Pavimentação revisada")])

        linhas = list(self.con.execute("SELECT * FROM editais"))
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]["objeto"], "Pavimentação revisada")

    def test_guarda_em_que_coleta_o_edital_apareceu_pela_primeira_vez(self):
        # É esta coluna que vai permitir "o que apareceu desde a semana passada"
        # sem nenhum trabalho novo de coleta.
        primeira = self._coleta()
        banco.guardar_editais(self.con, primeira, [_linha()])
        segunda = self._coleta()
        banco.guardar_editais(self.con, segunda, [_linha()])

        linha = self.con.execute("SELECT * FROM editais").fetchone()
        self.assertEqual(linha["primeira_coleta_id"], primeira)
        self.assertEqual(linha["ultima_coleta_id"], segunda)

    def test_registro_sem_identificador_e_ignorado(self):
        coleta = self._coleta()
        guardados = banco.guardar_editais(self.con, coleta, [_linha(id_pncp="")])
        self.assertEqual(guardados, 0)


class Marcacoes(Base):
    def test_uma_nova_coleta_nao_apaga_o_que_a_pessoa_marcou(self):
        primeira = self._coleta()
        banco.guardar_editais(self.con, primeira, [_linha()])
        banco.marcar(self.con, "PNCP-1", ja_conheciamos=True, nota="veio por indicação")

        segunda = self._coleta()
        banco.guardar_editais(self.con, segunda, [_linha()])

        marcacao = banco.marcacao(self.con, "PNCP-1")
        self.assertEqual(marcacao["ja_conheciamos"], 1)
        self.assertEqual(marcacao["nota"], "veio por indicação")

    def test_marcar_de_novo_preserva_o_campo_nao_informado(self):
        banco.marcar(self.con, "PNCP-1", ja_conheciamos=True, nota="indicação")
        banco.marcar(self.con, "PNCP-1", situacao="analisar")
        marcacao = banco.marcacao(self.con, "PNCP-1")
        self.assertEqual(marcacao["ja_conheciamos"], 1)
        self.assertEqual(marcacao["nota"], "indicação")
        self.assertEqual(marcacao["situacao"], "analisar")


class ContagemComCobertura(Base):
    def test_coleta_completa_devolve_numero_limpo(self):
        coleta = self._coleta(planejadas=2)
        banco.guardar_editais(self.con, coleta, [_linha("A"), _linha("B")])
        banco.finalizar_coleta(self.con, coleta, Cobertura(2, 2, 0))

        total = banco.contar_editais(self.con, coleta)
        self.assertEqual(int(total), 2)
        self.assertTrue(total.completa)
        self.assertEqual(str(total), "2")

    def test_coleta_parcial_devolve_piso_e_nao_total(self):
        coleta = self._coleta(planejadas=2)
        banco.guardar_editais(self.con, coleta, [_linha("A")])
        banco.registrar_falha(self.con, coleta,
                              Falha(6, date(2026, 8, 1), date(2026, 8, 10), 3, "http", 500))
        banco.finalizar_coleta(self.con, coleta, Cobertura(2, 1, 1))

        total = banco.contar_editais(self.con, coleta)
        self.assertFalse(total.completa)
        self.assertEqual(str(total), "≥ 1")

    def test_formata_milhar_no_padrao_brasileiro(self):
        self.assertEqual(str(Contagem(1284, True)), "1.284")
        self.assertEqual(str(Contagem(1284, False)), "≥ 1.284")


class RecorteDeMunicipio(Base):
    def test_casa_municipio_com_e_sem_acento(self):
        coleta = self._coleta()
        banco.guardar_editais(self.con, coleta, [
            _linha("A", municipio="Foz do Iguaçu"),
            _linha("B", municipio="FOZ DO IGUACU"),
            _linha("C", municipio="Curitiba"),
        ])
        banco.finalizar_coleta(self.con, coleta, Cobertura(4, 4, 0))

        na_regiao = banco.contar_editais(self.con, coleta, municipios=["Foz do Iguaçu"])
        self.assertEqual(int(na_regiao), 2)

    def test_lista_os_municipios_que_a_api_trouxe(self):
        coleta = self._coleta()
        banco.guardar_editais(self.con, coleta, [
            _linha("A", municipio="Curitiba"), _linha("B", municipio="Curitiba"),
            _linha("C", municipio="Londrina"),
        ])
        frequentes = banco.municipios_mais_frequentes(self.con, coleta)
        self.assertEqual(frequentes[0], ("Curitiba", 2))


class Cobertura_(unittest.TestCase):
    def test_status_derivado(self):
        self.assertEqual(Cobertura(10, 10, 0).status, "completa")
        self.assertEqual(Cobertura(10, 9, 1).status, "parcial")
        self.assertEqual(Cobertura(10, 0, 10).status, "falhou")

    def test_falha_registrada_impede_completa_mesmo_com_tudo_concluido(self):
        self.assertFalse(Cobertura(10, 10, 1).completa)
