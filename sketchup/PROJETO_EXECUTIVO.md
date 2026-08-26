# Projeto executivo — Tanque decantador cônico

Entregue no arquivo `TANQUE_DECANTADOR_PROJETO_EXECUTIVO.skp`, gerado no SketchUp
via conector MCP. Este documento registra o que existe no arquivo e como foi verificado.

## Estrutura do arquivo

```
MODELO_3D_TANQUE_DECANTADOR          (21.718 faces)
├── 01_CORPO_CILINDRICO_D1100_H1300
├── 02_FUNDO_CONICO_H600_D1100_P_D50
├── 03_TAMPA_SUPERIOR_D1140
├── 04_ABA_FECHAMENTO_L              (horizontal + saia vertical)
├── RESPIRO_CENTRAL_D40 + FLANGE
├── SOLDAS_PRINCIPAIS
├── 05_SISTEMA_INTERNO               (anel Ø1000, calha, defletores Ø700 / Ø400)
├── 08_ENTRADA_D40                   (tubo + ELBOW_90 + mergulhador + bocal + flange)
├── 09_SAIDA_D40                     (funil + 2 x ELBOW_90 + coluna + 3 luvas + flange)
├── 10_DRENO_D50                     (ELBOW_90 + bocal + 4 flanges + parafusos)
├── 11_VALVULA_D50                   (corpo + castelo + haste + volante + parafusos)
└── 12_TRES_PES                      (3 instâncias a 0° / 120° / 240°)

PRANCHAS_TECNICAS                    (23.080 faces, escala 1:1, plano Y = -4000)
├── PRANCHA_P01  planta baixa
├── PRANCHA_P02  elevação frontal + elevação lateral
├── PRANCHA_P03  corte vertical + 15 balões + legenda
├── PRANCHA_P04  6 detalhes ampliados
└── PRANCHA_P05  tabela de dimensões + lista de componentes
```

## Curva de 90° real

`elbow_geom(Sp, d_in, d_out, Rb, r_out, r_in, n_arc, n_tube)` gera um **arco toroidal**:
a linha de centro percorre um quadrante de raio `Rb` e a seção circular é varrida ao
longo dele. Não é um cotovelo mitrado.

Prova geométrica (medida no modelo): para um quadrante, a extensão no plano da curva
vale `Rb + r_out` e a extensão normal ao plano vale `2 · r_out`.

| Curva | R | r | Esperado no plano | Medido X / Z | Normal | Medido Y |
|---|---:|---:|---:|---|---:|---:|
| ELBOW_90_D50_DRENO | 50 | 30 | 80 | 80 / 80 | 60 | 60 |
| ELBOW_90_D40_ENTRADA | 60 | 20 | 80 | 80 / 80 | 40 | 40 |
| ELBOW_90_D40_SAIDA_A | 60 | 20 | 80 | 80 / 80 | 40 | 40 |
| ELBOW_90_D40_SAIDA_B | 60 | 20 | 80 | 80 / 80 | 40 | 40 |

Cada curva tem 2.016 faces = 20 segmentos de arco × 24 do tubo × 2 cascas × 2 triângulos,
mais 96 das duas tampas — ou seja, 21 anéis intermediários.

## Verificação da tampa (§47 do briefing)

| Grandeza | Valor medido |
|---|---:|
| Ø tampa | 1140 mm |
| Ø tanque | 1100 mm |
| Diferença | **40 mm** |
| Raio tampa / raio tanque | 570 / 550 mm |
| Sobra radial | **20 mm por lado** |
| Aba L — altura útil | 40 mm |

## Desenho técnico

O conector expõe `Entities.add_texts` e `add_dimensions`, mas **não** as classes
`Text` / `Dimension` — apenas os refs C brutos, e `SUTextSetPoint` falhou no teste.
As pranchas foram portanto construídas como **geometria vetorial real**: fonte de
traços (53 glifos, grade 6×10), linhas, setas, arcos, hachuras, balões e linhas de
cota, todos como faces planas no plano Y = −4000. Isso imprime e é medível em
qualquer vista, sem depender de entidades de anotação.

## Sistema de coordenadas

Datum do desenho: `Z = 0` no piso; eixo do dreno em `Z = 600`; junção cone/costado em
`Z = 1250`; topo do costado em `Z = 2550`; topo da tampa em `Z = 2700`.

## Unidade de exibição

Metro (formato decimal, área em m², volume em m³).

## Pendências

Ver `AUDITORIA_PDF.md` — as cotas marcadas `AJUSTAVEL` / `A CONFIRMAR` continuam
valendo, com dois acréscimos desta etapa: altura da aba L (40 mm) e raio das curvas
Ø40 (R60), nenhum dos dois presente no PDF.
