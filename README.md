# MAS — Motor de Auditoria de Suprimentos

Motor de governança de compras para construção civil, integrado ao ERP **Sienge**
e a um repositório de conhecimento em Markdown. Opera em dois fluxos estritos e
interdependentes:

| Fluxo | Entrada | Saída |
| --- | --- | --- |
| **Indexação** (modo escrita) | diretriz textual do setor de compras | nó `.md` com frontmatter YAML, wikilinks e regras classificadas |
| **Validação** (modo auditoria) | Solicitação de Compra + histórico do Sienge | JSON puro do Protocolo de Resposta |

## Instalação

Requer apenas Python 3.10+. `PyYAML` é opcional (há parser de reserva embutido):

```bash
pip install -e .          # opcional: pip install -e ".[yaml]"
python3 -m mas --help     # ou apenas: mas --help
```

## Estrutura

```
mas/                  motor (indexação, auditoria, unidades, CLI)
base_conhecimento/    nós .md indexados + _registro.yml (projetos e softwares)
diretrizes/           diretrizes brutas do setor de compras (entrada da indexação)
exemplos/             solicitações de compra de exemplo (entrada da auditoria)
tests/                suíte de testes (unittest, sem dependências externas)
.claude/skills/       instruções do agente MAS
```

## Fluxo de Indexação

```bash
python3 -m mas indexar diretrizes/concreto-usinado-fck-30.txt \
  --saida base_conhecimento --alias "CONCRETO USINADO 30MPA"
```

A diretriz bruta começa com o cabeçalho de campos (lido automaticamente; também
pode vir por `--insumo`, `--unidade`, `--centro-de-custo`, `--vigencia`):

```
Insumo: Concreto Usinado FCK 30 MPa
Unidade Sienge: m³
Centro de Custo: 02.01.03 - Estrutura
Vigência: 2026-01-05

O concreto usinado do Projeto Recanto só pode ser requisitado em m³ ...
```

O nó gerado traz:

* **Frontmatter YAML** com os quatro campos obrigatórios (`insumo`,
  `unidade_sienge`, `centro_de_custo`, `data_vigencia`) e os parâmetros de
  auditoria detectados no texto.
* **Interligação automática** de projetos e softwares com colchetes duplos —
  `[[Projeto Recanto]]`, `[[Revit]]`, `[[Eberick]]` —, alimentada por
  `base_conhecimento/_registro.yml`.
* **Regras classificadas** em `Bloqueio Orçamentário`, `Trava de Duplicidade` ou
  `Pendência Técnica`. Classificações incertas saem marcadas com
  *(classificação automática — revisar)*.

Faltando um campo obrigatório, a indexação é interrompida com a lista de campos
ausentes — o nó nunca nasce incompleto.

### Campos do frontmatter

| Campo | Obrigatório | Efeito na auditoria |
| --- | --- | --- |
| `insumo` | sim | chave de busca do nó |
| `unidade_sienge` | sim | unidade exigida pelo Check de Padrão |
| `centro_de_custo` | sim | escopo da regra (`*` vale para qualquer centro) |
| `data_vigencia` | sim | pedido anterior à vigência é barrado |
| `aliases` | não | outras descrições do insumo no Sienge |
| `estrutural` | não | liga o Check de Compatibilização |
| `janela_duplicidade_dias` | não | janela da Trava de Duplicidade (padrão: 15) |
| `tolerancia_quantitativo_percentual` | não | folga aceita frente ao modelo (padrão: 0 = estrito) |
| `unidades_bloqueadas` | não | unidades recusadas para este insumo |
| `preco_unitario_maximo` / `teto_orcamentario` | não | Bloqueio Orçamentário |
| `projetos` / `softwares` | não | interligações; softwares de modelagem viram fontes homologadas |

## Fluxo de Validação

```bash
python3 -m mas auditar exemplos/02-duplicidade-concreto.json
cat pedido.json | python3 -m mas auditar --detalhado
```

