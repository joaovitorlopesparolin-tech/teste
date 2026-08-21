# Contratos com markup — Obra 40200 Recanto Cataratas Thermas Resort

Consolidação dos 6 contratos de mão de obra em uma planilha única, com markup de
35% a 40% aplicado sobre todos os valores.

## Arquivos

| Arquivo | O que é |
|---|---|
| `Contratos_Recanto_Cataratas_com_markup.xlsx` | **Entregável.** Planilha final, com fórmulas vivas. |
| `dados_contratos.py` | Dados extraídos dos PDFs (quantidades, valores unitários, cabeçalhos). |
| `gerar_planilha.py` | Gera a planilha a partir de `dados_contratos.py`. |

## Logo

O topo de todas as abas tem uma faixa grafite com espaço reservado à esquerda para
o logo. Salve o logo oficial como **`logo.png`** nesta pasta e rode
`python3 gerar_planilha.py` — ele é embutido automaticamente em todas as abas,
redimensionado para 42 px de altura. Sem o arquivo, a faixa é gerada sem o logo.

## Paleta

Tirada do logo: grafite `#2E2E2E` (faixa e cabeçalhos), amarelo `#FFC91E` (totais e
células editáveis), creme `#FFF8E1` (itens de aditivo), branco na tipografia da
faixa. Azul `#1155CC` marca valores digitados e verde `#15803D`, links entre abas.

## Abas da planilha

- **Parâmetros** — percentuais de markup. A célula **B7** (amarela) é a única que
  precisa ser editada: mude o percentual e a planilha inteira recalcula.
- **Resumo** — um contrato por linha, com totais original / +35% / +40% / aplicado,
  mais um comparativo dos três cenários.
- **Itens Consolidados** — tabela mestre com os 36 itens dos 6 contratos. É a fonte
  única dos dados; as demais abas apenas a referenciam.
- **CT-149 … CT-217** — uma aba por contrato, com cabeçalho, descrição dos aditivos,
  itens e subtotais por aditivo.
- **Conferência** — confronta o calculado com os valores impressos em cada PDF.

## Regra do markup

O markup incide sobre o **valor unitário** de mão de obra. O total de cada item é
recalculado como `quantidade × valor unitário majorado`. A quantidade contratada não
é alterada. Como a quantidade é constante, o total majorado equivale ao total
original × (1 + markup).

Todos os 6 contratos são de mão de obra — o valor de material é 0,00 em 100% dos
itens —, por isso a coluna de material foi omitida.

## Totais

| Cenário | Total dos 6 contratos | Acréscimo |
|---|---:|---:|
| Original | R$ 850.591,71 | — |
| +35% | R$ 1.148.298,81 | R$ 297.707,10 |
| +37,5% (aplicado) | R$ 1.169.563,60 | R$ 318.971,89 |
| +40% | R$ 1.190.828,39 | R$ 340.236,68 |

## Para acrescentar novos contratos

Acrescente o contrato em `dados_contratos.py`, seguindo o formato dos existentes, e
rode `python3 gerar_planilha.py`. As abas, os totais e a conferência são gerados
automaticamente.

## Pendência

O arquivo `CT196__Fabio_Gesso__R00.pdf` traz como razão social do fornecedor
**ROSENILDE RODRIGUES LINDOLFO DE SOUZA** (CNPJ 42.578.638/0001-54). O nome do
arquivo e a razão social do contrato não coincidem — confirmar qual deve constar no
cadastro. A planilha usa a razão social do contrato.
