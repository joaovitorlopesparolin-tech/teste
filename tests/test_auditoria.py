from mas.auditoria import APROVADO, REPROVADO, auditar
from mas.modelos import BLOQUEIO_ORCAMENTARIO, PENDENCIA_TECNICA, TRAVA_DUPLICIDADE
from tests.apoio import TesteComBase

FATURADO = {
    "insumo": "Concreto Usinado FCK 30 MPa",
    "centro_de_custo": "02.01.03 - Estrutura",
    "data_faturamento": "2026-03-05",
    "quantidade": 52.0,
    "unidade": "m³",
    "documento": "NF 118995",
}


class TestProtocolo(TesteComBase):
    def test_resposta_aprovada_tem_apenas_as_chaves_do_protocolo(self):
        resposta = auditar(self.solicitacao(), self.base)
        self.assertEqual(set(resposta), {"status", "motivo_bloqueio", "acao_corretiva"})
        self.assertEqual(resposta["status"], APROVADO)
        self.assertIsNone(resposta["motivo_bloqueio"])
        self.assertIsNone(resposta["acao_corretiva"])

    def test_resposta_reprovada_traz_motivo_e_acao(self):
        resposta = auditar(self.solicitacao(unidade="caminhão"), self.base)
        self.assertEqual(set(resposta), {"status", "motivo_bloqueio", "acao_corretiva"})
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertTrue(resposta["motivo_bloqueio"])
        self.assertTrue(resposta["acao_corretiva"])

    def test_diagnostico_so_aparece_quando_pedido(self):
        resposta = auditar(self.solicitacao(), self.base, detalhado=True)
        self.assertIn("_diagnostico", resposta)
        self.assertEqual(resposta["_diagnostico"]["unidade_sienge"], "m³")

    def test_solicitacao_incompleta_devolve_json_de_protocolo(self):
        resposta = auditar({"insumo": "Concreto Usinado FCK 30 MPa"}, self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn(PENDENCIA_TECNICA, resposta["motivo_bloqueio"])
        self.assertIn("centro_de_custo", resposta["motivo_bloqueio"])

    def test_payload_aninhado_e_aceito(self):
        resposta = auditar({"solicitacao": self.solicitacao(), "origem": "Sienge"}, self.base)
        self.assertEqual(resposta["status"], APROVADO)


class TestCheckHistorico(TesteComBase):
    def test_bloqueia_dentro_da_janela(self):
        resposta = auditar(self.solicitacao(data_solicitacao="2026-03-12", compras_recentes=[FATURADO]), self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn(TRAVA_DUPLICIDADE, resposta["motivo_bloqueio"])
        self.assertIn("05/03/2026", resposta["motivo_bloqueio"])
        self.assertIn("NF 118995", resposta["motivo_bloqueio"])

    def test_limite_da_janela_de_15_dias(self):
        catorze = auditar(self.solicitacao(data_solicitacao="2026-03-19", compras_recentes=[FATURADO]), self.base)
        quinze = auditar(self.solicitacao(data_solicitacao="2026-03-20", compras_recentes=[FATURADO]), self.base)
        self.assertEqual(catorze["status"], REPROVADO)
        self.assertEqual(quinze["status"], APROVADO)

    def test_centro_de_custo_diferente_nao_e_duplicidade(self):
        outra_obra = {**FATURADO, "centro_de_custo": "03.02.01 - Estrutura Bloco B"}
        resposta = auditar(self.solicitacao(data_solicitacao="2026-03-12", compras_recentes=[outra_obra]), self.base)
        self.assertEqual(resposta["status"], APROVADO)

    def test_insumo_diferente_nao_e_duplicidade(self):
        outro_insumo = {**FATURADO, "insumo": "Aço CA-50 10,0mm"}
        resposta = auditar(self.solicitacao(data_solicitacao="2026-03-12", compras_recentes=[outro_insumo]), self.base)
        self.assertEqual(resposta["status"], APROVADO)

    def test_alias_do_insumo_conta_como_duplicidade(self):
        alias = {**FATURADO, "insumo": "CONCRETO USINADO 30MPA"}
        resposta = auditar(self.solicitacao(data_solicitacao="2026-03-12", compras_recentes=[alias]), self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn(TRAVA_DUPLICIDADE, resposta["motivo_bloqueio"])

    def test_centro_de_custo_reconhecido_pelo_codigo(self):
        resposta = auditar(
            self.solicitacao(centro_de_custo="02.01.03", data_solicitacao="2026-03-12", compras_recentes=[FATURADO]),
            self.base,
        )
        self.assertIn(TRAVA_DUPLICIDADE, resposta["motivo_bloqueio"])


class TestCheckPadrao(TesteComBase):
    def test_unidade_ambigua_e_barrada(self):
        resposta = auditar(self.solicitacao(unidade="caminhão"), self.base)
        self.assertIn("Unidade ambígua", resposta["motivo_bloqueio"])
        self.assertIn("m³", resposta["acao_corretiva"])

    def test_unidade_divergente_do_cadastro(self):
        resposta = auditar(self.solicitacao(unidade="kg"), self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn("Unidade divergente", resposta["motivo_bloqueio"])

    def test_sinonimo_da_unidade_cadastrada_e_aceito(self):
        self.assertEqual(auditar(self.solicitacao(unidade="m3"), self.base)["status"], APROVADO)
        self.assertEqual(auditar(self.solicitacao(unidade="M3"), self.base)["status"], APROVADO)

    def test_unidade_desconhecida_e_barrada(self):
        resposta = auditar(self.solicitacao(unidade="xpto"), self.base)
        self.assertIn("não é uma unidade de medida reconhecida", resposta["motivo_bloqueio"])


class TestCheckCompatibilizacao(TesteComBase):
    def test_estrutural_sem_quantitativo_do_modelo(self):
        resposta = auditar(self.solicitacao(quantitativo_modelo=None), self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn("sem o quantitativo extraído do modelo", resposta["motivo_bloqueio"])
        self.assertIn("Eberick", resposta["motivo_bloqueio"])

    def test_divergencia_acima_da_tolerancia(self):
        resposta = auditar(self.solicitacao(quantidade=30.0), self.base)
        self.assertEqual(resposta["status"], REPROVADO)
        self.assertIn("diverge da extração do modelo", resposta["motivo_bloqueio"])
        self.assertIn("+50%", resposta["motivo_bloqueio"])

    def test_divergencia_dentro_da_tolerancia(self):
        self.assertEqual(auditar(self.solicitacao(quantidade=20.5), self.base)["status"], APROVADO)

    def test_conversao_de_unidade_do_modelo(self):
        pedido = self.solicitacao(
            quantidade=20000.0,
            unidade="L",
            quantitativo_modelo={"quantidade": 20.0, "unidade": "m³", "fonte": "Revit"},
        )
        resposta = auditar(pedido, self.base)
        self.assertIn("Unidade divergente", resposta["motivo_bloqueio"])  # L não é a unidade do Sienge
        self.assertNotIn("diverge da extração", resposta["motivo_bloqueio"])

    def test_fonte_nao_homologada(self):
        pedido = self.solicitacao(quantitativo_modelo={"quantidade": 20.0, "unidade": "m³", "fonte": "SketchUp"})
        resposta = auditar(pedido, self.base)
        self.assertIn("fora das fontes homologadas", resposta["motivo_bloqueio"])

    def test_insumo_nao_estrutural_dispensa_o_check(self):
        pedido = {
            "insumo": "Cimento Portland CP II-Z-32",
            "centro_de_custo": "02.01.05",
            "quantidade": 100,
            "unidade": "sc",
            "data_solicitacao": "2026-03-10",
            "compras_recentes": [],
        }
        self.assertEqual(auditar(pedido, self.base)["status"], APROVADO)


class TestCheckOrcamentario(TesteComBase):
    def test_preco_unitario_acima_do_teto(self):
        resposta = auditar(self.solicitacao(valor_unitario=520.0), self.base)
        self.assertIn(BLOQUEIO_ORCAMENTARIO, resposta["motivo_bloqueio"])
        self.assertIn("R$ 520,00", resposta["motivo_bloqueio"])

    def test_preco_unitario_dentro_do_teto(self):
        self.assertEqual(auditar(self.solicitacao(valor_unitario=465.0), self.base)["status"], APROVADO)

    def test_saldo_orcamentario_insuficiente(self):
        resposta = auditar(self.solicitacao(valor_unitario=400.0, saldo_orcamentario=5000.0), self.base)
        self.assertIn("supera o saldo orçamentário", resposta["motivo_bloqueio"])

    def test_teto_total_do_no(self):
        pedido = {
            "insumo": "Cimento Portland CP II-Z-32",
            "centro_de_custo": "02.01.05",
            "quantidade": 700,
            "unidade": "sc",
            "valor_unitario": 40.0,
            "data_solicitacao": "2026-03-10",
        }
        resposta = auditar(pedido, self.base)
        self.assertIn("excede o teto orçamentário indexado", resposta["motivo_bloqueio"])


class TestIndexacaoEVigencia(TesteComBase):
    def test_insumo_sem_no_indexado(self):
        pedido = self.solicitacao(insumo="Manta asfáltica 4mm", quantitativo_modelo=None)
        resposta = auditar(pedido, self.base)
        self.assertIn("não possui nó de conhecimento indexado", resposta["motivo_bloqueio"])
        self.assertIn("Fluxo de Indexação", resposta["acao_corretiva"])

    def test_solicitacao_anterior_a_vigencia(self):
        resposta = auditar(self.solicitacao(data_solicitacao="2025-12-20"), self.base)
        self.assertIn("só entra em vigência", resposta["motivo_bloqueio"])

    def test_centro_de_custo_fora_da_regra(self):
        resposta = auditar(self.solicitacao(centro_de_custo="05.09.01 - Paisagismo"), self.base)
        self.assertIn("difere do centro de custo", resposta["motivo_bloqueio"])

    def test_centro_de_custo_curinga_aceita_qualquer_obra(self):
        pedido = {
            "insumo": "Cimento Portland CP II-Z-32",
            "centro_de_custo": "09.09.09 - Qualquer",
            "quantidade": 10,
            "unidade": "sc",
            "data_solicitacao": "2026-03-10",
        }
        self.assertEqual(auditar(pedido, self.base)["status"], APROVADO)


class TestDivergenciasMultiplas(TesteComBase):
    def test_motivos_seguem_a_ordem_dos_checks(self):
        pedido = self.solicitacao(
            data_solicitacao="2026-03-12",
            unidade="caminhão",
            quantitativo_modelo=None,
            valor_unitario=600.0,
            compras_recentes=[FATURADO],
        )
        resposta = auditar(pedido, self.base)
        motivo = resposta["motivo_bloqueio"]
        posicoes = [
            motivo.index("Duplicidade de faturamento"),
            motivo.index("sem o quantitativo extraído"),
            motivo.index("Unidade ambígua"),
            motivo.index("Preço unitário"),
        ]
        self.assertEqual(posicoes, sorted(posicoes))
        self.assertEqual(motivo.count(" | "), 3)


if __name__ == "__main__":
    unittest.main()
