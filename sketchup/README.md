# Tanque Decantador / Separador Cônico Vertical — Modelo 3D Paramétrico

Script de construção paramétrica do tanque decantador no SketchUp, executado via
conector MCP (`build_model`). **Todos os parâmetros estão em milímetros**; a conversão
para as unidades internas do SketchUp (polegadas) é feita num único ponto, na função
`P()` (`S = 1/25.4`).

## Arquivo

- `tanque_decantador.py` — script único e completo. Todos os parâmetros no dicionário
  `PARAM`, no topo do arquivo.

## Sistema de coordenadas

| Eixo | Significado |
|---|---|
| X | largura |
| Y | profundidade |
| Z | vertical |

- Eixo do tanque em `X = 0 / Y = 0`
- `Z = 0` → boca de saída inferior do cone (Ø50)
- `Z = 600` → transição cone / cilindro
- `Z = 1500` → topo do cilindro / base da tampa
- `Z = -600` → piso (base das sapatas)

## Dimensões confirmadas

| Item | Valor |
|---|---|
| Corpo cilíndrico | Ø1100 × 900 mm (z 600 → 1500) |
| Fundo cônico | H600 mm, Ø1100 → Ø50 (z 0 → 600) |
| Tampa superior | Ø1100, flecha 30 mm, abaulada |
| Defletor externo | Ø700 (r = 350) |
| Defletor interno / poço | Ø400 (r = 200) |
| Entrada de alimentação | Ø40 |
| Saída de efluente clarificado | Ø40 |
| Dreno inferior | Ø50 |
| Respiro central | Ø40 |
| Espessura de chapa | 5 mm |
| Pés | **3** unidades, 0° / 120° / 240°, 1500 mm |

## Parâmetros marcados `AJUSTÁVEL`

Cotas cuja leitura no desenho manuscrito não é conclusiva. Estão isoladas em `PARAM`
e podem ser alteradas sem reconstruir o restante do script:

`z_piso`, `perfil_pe_x`, `perfil_pe_y`, `espessura_perfil`, `espessura_flange`,
`raio_flange`, `sapata_x`, `sapata_y`, `sapata_t`, `calha_z_fundo`, `calha_t_fundo`,
`calha_z_topo`, `calha_z_vertedouro`, `calha_r_int`, `z_feedwell_bot`, `z_feedwell_top`,
`z_anel700_bot`, `z_anel700_top`, `z_entrada`, `z_saida`, `theta_entrada`, `theta_saida`.

Observação sobre o perfil dos pés: o desenho indica `#3/16"` (≈ 4,76 mm) e 45 kg para
os 3 pés, o que sugere parede mais espessa que os 2 mm informados no briefing. O valor
de 2 mm foi mantido por ser a especificação explícita; para adotar a leitura do desenho,
basta alterar `espessura_perfil`.

## Tags (Layers)

`00_REFERENCIA`, `01_TANQUE`, `02_TAMPA`, `03_CONE_INFERIOR`, `04_INTERNOS`,
`05_ENTRADA`, `06_SAIDA`, `07_DRENO_VALVULA`, `08_PES`, `09_SUPORTE_CENTRAL`,
`10_FLANGES`, `11_PARAFUSOS`, `12_ESTRUTURA`, `13_COTAS`.

As tags são aplicadas aos **grupos**, nunca às faces/arestas internas. O grupo raiz
`TANQUE_DECANTADOR_COMPLETO` fica *sem* tag, para que ocultar `01_TANQUE` não faça o
modelo inteiro desaparecer.

## Cenas

| Cena | Tags ocultas |
|---|---|
| `01_GERAL` | — |
| `02_INTERNOS_VISIVEIS` | `01_TANQUE`, `02_TAMPA`, `03_CONE_INFERIOR` |
| `03_ESTRUTURA_SUPORTE` | `04_INTERNOS`, `05_ENTRADA`, `06_SAIDA`, `02_TAMPA` |
| `04_VISTA_FRONTAL` | — |
| `05_VISTA_SUPERIOR` | — |

**Atenção:** na API do SketchUp, `scene.add_layer(tag)` **oculta** a tag na cena.

## Helpers reutilizáveis

- `prism_geom(p1, p2, prof_out, prof_in)` — prisma/tubo entre **dois pontos quaisquer**
  (horizontal, vertical ou inclinado). Perfil circular → tubo; perfil retangular → perfil
  estrutural. `prof_in=None` gera peça maciça.
- `shell2_geom(prof_out, prof_in, n)` — casca de revolução **com espessura física**
  (cilindro, tronco de cone, calota, anel), a partir de dois perfis `(raio, z)`.
- `frame_of(p1, p2)` — base ortonormal para orientar qualquer peça no espaço.
- `soften_group` / `soften_ents` — suavização por ângulo entre normais.
- `make_flange`, `make_bolts` — flanges com furo e parafusos simplificados (cabeça
  hexagonal + haste).

## Resolução

64 segmentos no corpo e no cone, 48 na tampa e nos internos, 24 nos tubos,
8–16 em parafusos e peças pequenas. Total ≈ 13.100 faces.

## Validação executada

- 45/45 grupos-folha validados como **sólidos** (`compute_volume` + consistência e
  sentido das normais).
- 0 arestas soltas, 0 arestas de fronteira, 0 arestas não-manifold.
- Conferência dimensional automática contra `PARAM` (corpo, cone, tampa, defletores,
  calha, bocais e dreno).
