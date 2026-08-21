# -*- coding: utf-8 -*-
"""
Dados extraídos dos contratos em PDF (Marv Martins Notari Construtora Ltda).
Obra 40200 - Empreita Recanto Cataratas Thermas Resort.

Cada item traz: origem (Inicial / Aditivo N), data do aditivo, unidade construtiva,
referência, código, descrição, unidade, quantidade contratada e valor unitário de
mão de obra. O valor total de cada item é calculado por fórmula no Excel
(quantidade x valor unitário).

Todos os contratos são de mão de obra: o valor de material é 0,00 em 100% dos itens,
por isso a coluna de material foi omitida da planilha.
"""

CONTRATOS = [
    {
        "numero": "CT/164",
        "aba": "CT-164",
        "arquivo": "CT164__CAM_PISOS__R00.pdf",
        "fornecedor": "CAM EMPREITEIRA DE MAO DE OBRA LTDA",
        "cnpj": "01.128.174/0001-05",
        "data_contrato": "27/02/2026",
        "objeto": "Realizar o polimento mecanizado de piso e lajes de concreto.",
        "tipo": "4 - SEM RETENÇÃO",
        "inicio": "03/01/2026",
        "termino": "30/06/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS S/PROLABORE — apresentar guias 100% * 0% sobre mão de obra",
        "itens": [
            # Itens iniciais — Unidade construtiva 4
            ("Inicial", "", "4 - Centro de eventos", "00.000.001.001", "80407",
             "Piso de concreto desempenado", "m²", 2159.30, 15.0000),
            ("Inicial", "", "4 - Centro de eventos", "00.000.001.002", "80408",
             "Piso de concreto polido", "m²", 8709.70, 18.0000),
            # Itens iniciais — Unidade construtiva 5
            ("Inicial", "", "5 - Foyer e restaurante", "00.001.001.001", "80321",
             "Piso de concreto desempenado", "m²", 2661.50, 15.0000),
            ("Inicial", "", "5 - Foyer e restaurante", "00.002.001.001", "80321",
             "Piso de concreto polido", "m²", 709.50, 18.0000),
            # Aditivo 1
            ("Aditivo 1", "24/07/2026", "4 - Centro de eventos", "00.000.001.001", "80407",
             "Piso de concreto desempenado", "m²", 1982.43, 15.0000),
            ("Aditivo 1", "24/07/2026", "4 - Centro de eventos", "00.000.001.002", "80408",
             "Piso de concreto polido", "m²", 1393.32, 18.0000),
        ],
        "aditivos_desc": {
            "Aditivo 1": "Execução de piso polido: 1.393,32 m²; execução de piso desempenado: 1.982,43 m².",
        },
        # Valores de conferência impressos no PDF
        "conf_inicial": 241857.60,
        "conf_aditivos": 54816.21,
        "conf_total": 296673.81,
    },
    {
        "numero": "CT/149",
        "aba": "CT-149",
        "arquivo": "CT149__Wagner_Backes__R00.pdf",
        "fornecedor": "53.000.661 WAGNER LUIZ BACKES MACHADO",
        "cnpj": "53.000.661/0001-83",
        "data_contrato": "17/12/2025",
        "objeto": "Fornecimento de mão de obra estrutura metálica doca maestra.",
        "tipo": "4 - SEM RETENÇÃO",
        "inicio": "12/12/2025",
        "termino": "12/03/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS SOBRE AUTÔNOMO — apresentar guias 0% * 0% sobre mão de obra",
        "itens": [
            ("Inicial", "", "5 - Foyer e restaurante", "00.001.001.001", "80285",
             "Estrutura metálica, escoramento e telhado doca", "vb", 1.0, 42000.0000),
            # Aditivo 1
            ("Aditivo 1", "31/03/2026", "5 - Foyer e restaurante", "00.001.001.002", "80285",
             "Execução de cobertura lateral de 344,35 m², incluindo montagem da estrutura "
             "metálica, instalação de telhas com rufos e calhas. Aplicação de fundo anti "
             "ferrugem em todas as peças.", "vb", 1.0, 51300.0000),
            ("Aditivo 1", "31/03/2026", "5 - Foyer e restaurante", "00.001.001.003", "80285",
             "Execução de cobertura lateral de 212 m², parte métrica montada com rufos e "
             "calhas, incluindo remoção de 02 bicos metálicos. Aplicação de fundo anti "
             "ferrugem em todas as peças.", "vb", 1.0, 26600.0000),
            ("Aditivo 1", "31/03/2026", "5 - Foyer e restaurante", "00.001.001.004", "80285",
             "Remoção de estrutura metálica com fachada em ACM, remoção completa de letreiro, "
             "ACM e estrutura metálica.", "vb", 1.0, 10500.0000),
            # Aditivo 2
            ("Aditivo 2", "03/07/2026", "5 - Foyer e restaurante", "00.001.001.005", "80285",
             "Execução de cobertura metálica para telhado tipo shingle, incluindo adequação e "
             "tratamento anticorrosivo da estrutura, fechamento com telha de zinco, instalação "
             "de rufos, desmontagem de estrutura metálica e fabricação de suporte metálico.",
             "vb", 1.0, 40000.0000),
            ("Aditivo 2", "03/07/2026", "5 - Foyer e restaurante", "00.001.001.006", "80285",
             "Ajuste na calha do Hermes; foi feita uma nova dobragem na calha.", "vb", 1.0, 1200.0000),
            ("Aditivo 2", "03/07/2026", "5 - Foyer e restaurante", "00.001.001.007", "80285",
             "Execução do fechamento lateral centro de eventos.", "vb", 1.0, 14340.0000),
            ("Aditivo 2", "03/07/2026", "5 - Foyer e restaurante", "00.001.001.008", "80285",
             "Preparação das terças para receber uma nova calha, execução de rufo entre o "
             "Vivace e Maestra.", "vb", 1.0, 4900.0000),
            # Aditivo 3
            ("Aditivo 3", "28/07/2026", "5 - Foyer e restaurante", "00.001.001.009", "80285",
             "Fabricação e instalação de 60 m de calha — Maestra.", "vb", 1.0, 7200.0000),
            ("Aditivo 3", "28/07/2026", "5 - Foyer e restaurante", "00.001.001.010", "80285",
             "Fabricação e instalação de 58,00 metros lineares de rufo, incluindo vedação dupla "
             "entre a laje destinada aos aparelhos de ar-condicionado e a cobertura em telhas "
             "shingle.", "vb", 1.0, 2320.0000),
            ("Aditivo 3", "28/07/2026", "5 - Foyer e restaurante", "00.001.001.011", "80285",
             "Desmonte da estrutura metálica existente com cobertura em acrílico, montagem da "
             "nova estrutura metálica para instalação da cobertura em telhas shingle, montagem "
             "da estrutura metálica de apoio para instalação dos vidros.", "vb", 1.0, 3900.0000),
            ("Aditivo 3", "28/07/2026", "5 - Foyer e restaurante", "00.001.001.012", "80285",
             "Ampliação da estrutura metálica na região do bico da cobertura para adequação às "
             "telhas shingle.", "vb", 1.0, 2200.0000),
            ("Aditivo 3", "28/07/2026", "5 - Foyer e restaurante", "00.001.001.013", "80285",
             "Ampliação do beiral da cobertura em 0,70 m ao longo de 60,00 metros lineares, "
             "totalizando 42,00 m² de área adicional de cobertura, incluindo os ajustes "
             "necessários no beiral.", "vb", 1.0, 3800.0000),
        ],
        "aditivos_desc": {
            "Aditivo 1": "Cobertura metálica, montagem e instalação de telhas, incluso rufos e calhas. "
                         "Remoção completa de letreiro, ACM e estrutura metálica. Aplicação de fundo "
                         "anti ferrugem em todas as peças (não estão inclusos itens abrasivos, somente "
                         "mão de obra). Será necessário o uso de Munck.",
            "Aditivo 2": "Cobertura metálica com área aproximada de 185 m² para telhado tipo shingle, "
                         "incluindo limpeza e aplicação de fundo anti ferrugem na estrutura metálica, "
                         "ampliação da estrutura, fechamento com 153 m de telha de zinco, instalação de "
                         "221 m de rufos (entre pingadeiras e algerosas), desmontagem de estrutura "
                         "metálica e revestimento em ACM, e fabricação e instalação de suporte metálico "
                         "para bobina de fio.",
            "Aditivo 3": "Fabricação e instalação de 60,00 m lineares de calha mestra e 58,00 m lineares "
                         "de rufo, incluindo vedação dupla entre a laje destinada aos aparelhos de "
                         "ar-condicionado e a cobertura em telhas shingle. Compreende ainda o desmonte "
                         "da estrutura metálica existente com cobertura em acrílico, montagem da nova "
                         "estrutura, montagem da estrutura de apoio para instalação dos vidros, "
                         "ampliação na região do bico da cobertura e ampliação do beiral em 0,70 m ao "
                         "longo de 60,00 m (42,00 m² adicionais).",
        },
        "conf_inicial": 42000.00,
        "conf_aditivos": 168260.00,
        "conf_total": 210260.00,
    },
    {
        "numero": "CT/196",
        "aba": "CT-196",
        "arquivo": "CT196__Fabio_Gesso__R00.pdf",
        "fornecedor": "ROSENILDE RODRIGUES LINDOLFO DE SOUZA",
        "cnpj": "42.578.638/0001-54",
        "data_contrato": "27/05/2026",
        "objeto": "Fornecimento de mão de obra especializada para montagem e execução de paredes "
                  "em drywall, conforme especificações do projeto.",
        "tipo": "2 - Somente mão de obra sem retenção de INSS e ISSQN",
        "inicio": "18/05/2026",
        "termino": "20/06/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS SOBRE SALÁRIO 100% * 11% e ISSQN 100% * 5% sobre mão de obra",
        "itens": [
            ("Inicial", "", "4 - Centro de eventos", "00.001.001.001", "80388",
             "Execução de parede em drywall, composta por estrutura simples em perfis metálicos "
             "galvanizados, com fechamento em chapas ST, incluindo montagem, fixação e "
             "acabamentos necessários.", "m²", 500.00, 65.0000),
            ("Aditivo 1", "03/07/2026", "4 - Centro de eventos", "00.001.001.001", "80388",
             "Execução de parede em drywall, composta por estrutura simples em perfis metálicos "
             "galvanizados, com fechamento em chapas ST, incluindo montagem, fixação e "
             "acabamentos necessários.", "m²", 700.00, 65.0000),
            ("Aditivo 2", "31/07/2026", "4 - Centro de eventos", "00.001.001.001", "80388",
             "Execução de parede em drywall, composta por estrutura simples em perfis metálicos "
             "galvanizados, com fechamento em chapas ST, incluindo montagem, fixação e "
             "acabamentos necessários.", "m²", 203.75, 65.0000),
            ("Aditivo 2", "31/07/2026", "4 - Centro de eventos", "00.001.001.002", "80362",
             "Execução de requadros em gesso acartonado.", "m", 301.20, 20.0000),
            ("Aditivo 2", "31/07/2026", "4 - Centro de eventos", "00.001.001.003", "80388",
             "Execução de forro em gesso acartonado.", "m²", 317.77, 30.0000),
            ("Aditivo 2", "31/07/2026", "4 - Centro de eventos", "00.001.001.004", "80388",
             "Execução de paredes em Steelframe com MDF.", "m²", 253.46, 70.0000),
        ],
        "aditivos_desc": {
            "Aditivo 1": "Aditivo referente a mais 700 m² de parede dupla de drywall.",
            "Aditivo 2": "Execução de forro em gesso acartonado, execução de requadros em gesso "
                         "acartonado e execução de paredes em Steelframe.",
        },
        "conf_inicial": 32500.00,
        "conf_aditivos": 92043.05,
        "conf_total": 124543.05,
    },
    {
        "numero": "CT/212",
        "aba": "CT-212",
        "arquivo": "CT212__AGR_Delavi__R00.pdf",
        "fornecedor": "AGR DELAVI PISOS LTDA",
        "cnpj": "48.094.845/0001-10",
        "data_contrato": "08/07/2026",
        "objeto": "Fornecimento de mão de obra para execução de piso Fulget no Centro de Eventos "
                  "do Hotel Recanto e do Restaurante.",
        "tipo": "2 - Somente mão de obra sem retenção de INSS e ISSQN",
        "inicio": "08/07/2026",
        "termino": "08/08/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS SOBRE SALÁRIO 100% * 11% e ISSQN 100% * 5% sobre mão de obra",
        "itens": [
            ("Inicial", "", "4 - Centro de eventos", "00.001.001.001", "80409",
             "Execução de piso fulget.", "m²", 1199.04, 80.0000),
        ],
        "aditivos_desc": {},
        "conf_inicial": 95923.20,
        "conf_aditivos": 0.00,
        "conf_total": 95923.20,
    },
    {
        "numero": "CT/216",
        "aba": "CT-216",
        "arquivo": "CT216__Lourival_Bonfim__R00.pdf",
        "fornecedor": "LOURIVAL BONFIM 66371490982",
        "cnpj": "13.932.826/0001-30",
        "data_contrato": "15/07/2026",
        "objeto": "Fornecimento de mão de obra para execução do revestimento em ACM na região do "
                  "porte-cochère do Centro de Eventos do Hotel Recanto.",
        "tipo": "2 - Somente mão de obra sem retenção de INSS e ISSQN",
        "inicio": "25/06/2026",
        "termino": "31/07/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS SOBRE SALÁRIO 100% * 11% e ISSQN 100% * 5% sobre mão de obra",
        "itens": [
            ("Inicial", "", "4 - Centro de eventos", "00.001.001.001", "80391",
             "Execução do revestimento em ACM na região do porte-cochère do Centro de Eventos "
             "do Hotel Recanto.", "vb", 1.0, 60000.0000),
            ("Aditivo 1", "17/08/2026", "4 - Centro de eventos", "00.001.001.002", "80391",
             "Execução do painel de 60x90 cm sobre a porta do Centro de Eventos, execução de "
             "forro em ACM com dimensões de 50x2,40 m, fechamento da porta com dimensões de "
             "4,80x2,40 m e execução das divisórias dos banheiros.", "vb", 1.0, 37671.0000),
        ],
        "aditivos_desc": {
            "Aditivo 1": "Aumento do escopo de serviço. Materiais comprados pelo Lourival; execução do "
                         "painel 60x90 em cima da porta do Centro de Eventos, execução de forro em ACM "
                         "50x2,40, fechamento da porta de 4,80x2,40 e execução das divisórias do banheiro.",
        },
        "conf_inicial": 60000.00,
        "conf_aditivos": 37671.00,
        "conf_total": 97671.00,
    },
    {
        "numero": "CT/217",
        "aba": "CT-217",
        "arquivo": "CT217__Valdemir_Mendes_da_Silva__R00.pdf",
        "fornecedor": "60.623.714 VALDEMIR MENDES DA SILVA",
        "cnpj": "60.623.714/0001-88",
        "data_contrato": "30/07/2026",
        "objeto": "Fornecimento de mão de obra para execução de parede em drywall e execução de "
                  "sanca do Foyer.",
        "tipo": "2 - Somente mão de obra sem retenção de INSS e ISSQN",
        "inicio": "20/07/2026",
        "termino": "20/08/2026",
        "obra": "40200 - Empreita Recanto Cataratas Thermas Resort",
        "impostos": "INSS SOBRE SALÁRIO 100% * 11% e ISSQN 100% * 5% sobre mão de obra",
        "itens": [
            ("Inicial", "", "5 - Foyer e restaurante", "00.001.001.001", "80309",
             "Execução de parede em gesso acartonado (drywall), compreendendo o fornecimento e "
             "montagem da estrutura metálica de perfilação, instalação de isolamento em lã "
             "acústica e fixação das placas de gesso acartonado.", "m²", 62.83, 55.0000),
            ("Inicial", "", "5 - Foyer e restaurante", "00.002.001.001", "80319",
             "Execução de sanca em gesso acartonado.", "m²", 220.00, 60.0000),
            ("Inicial", "", "5 - Foyer e restaurante", "00.002.001.002", "80319",
             "Desmanche de forro em gesso acartonado na região do Foyer.", "m²", 30.00, 20.0000),
            ("Inicial", "", "5 - Foyer e restaurante", "00.002.001.003", "80319",
             "Execução de forro em gesso acartonado, incluindo execução de sanca.", "m²", 115.00, 50.0000),
            ("Inicial", "", "5 - Foyer e restaurante", "00.002.001.004", "80287",
             "Execução de fechamento do portal do elevador.", "unid", 2.00, 300.0000),
            ("Aditivo 1", "19/08/2026", "5 - Foyer e restaurante", "00.001.001.001", "80309",
             "Execução de parede em gesso acartonado (drywall), compreendendo o fornecimento e "
             "montagem da estrutura metálica de perfilação, instalação de isolamento em lã "
             "acústica e fixação das placas de gesso acartonado.", "m²", 13.00, 55.0000),
            ("Aditivo 1", "19/08/2026", "5 - Foyer e restaurante", "00.002.001.003", "80319",
             "Execução de forro em gesso acartonado, incluindo execução de sanca.", "m²", 10.00, 50.0000),
            ("Aditivo 1", "19/08/2026", "5 - Foyer e restaurante", "00.002.001.005", "80274",
             "Fechamento em glassrock, parede externa do Foyer da Torre.", "vb", 1.0, 700.0000),
        ],
        "aditivos_desc": {
            "Aditivo 1": "Aditivo referente à execução de parede, forro e fechamento em glassrock.",
        },
        "conf_inicial": 23605.65,
        "conf_aditivos": 1915.00,
        "conf_total": 25520.65,
    },
]
