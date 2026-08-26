# Detalhamento fino — Tanque decantador cônico

Arquivo entregue: `TANQUE_DECANTADOR_DETALHAMENTO_FINO.skp`.
Modelo 3D de fabricação (40.864 faces) + 3 pranchas técnicas 1:1 (18.766 faces).

## Divergência registrada

A folha de detalhamento traz uma "TABELA DE DIMENSÕES **(EXEMPLO)**" com *altura do
cilindro = 900 mm*. A auditoria do PDF do projeto estabeleceu **1300 mm** — correção
manuscrita azul de 100 para 130 cm, numa cadeia 15+130+65+60 = 270 cm que fecha
exatamente. Como a própria folha rotula a tabela como exemplo e instrui "todas as
medidas devem seguir o projeto", foi adotado **1300 mm**. A nota está impressa na
prancha 03.

Idem a inclinação da tampa: a folha sugere 2% "se necessário"; o PDF cota flecha de
150 mm (15 cm). Adotado 150 mm.

## Detalhes construtivos implementados

### Detalhe A — suporte lateral interno (4 unidades a 45°/135°/225°/315°)
Chapa de reforço **curvada** 6 mm acompanhando o raio interno do costado, chapas de
apoio superior e inferior 6 mm, barra roscada Ø16 vertical, arruela lisa + porca
sextavada nas duas extremidades, travessas em tubo 40×40×3 e cordões de filete em
todo contato.

### Detalhe B — suporte inferior / base
Chapa de base 12 mm, chapa vertical 6 mm, quatro reforços triangulares 6 mm, dois
reforços laterais 6 mm, quatro chumbadores Ø16 com arruela e porca sextavada.

### Detalhe C — pé inclinado (3 unidades a 0°/120°/240°)
**Tubo redondo Ø76 × 3 mm** — substitui o perfil dobrado 80×80 da etapa anterior.
Chapa de fixação superior 10 mm perpendicular ao eixo do pé, chapa de reforço curvada
10 mm no costado, dois reforços triangulares 6 mm, chapa de base 12 mm, chumbadores
Ø16 e soldas de filete contínuas. Comprimento 1500 mm, inclinação 25,1°.

### Detalhe D — tampa com aba em L
Ø tampa = Ø tanque + 40 mm → **Ø1140**, sobra radial de **20 mm por lado**, chapa
5 mm, aba em L de 40 mm de altura lapeando o costado, com **solda de filete interna**
e externa.

### Detalhe E — conexão 90° flangeada
Curvas de 90° por **arco toroidal real** (não mitradas), raio longo R60 nas linhas
Ø40 e R50 no dreno Ø50. Tubos com parede real de 3 mm. Juntas flangeadas ANSI B16.5
classe 150 com parafuso sextavado + arruela + porca sextavada modelados.

| Flange | OD | Espessura | Círculo de furação | Furos |
|---|---:|---:|---:|---|
| DN40 (1½") | 127,0 | 17,5 | 98,4 | 4 × Ø16 |
| DN50 (2") | 152,4 | 19,1 | 120,7 | 4 × Ø19 |

### Detalhe F — dreno e válvula
Bocal no cone → flange → **válvula gaveta Ø50** (corpo em três seções, castelo,
haste, volante de 4 braços, parafusos) → flange → tubo de saída.

## Curva 90° — verificação geométrica

Para um quadrante, a extensão no plano da curva vale `R + r` e a normal ao plano
vale `2·r`. Medido no modelo: entrada/saída (R60, r20) → 80/80/40; dreno (R50, r30)
→ 80/80/60. Todas conferem.

O R50 do dreno **não é arbitrado**: a boca do cone está em Z=650 e o eixo do dreno em
Z=600, o que impõe exatamente 50 mm de raio. Um raio longo (R75) exigiria encurtar o
cone para 575 mm, contrariando a anotação a lápis de 600.

## Pranchas

- **P01** — planta superior, elevação frontal, elevação lateral e corte vertical, 1:1
- **P02** — detalhes A a F ampliados (2:1, 1:3, 5:1, 1:2)
- **P03** — tabela de dimensões com a fonte de cada cota (31 linhas) e lista de
  componentes (16 itens)

## Validação

91 de 91 grupos-folha são sólidos fechados, watertight e orientados para fora.
Zero arestas soltas. Nenhuma prancha transborda seu quadro.

## Tags

`01_TANQUE`, `02_TAMPA`, `03_CONE`, `04_INTERNOS`, `05_SUPORTES`, `06_PES`,
`07_TUBULACOES`, `08_CONEXOES`, `09_FLANGES`, `10_PARAFUSOS`, `11_SOLDAS`,
`12_DETALHES`, `13_COTAS`, `14_TEXTOS` + `15_PLANTA`, `16_ELEVACAO`, `17_CORTE`,
`18_EIXOS`, `19_QUADROS`, `00_REFERENCIA`.

## Componentes reutilizáveis

`SUPORTE_LATERAL_INTERNO` (4 instâncias) e `PE_INCLINADO_TUBO_D76` (3 instâncias).

## A CONFIRMAR

Altura da aba L (40 mm), raio das curvas Ø40 (R60), perna de solda (6 mm), tamanho da
chapa de base, cota de fixação dos pés no costado, cotas da calha, posição dos bocais,
e a espessura de chapa do corpo (5 mm manuscrito vs ≈3 mm sugerido pelos pesos do PDF).