### Solicitação de Compra (JSON de entrada)

```json
{
  "insumo": "Concreto Usinado FCK 30 MPa",
  "centro_de_custo": "02.01.03 - Estrutura",
  "quantidade": 48.0,
  "unidade": "m³",
  "data_solicitacao": "2026-03-10",
  "valor_unitario": 465.0,
  "saldo_orcamentario": 90000.0,
  "quantitativo_modelo": { "quantidade": 47.2, "unidade": "m³", "fonte": "Eberick" },
  "compras_recentes": [
    { "insumo": "Concreto Usinado FCK 30 MPa", "centro_de_custo": "02.01.03 - Estrutura",
      "data_faturamento": "2026-01-28", "quantidade": 52.0, "unidade": "m³", "documento": "NF 118420" }
  ]
}
```

Obrigatórios: `insumo`, `centro_de_custo`, `quantidade`, `unidade`,
`data_solicitacao`. `compras_recentes` é o array devolvido pela API do Sienge.
Datas aceitam ISO (`2026-03-10`) ou pt-BR (`10/03/2026`); números aceitam
`1234.56` ou `"1.234,56"`; centros de custo casam pelo código (`02.01.03` =
`02.01.03 - Estrutura`).

### Checks executados

1. **Check de Histórico (Sienge API)** — mesmo insumo (inclusive por alias) e
   mesmo centro de custo faturados há menos de 15 dias (ou a janela do nó)
   barram a solicitação por **Trava de Duplicidade**.
2. **Check de Compatibilização** — insumo `estrutural` exige `quantitativo_modelo`
   extraído de fonte homologada ([[Eberick]], [[Revit]]) e quantidade alinhada
   dentro da tolerância do nó.
3. **Check de Padrão** — unidade ambígua (`caminhão`, `betoneira`, `viagem`,
   `pallet`, `barra`…) ou diferente do cadastro do Sienge invalida o pedido;
   sinônimos da unidade cadastrada (`m3` ≡ `m³`) são aceitos.
4. **Check Orçamentário** — preço unitário acima do teto, valor total acima do
   teto do nó ou acima do saldo do centro de custo geram **Bloqueio Orçamentário**.

Insumo sem nó indexado nunca é aprovado: volta como Pendência Técnica com
encaminhamento ao Fluxo de Indexação.

### Protocolo de Resposta

Saída pura, sem texto ao redor:

```json
{
  "status": "REPROVADO",
  "motivo_bloqueio": "[Trava de Duplicidade] Duplicidade de faturamento: 'Concreto Usinado FCK 30 MPa' (52 m³) já foi faturado para o centro de custo '02.01.03 - Estrutura' em 05/03/2026, documento NF 118995, há 7 dia(s) — dentro da janela de 15 dias prevista na diretriz.",
  "acao_corretiva": "Consulte o saldo em estoque/obra do pedido de 05/03/2026 antes de comprar novamente. Se o consumo já foi comprovado, anexe a medição e reapresente a solicitação após 8 dia(s) ou com liberação formal do setor de compras."
}
```

Aprovado devolve `motivo_bloqueio` e `acao_corretiva` em `null`. Havendo mais de
uma divergência, os motivos são concatenados com ` | ` na ordem dos checks.
`--detalhado` acrescenta `_diagnostico` (fora do protocolo, uso interno).

Códigos de saída: `0` aprovado · `2` reprovado · `1` erro de execução.

## Uso como biblioteca

```python
from mas import BaseConhecimento, auditar, indexar

base = BaseConhecimento("base_conhecimento")
resposta = auditar(pedido_dict, base)          # -> dict do protocolo
no = indexar(texto_da_diretriz)                # -> NoIndexado
no.salvar("base_conhecimento")
```

## Testes

```bash
python3 -m unittest discover -s tests -t .
```

Cobrem unidades, frontmatter, indexação, base de conhecimento, os quatro checks,
a CLI e os exemplos versionados (73 testes, sem dependências externas).
