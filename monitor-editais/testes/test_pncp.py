import unittest
from datetime import date

import httpx

from app.pncp import converter_item
from testes.apoio import JANELA, edital, montar, pagina, resposta_json


class Utf8(unittest.TestCase):
    def test_decodifica_dos_bytes_mesmo_com_cabecalho_mentindo(self):
        """Este é o teste que impede o "AquisiÃ§Ã£o" de voltar.

        O PNCP já anunciou charset errado. Quem decodifica pelo cabeçalho recebe
        texto corrompido — e texto corrompido faz o filtro de município não casar
        com nada e devolver zero em silêncio, sem erro nenhum na tela.
        """
        corpo = pagina([edital(objeto="Aquisição de material de construção",
                               municipio="Foz do Iguaçu")])
        cliente, _ = montar([resposta_json(
            corpo, content_type="application/json; charset=ISO-8859-1")])

        envelope, falha = cliente.buscar_pagina(pagina=1, **JANELA)

        self.assertIsNone(falha)
        item = envelope["data"][0]
        self.assertEqual(item["objetoCompra"], "Aquisição de material de construção")
        self.assertEqual(item["unidadeOrgao"]["municipioNome"], "Foz do Iguaçu")

    def test_engole_bom_sem_quebrar(self):
        corpo = b"\xef\xbb\xbf" + b'{"data":[],"totalPaginas":1}'
        cliente, _ = montar([httpx.Response(200, content=corpo)])
        envelope, falha = cliente.buscar_pagina(pagina=1, **JANELA)
        self.assertIsNone(falha)
        self.assertEqual(envelope["data"], [])


class Paginacao(unittest.TestCase):
    def test_percorre_ate_a_ultima_pagina(self):
        def roteiro(_requisicao, numero):
            return resposta_json(pagina([edital(f"PNCP-{numero}-a"),
                                         edital(f"PNCP-{numero}-b")],
                                        total_paginas=3))
        cliente, espiao = montar(roteiro)

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 3)
        self.assertEqual(resultado.paginas_lidas, 3)
        self.assertEqual(len(resultado.itens), 6)
        self.assertTrue(resultado.completa)

    def test_204_encerra_a_janela_sem_falha(self):
        cliente, espiao = montar([httpx.Response(204)])
        resultado = cliente.percorrer_janela(**JANELA)
        self.assertEqual(espiao.quantas, 1)
        self.assertEqual(resultado.itens, [])
        self.assertTrue(resultado.completa)

    def test_data_vazia_encerra_a_janela(self):
        cliente, _ = montar([resposta_json(pagina([], total_paginas=5))])
        resultado = cliente.percorrer_janela(**JANELA)
        self.assertEqual(resultado.itens, [])
        self.assertTrue(resultado.completa)


class ErroDoServidor(unittest.TestCase):
    def test_500_passageiro_nao_marca_falha(self):
        def roteiro(_requisicao, numero):
            if numero == 1:
                return httpx.Response(500)
            return resposta_json(pagina([edital()]))
        cliente, espiao = montar(roteiro)

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 2)
        self.assertTrue(resultado.completa, "uma falha que se resolveu não é falha")
        self.assertEqual(len(resultado.itens), 1)

    def test_500_persistente_vira_falha_registrada(self):
        cliente, espiao = montar([httpx.Response(500)])

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 2, "uma tentativa e um retry")
        self.assertFalse(resultado.completa)
        falha = resultado.falhas[0]
        self.assertEqual(falha.motivo, "http")
        self.assertEqual(falha.http, 500)
        self.assertEqual(falha.inicio, date(2026, 8, 1))
        self.assertEqual(falha.pagina, 1)

    def test_400_nao_merece_retry(self):
        cliente, espiao = montar([httpx.Response(400)])
        resultado = cliente.percorrer_janela(**JANELA)
        self.assertEqual(espiao.quantas, 1)
        self.assertEqual(resultado.falhas[0].http, 400)


class LimiteDeTaxa(unittest.TestCase):
    def test_429_desiste_dentro_do_teto(self):
        """No PowerShell isto era recursão sem contador: com 429 persistente o
        script esperava cinco segundos para sempre, sem erro e sem mensagem."""
        esperas: list[float] = []
        cliente, espiao = montar([httpx.Response(429)],
                                 tentativas_429=3, dormir=esperas.append)

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 4, "a original mais três tentativas")
        self.assertEqual(resultado.falhas[0].motivo, "limite_de_taxa")
        self.assertEqual(esperas, [5, 10, 20], "a espera precisa crescer")

    def test_429_que_passa_nao_vira_falha(self):
        def roteiro(_requisicao, numero):
            return httpx.Response(429) if numero == 1 else resposta_json(pagina([edital()]))
        cliente, _ = montar(roteiro)
        resultado = cliente.percorrer_janela(**JANELA)
        self.assertTrue(resultado.completa)


class TetoDePaginas(unittest.TestCase):
    def test_bater_no_teto_conta_como_falha(self):
        """O PowerShell escrevia um aviso na tela e seguia sem incrementar o
        contador de falhas: um levantamento truncado saía com a mesma cara de um
        completo. Este teste é o que impede isso de voltar."""
        def roteiro(_requisicao, numero):
            return resposta_json(pagina([edital(f"PNCP-{numero}")], total_paginas=400))
        cliente, espiao = montar(roteiro, max_paginas=3)

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 3)
        self.assertEqual(resultado.paginas_lidas, 3)
        self.assertFalse(resultado.completa, "teto atingido é cobertura parcial")
        self.assertEqual(resultado.falhas[0].motivo, "teto")


class ErroDeRede(unittest.TestCase):
    def test_tenta_de_novo_uma_vez_e_depois_registra(self):
        def roteiro(requisicao, _numero):
            raise httpx.ConnectTimeout("estourou", request=requisicao)
        cliente, espiao = montar(roteiro)

        resultado = cliente.percorrer_janela(**JANELA)

        self.assertEqual(espiao.quantas, 2)
        self.assertEqual(resultado.falhas[0].motivo, "rede")

    def test_oscilacao_de_rede_nao_marca_o_retrato(self):
        def roteiro(requisicao, numero):
            if numero == 1:
                raise httpx.ConnectTimeout("estourou", request=requisicao)
            return resposta_json(pagina([edital()]))
        cliente, _ = montar(roteiro)
        self.assertTrue(cliente.percorrer_janela(**JANELA).completa)


class Conversao(unittest.TestCase):
    def test_achata_o_registro_da_api(self):
        linha = converter_item(edital(objeto="Reforma   da\n  creche"), 6, "Pregão Eletrônico")
        self.assertEqual(linha["objeto"], "Reforma da creche")
        self.assertEqual(linha["municipio"], "Foz do Iguaçu")
        self.assertEqual(linha["orgao"], "Município de Foz do Iguaçu")
        self.assertEqual(linha["publicacao"], "2026-08-21")
        self.assertEqual(linha["modalidade_codigo"], 6)
        self.assertEqual(linha["valor"], 100000.0)

    def test_cai_para_a_unidade_quando_nao_ha_razao_social(self):
        cru = edital()
        cru["orgaoEntidade"] = {}
        self.assertEqual(converter_item(cru, 6, "Pregão")["orgao"], "Secretaria de Obras")

    def test_aguenta_campo_faltando(self):
        linha = converter_item({"numeroControlePNCP": "X"}, 4, "Concorrência")
        self.assertEqual(linha["id_pncp"], "X")
        self.assertEqual(linha["objeto"], "")
        self.assertIsNone(linha["valor"])
        self.assertEqual(linha["modalidade_nome"], "Concorrência")
