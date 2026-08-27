# Revisão final da prancha — R01

Prancha técnica única **A0 deitado, 1189 × 841 mm**, margem parametrizada de 20 mm,
área útil 1149 × 801 mm. Substitui as três pranchas anteriores (P01/P02/P03), que
estouravam o enquadramento.

Script executável: `sketchup/tanque_decantador_R01.py` (20 blocos, executar na ordem).

## 1. Sistema de folha e controle de enquadramento

```
PAPER_WIDTH   = 1189      MARGIN_LEFT   = 20
PAPER_HEIGHT  =  841      MARGIN_RIGHT  = 20
MARGIN        =   20      MARGIN_TOP    = 20
                          MARGIN_BOTTOM = 20
USABLE_WIDTH  = 1149      USABLE_HEIGHT = 801
```

A função `check_bounds(group, sheet_bounds)` percorre os **85 grupos** da prancha,
compara MIN X / MIN Y / MAX X / MAX Y com os limites da folha e devolve os que
ultrapassam. A verificação foi rodada após cada bloco.

**Violações encontradas e corrigidas** (nenhuma foi resolvida cortando desenho):

| # | Elemento | Problema | Correção aplicada |
|---|---|---|---|
| 1 | `LEG_ESCALA_NIVEIS` | guia de níveis chegava a Z = 927 (folha tem 841) | altura do guia recalculada a partir do espaço livre da região |
| 2 | `V02_COTAS` | cota "2700 TOTAL" invadia a região da planta em 6,2 mm | cadeia total movida para o lado direito da vista |
| 3 | `DET_A/B/C_LEGENDA` | legendas de peças caíam abaixo da faixa de detalhes | legendas ancoradas na base da célula, crescendo para cima |
| 4 | `DET_B_GEOMETRIA` | sapata ultrapassava o topo da célula em 7 mm | origem local e altura da caixa reposicionadas |
| 5 | `DET_E_GEOMETRIA` / `DET_E_COTAS` | conexão flangeada invadia o Detalhe D em 7,1 mm | origem local deslocada para −890 |
| 6 | `DET_C_COTAS` | cota vertical 0,1 mm fora da célula | cota afastada 6 mm |
| 7 | `MOLDURA_E_GRID` | linha externa de 1,4 mm centrada na borda extrapolava 0,7 mm | moldura desenhada com *inset* de 0,8 mm |

Verificação final: `MIN_X = 0 / MIN_Y = 0 / MAX_X = 1189 / MAX_Y = 841`,
**nenhum grupo fora da folha**.

## 2. Grid de regiões (9 áreas)

```
Z 466..821   VISTAS      V01 planta | V02 elev. frontal | V03 elev. lateral | V04 corte A-A | legenda
Z 232..466   DETALHES    A | B | C | D | E | F  (6 células de 191,5 mm)
Z  20..232   DADOS       tab. dimensões | lista de componentes | cálculo de volumes |
                         volume por região e nível | notas técnicas | carimbo
```

Escalas individuais, não uma redução global:

| Vista/Detalhe | Escala |
|---|---|
| 01 planta, 02 elevação frontal, 03 elevação lateral, 04 corte A-A | 1:15 |
| A — suporte interno lateral | 1:3 |
| B — suporte inferior / sapata | 1:2 |
| C — pé inclinado | 1:10 |
| D — tampa com aba em "L" | 1:1 |
| E — conexão 90° flangeada | 1:2 |
| F — dreno + válvula | 1:5 |

As quatro vistas principais compartilham o mesmo eixo vertical e a mesma linha de
piso; as cotas ficam sempre fora da geometria.

## 3. Cálculo de volumes (§19–§36)

Dimensões **internas** — Ø interno = Ø externo − 2 × espessura = 1100 − 2 × 5 = **1090**.

| Região | Fórmula | Volume |
|---|---|---|
| Corpo cilíndrico | `V = π·R²·h`, R = 545, h = 1296,71 | 1.210,00 L |
| Fundo cônico | `V = π·h/3·(R² + R·r + r²)`, R = 546,24, r = 21,24, h = 600 | 195,05 L |
| **Volume bruto total** | | **1.405,05 L = 1,4050 m³** |

O diâmetro inferior do cone é diferente de zero, portanto **não** foi tratado como
cone simples: aplicou-se a fórmula do **tronco de cone**.

### Validação geométrica (§46)

Foi construído um sólido de revolução com o perfil interno real e medido com
`compute_volume()` do SketchUp:

```
fórmula matemática ....... 1.405,05 L
geometria do SketchUp .... 1.404,04 L
divergência .............. 0,071 %
```

A divergência **não** foi ignorada nem "escolhida": ela é exatamente o erro de um
polígono de 96 lados aproximando o círculo por falta
(`sin(2π/96)/(2π/96) = 0,99929` → 0,071 %). Não há inconsistência de volume.

### Nível operacional

O PDF **não cota** o nível operacional. A prancha registra isso na Nota 8 e na
tabela T4. Como hipótese geométrica do modelo (marcada **A CONFIRMAR**) adotou-se a
crista da calha vertedora (Z = 2500, h = 1846,71 a partir do fundo interno):

```
V útil ..... 1.358,39 L        V livre ..... 46,66 L
```

A tabela volume × altura de líquido (200 → 1.800 mm, passo 200) permite ler qualquer
outro nível sem depender dessa hipótese, e não passa da geometria existente
(h máx = 1.896,71 mm).

## 4. Modelo 3D (permanece 1:1)

26.808 faces. Nada foi distorcido para a prancha caber — só a representação mudou de escala.

- costado Ø1100 × 1300, cone 600 até Ø50, tampa abaulada Ø1140 e=5 com aba em "L"
  (mesa horizontal + saia de 40 mm lapeando o costado), respiro central 1" BSP;
- internos: calha vertedora Ø1000, defletor Ø700 h900, defletor Ø700→Ø400 h400;
- 4 × `SUPORTE_LATERAL_INTERNO` e 3 × `PE_INCLINADO_TUBO_D76` como **componentes**;
- bocais Ø40 de entrada e saída e dreno Ø50, todos com **curva de 90° por arco
  toroidal real**, e juntas flangeadas ANSI B16.5 classe 150 com parafuso, porca e
  arruela modelados;
- válvula gaveta Ø50 com castelo, haste e volante.

Verificação das curvas — para um quadrante de raio de curvatura R e tubo de raio r,
a extensão no plano da curva deve valer R + r e a extensão normal 2r:

| Curva | Extensão medida (X, Y, Z) | Esperado no plano | Esperado normal | OK |
|---|---|---|---|---|
| Entrada R60 Ø40 | 80 / 40 / 80 | 80 | 40 | ✔ |
| Saída R60 Ø40 | 80 / 40 / 80 | 80 | 40 | ✔ |
| Dreno R50 Ø50 | 75 / 50 / 75 | 75 | 50 | ✔ |

## 5. Cotas derivadas (não estavam no PDF)

- **Ø externo pé a pé = 2554 mm** — resulta de L = 1500 mm e da fixação em Z = 1400
  no costado; inclinação de 23,48° com a vertical. Está marcada como derivada na
  tabela e na Nota 9.
- **R50 do dreno** — imposto pela geometria: boca do cone em Z = 650 e eixo do dreno
  em Z = 600. Não é escolha livre.

## 6. Pendências marcadas "A CONFIRMAR"

1. Nível operacional (item 3 acima).
2. Se Ø1100 é o diâmetro **externo** (adotado) ou o interno. A tabela apresenta os
   dois valores; a capacidade muda ~11 L se a leitura for a outra.
3. Elevação da calha vertedora (Z 2350 a 2500) — não cotada no PDF.
