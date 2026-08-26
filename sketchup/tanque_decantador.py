# =============================================================================
# TANQUE DECANTADOR / SEPARADOR CONICO VERTICAL  -  MODELO 3D PARAMETRICO
# COTAS CONFORME AUDITORIA DO PDF ESCANEADO DO PROJETO
# Regra aplicada: ANOTACOES MANUSCRITAS > COTAS IMPRESSAS
# =============================================================================
# Executar via conector MCP do SketchUp (build_model).
# O namespace ja expoe: model, SUPoint3D, SUVector3D, SUTransformation, SUColor,
# GeometryInput, LoopInput, Group, ComponentDefinition, Material, Layer, Scene,
# Camera, TypedValue, RenderingOptionKey, ShadowInfoKey, RenderMode,
# apply_preset, math.  NAO usar 'import'.
#
# UNIDADES DOS PARAMETROS: MILIMETROS (conversao unica em P() via S).
# UNIDADE DE EXIBICAO DO MODELO: METRO (ver bloco 17).
#
# SISTEMA DE COORDENADAS (datum do desenho):
#   X = largura, Y = profundidade, Z = vertical; eixo do tanque em X=0 / Y=0
#   Z =    0  -> PISO (base das sapatas)
#   Z =  600  -> eixo do dreno horizontal Ø50      (PDF manuscrito: 60 cm)
#   Z =  650  -> boca inferior do cone Ø50
#   Z = 1250  -> juncao cone / costado             (PDF manuscrito: 65 cm)
#   Z = 2550  -> topo do costado cilindrico        (PDF manuscrito: 130 cm)
#   Z = 2700  -> topo da tampa abaulada            (PDF manuscrito: 15 cm)
#   TOTAL 2700 mm = 270 cm  (PDF manuscrito, corrige os 250 cm impressos)
# =============================================================================
S = 1.0 / 25.4

def P(x, y, z):
    return SUPoint3D(x * S, y * S, z * S)

# -----------------------------------------------------------------------------
# 1. PARAMETROS  (unico bloco - origem de cada cota indicada no comentario)
# -----------------------------------------------------------------------------
PARAM = {
    # --- cadeia vertical manuscrita (azul): 15 / 130 / 65 / 60 = 270 cm ---
    'z_piso':            0.0,    # PDF manuscrito - base da cadeia de cotas
    'z_dreno_eixo':    600.0,    # PDF manuscrito - 60 cm (impresso 60)
    'z_cone_saida':    650.0,    # derivado - boca Ø50 do cone (600 + curva)
    'z_cone_topo':    1250.0,    # PDF manuscrito - 65 cm (impresso 75)
    'z_costado_topo': 2550.0,    # PDF manuscrito - 130 cm (impresso 100)
    'z_tampa_topo':   2700.0,    # PDF manuscrito - 15 cm / total 270 (impresso 250)

    # --- diametros: vista superior interna, correcoes manuscritas ---
    'diam_tanque':    1100.0,    # PDF manuscrito Ø110 (impresso Ø100)
    'raio_tanque':     550.0,
    'altura_costado': 1300.0,    # PDF manuscrito
    'altura_cone':     600.0,    # PDF lapis "600" junto ao cone
    'diam_anel_ext':  1100.0,    # PDF manuscrito Ø110
    'diam_anel_int':  1000.0,    # PDF manuscrito Ø100 (impresso Ø96)
    'diam_tubo_int':   700.0,    # PDF manuscrito Ø70  (impresso Ø74)
    'h_tubo_int':      900.0,    # PDF lapis "900"
    'diam_cone_int':   400.0,    # PDF manuscrito Ø40  (impresso Ø44)
    'h_cone_int':      400.0,    # PDF linha de cota a lapis "400"
    # verificacao: 900 + 400 = 1300 = altura do costado  (fecha)

    'diam_entrada':     40.0,    # PDF - "40 ø"
    'diam_saida':       40.0,    # PDF - "40 ø"
    'diam_dreno':       50.0,    # PDF - "50 ø" (dreno HORIZONTAL)

    'espessura_chapa':   5.0,    # PDF - detalhe manuscrito "5"
    'comprimento_pe': 1500.0,    # PDF - "3 PES comp. 1500"
    'perfil_pe_a':      80.0,    # PDF - croqui de perfil dobrado 80 x 80
    'perfil_pe_b':      80.0,    # PDF - croqui de perfil dobrado
    'perfil_pe_aba':    20.0,    # PDF - abas/enrijecedores de 20
    'perfil_pe_esp':     4.76,   # PDF - "#3/16"

    # --- ESTIMATIVAS - nao informadas no desenho - CONFIRMAR ---
    'z_pe_fixacao':   1370.0,    # ESTIMATIVA - CONFIRMAR
    'r_pe_topo':       555.0,    # ESTIMATIVA - CONFIRMAR
    'z_calha_fundo':  2400.0,    # ESTIMATIVA - CONFIRMAR
    'z_calha_topo':   2500.0,    # ESTIMATIVA - CONFIRMAR
    'z_entrada':      2450.0,    # ESTIMATIVA - CONFIRMAR
    'z_mergulho':     2000.0,    # ESTIMATIVA - CONFIRMAR
    'z_saida':        2450.0,    # ESTIMATIVA - CONFIRMAR
    'r_coluna_saida': 1100.0,    # ESTIMATIVA - CONFIRMAR
    'z_base_coluna':  1400.0,    # ESTIMATIVA - CONFIRMAR
    'sapata_a':        200.0,    # ESTIMATIVA - CONFIRMAR
    'sapata_b':        160.0,    # ESTIMATIVA - CONFIRMAR
    'sapata_t':         12.0,    # ESTIMATIVA - CONFIRMAR
    'r_valvula':       500.0,    # ESTIMATIVA - CONFIRMAR
    'r_dreno_fim':     900.0,    # ESTIMATIVA - CONFIRMAR

    'seg': 64, 'seg_med': 48, 'seg_peq': 24, 'seg_min': 12,
}

# -----------------------------------------------------------------------------
# DADOS DE MASSA lidos no PDF (NAO sao dimensoes - nao usar na geometria)
# -----------------------------------------------------------------------------
MASSAS_PDF_KG = {
    'TUBO_D1100': 85.0, 'CONE_1100_P_50': 34.0, 'TUBO_D700': 33.0,
    'CONE_D700': 18.0, 'ANEL': 6.0, 'TRES_PES_1500_3_16': 45.0,
    'TAMPA_SUPERIOR': 24.0, 'SUPORTES': 20.0,
}
OBS_PDF = {
    'capacidade': '400 l/hora',
    'pintura': 'VERDE BANDEIRA - tinta R$ 470,00 + jato de areia R$ 500,00',
    'escada': 'ESCADA NAO - nao faz parte do fornecimento',
    'contato': '9972-7205 - RENATO',
}

# -----------------------------------------------------------------------------
# 2. HELPERS GEOMETRICOS REUTILIZAVEIS
# -----------------------------------------------------------------------------
def tri(geom, i0, i1, i2):
    lp = LoopInput()
    lp.add_vertex_index(i0); lp.add_vertex_index(i1); lp.add_vertex_index(i2)
    _, geom = geom.add_face(lp)
    return geom

def quad(geom, i0, i1, i2, i3):
    return tri(tri(geom, i0, i1, i2), i0, i2, i3)

def circ(r, n):
    out = []
    for i in range(n):
        a = 2.0 * math.pi * i / n
        out.append((r * math.cos(a), r * math.sin(a)))
    return out

def rect(w, h):
    return [(-w/2.0, -h/2.0), (w/2.0, -h/2.0), (w/2.0, h/2.0), (-w/2.0, h/2.0)]

def frame_of(p1, p2):
    """Base ortonormal (d, u, v) e comprimento do segmento p1->p2."""
    ax = (p2[0]-p1[0], p2[1]-p1[1], p2[2]-p1[2])
    L = math.sqrt(ax[0]**2 + ax[1]**2 + ax[2]**2)
    d = (ax[0]/L, ax[1]/L, ax[2]/L)
    ref = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    ux = ref[1]*d[2] - ref[2]*d[1]
    uy = ref[2]*d[0] - ref[0]*d[2]
    uz = ref[0]*d[1] - ref[1]*d[0]
    ul = math.sqrt(ux*ux + uy*uy + uz*uz)
    u = (ux/ul, uy/ul, uz/ul)
    v = (d[1]*u[2]-d[2]*u[1], d[2]*u[0]-d[0]*u[2], d[0]*u[1]-d[1]*u[0])
    return d, u, v, L

def prism_geom(p1, p2, prof_out, prof_in=None):
    """Prisma/tubo entre DOIS PONTOS QUAISQUER (horizontal, vertical, inclinado).
    prof = lista de (u, v) em mm, sentido anti-horario.
    prof_in=None -> macico;  prof_in informado -> tubo com parede."""
    d, u, v, L = frame_of(p1, p2)
    n = len(prof_out)
    geom = GeometryInput()
    verts = []
    for base in (p1, p2):
        for (a, b) in prof_out:
            verts.append(P(base[0]+a*u[0]+b*v[0], base[1]+a*u[1]+b*v[1], base[2]+a*u[2]+b*v[2]))
    if prof_in is not None:
        for base in (p1, p2):
            for (a, b) in prof_in:
                verts.append(P(base[0]+a*u[0]+b*v[0], base[1]+a*u[1]+b*v[1], base[2]+a*u[2]+b*v[2]))
    geom.set_vertices(verts)
    ob = list(range(0, n)); ot = list(range(n, 2*n))
    for j in range(n):
        k = (j+1) % n
        geom = quad(geom, ob[j], ob[k], ot[k], ot[j])
    if prof_in is None:
        lp = LoopInput()
        for j in range(n-1, -1, -1): lp.add_vertex_index(ob[j])
        _, geom = geom.add_face(lp)
        lp = LoopInput()
        for j in range(n): lp.add_vertex_index(ot[j])
        _, geom = geom.add_face(lp)
    else:
        ib = list(range(2*n, 3*n)); it = list(range(3*n, 4*n))
        for j in range(n):
            k = (j+1) % n
            geom = quad(geom, ib[j], it[j], it[k], ib[k])
            geom = quad(geom, ob[j], ib[j], ib[k], ob[k])
            geom = quad(geom, ot[j], ot[k], it[k], it[j])
    return geom

def shell2_geom(prof_out, prof_in, n=48):
    """Casca de revolucao COM ESPESSURA (cilindro, tronco de cone, calota, anel).
    prof_out / prof_in = listas de (raio, z) em mm, mesmo comprimento."""
    geom = GeometryInput()
    verts = []; ring_o = []; ring_i = []
    for (r, z) in prof_out:
        s = len(verts)
        for i in range(n):
            a = 2.0 * math.pi * i / n
            verts.append(P(r*math.cos(a), r*math.sin(a), z))
        ring_o.append(list(range(s, s+n)))
    for (r, z) in prof_in:
        s = len(verts)
        for i in range(n):
            a = 2.0 * math.pi * i / n
            verts.append(P(r*math.cos(a), r*math.sin(a), z))
        ring_i.append(list(range(s, s+n)))
    geom.set_vertices(verts)
    m = len(prof_out)
    for k in range(m-1):
        for j in range(n):
            j2 = (j+1) % n
            geom = quad(geom, ring_o[k][j], ring_o[k][j2], ring_o[k+1][j2], ring_o[k+1][j])
            geom = quad(geom, ring_i[k][j], ring_i[k+1][j], ring_i[k+1][j2], ring_i[k][j2])
    for j in range(n):
        j2 = (j+1) % n
        geom = quad(geom, ring_o[0][j], ring_i[0][j], ring_i[0][j2], ring_o[0][j2])
        geom = quad(geom, ring_o[m-1][j], ring_o[m-1][j2], ring_i[m-1][j2], ring_i[m-1][j])
    return geom

def soften_group(g, thresh=0.75):
    soften_ents(g.get_entities(), thresh)

def soften_ents(ents, thresh=0.75):
    for e in ents.get_edges():
        fs = e.get_faces()
        if len(fs) == 2:
            n0 = fs[0].get_normal(); n1 = fs[1].get_normal()
            if n0.x*n1.x + n0.y*n1.y + n0.z*n1.z > thresh:
                e.set_soft(True); e.set_smooth(True)

def get_or_create_material(name, r, g, b, a=255):
    existing = {}
    for m in model.get_materials():
        existing[m.get_name()] = m
    if name in existing:
        return existing[name]
    mat = Material(); mat.set_name(name); mat.set_color(SUColor(r, g, b, a))
    model.add_materials([mat])
    return mat

def apply_mat(g, mat):
    for f in g.get_entities().get_faces():
        f.set_front_material(mat); f.set_back_material(mat)

def apply_mat_def(cd, mat):
    for f in cd.get_entities().get_faces():
        f.set_front_material(mat); f.set_back_material(mat)

def get_or_create_definition(name):
    for d in model.get_component_definitions():
        if d.get_name() == name:
            return d, False
    cd = ComponentDefinition(); cd.set_name(name)
    model.add_component_definitions([cd])
    return cd, True

def mk(parent_ents, name, layer=None):
    g = Group(); parent_ents.add_group(g); g.set_name(name)
    if layer is not None:
        g.set_layer(layer)
    return g

# -----------------------------------------------------------------------------
# 3. TAGS
# -----------------------------------------------------------------------------
TAG_NAMES = ['00_REFERENCIA','01_TANQUE','02_TAMPA','03_CONE_INFERIOR','04_INTERNOS',
             '05_ENTRADA','06_SAIDA','07_DRENO_VALVULA','08_PES','09_SUPORTE_CENTRAL',
             '10_FLANGES','11_PARAFUSOS','12_ESTRUTURA','13_COTAS']
TAGS = {}; _new = []
for nm in TAG_NAMES:
    L = Layer(); L.set_name(nm); TAGS[nm] = L; _new.append(L)
model.add_layers(_new)

MAT = {
    'inox':     get_or_create_material('Aco_Inox_Casco',   178, 182, 186),
    'inox_esc': get_or_create_material('Aco_Interno',      142, 149, 156),
    'estrut':   get_or_create_material('Aco_Estrutural',    92,  99, 108),
    'tubo':     get_or_create_material('Aco_Tubulacao',    158, 164, 170),
    'flange':   get_or_create_material('Aco_Flange',       120, 126, 133),
    'parafuso': get_or_create_material('Aco_Parafuso',      70,  74,  80),
    'valvula':  get_or_create_material('Valvula_Vermelho', 168,  48,  42),
    'volante':  get_or_create_material('Volante_Preto',     48,  50,  54),
}

def make_flange(parent_ents, name, p1, p2, r_out, r_bore, mat, n=32):
    g = mk(parent_ents, name, TAGS['10_FLANGES'])
    g.get_entities().fill(prism_geom(p1, p2, circ(r_out, n), circ(r_bore, n)), weld_vertices=True)
    soften_group(g); apply_mat(g, mat)
    return g

def make_bolts(parent_ents, name, p1, p2, r_circle, nb, dbolt, mat):
    """Parafusos simplificados: haste cilindrica + cabeca hexagonal nas duas pontas."""
    d, u, v, L = frame_of(p1, p2)
    g = mk(parent_ents, name, TAGS['11_PARAFUSOS'])
    E = g.get_entities()
    for i in range(nb):
        a = 2.0 * math.pi * i / nb
        ox = r_circle*(math.cos(a)*u[0] + math.sin(a)*v[0])
        oy = r_circle*(math.cos(a)*u[1] + math.sin(a)*v[1])
        oz = r_circle*(math.cos(a)*u[2] + math.sin(a)*v[2])
        q1 = (p1[0]+ox, p1[1]+oy, p1[2]+oz)
        q2 = (p2[0]+ox, p2[1]+oy, p2[2]+oz)
        hd = dbolt * 0.65
        E.fill(prism_geom(q1, q2, circ(dbolt*0.38, 8)), weld_vertices=True)
        E.fill(prism_geom(q1, (q1[0]-d[0]*hd, q1[1]-d[1]*hd, q1[2]-d[2]*hd),
                          circ(dbolt*0.58, 6)), weld_vertices=True)
        E.fill(prism_geom(q2, (q2[0]+d[0]*hd, q2[1]+d[1]*hd, q2[2]+d[2]*hd),
                          circ(dbolt*0.58, 6)), weld_vertices=True)
    soften_group(g, 0.6); apply_mat(g, mat)
    return g

# -----------------------------------------------------------------------------
# 4. GRUPO RAIZ  (sem tag, para nao desaparecer ao ocultar 01_TANQUE)
# -----------------------------------------------------------------------------
root = Group(); model.get_entities().add_group(root)
root.set_name('TANQUE_DECANTADOR_COMPLETO')
RE = root.get_entities()
R  = PARAM['raio_tanque']; CH = PARAM['espessura_chapa']
NS = PARAM['seg']; NM = PARAM['seg_med']; NP = PARAM['seg_peq']

def make_flange(pe, name, p1, p2, ro, rb, mat, n=32):
    g = mk(pe, name, TAGS['10_FLANGES'])
    g.get_entities().fill(prism_geom(p1, p2, circ(ro, n), circ(rb, n)), weld_vertices=True)
    soften_group(g); apply_mat(g, mat); return g

def make_bolts(pe, name, p1, p2, rc, nb, db, mat):
    """Parafusos simplificados: haste + cabeca hexagonal nas duas pontas."""
    d, u, v, L = frame_of(p1, p2)
    g = mk(pe, name, TAGS['11_PARAFUSOS']); E = g.get_entities()
    for i in range(nb):
        a = 2.0*math.pi*i/nb
        ox = rc*(math.cos(a)*u[0]+math.sin(a)*v[0])
        oy = rc*(math.cos(a)*u[1]+math.sin(a)*v[1])
        oz = rc*(math.cos(a)*u[2]+math.sin(a)*v[2])
        q1 = (p1[0]+ox, p1[1]+oy, p1[2]+oz); q2 = (p2[0]+ox, p2[1]+oy, p2[2]+oz)
        hd = db*0.65
        E.fill(prism_geom(q1, q2, circ(db*0.38, 8)), weld_vertices=True)
        E.fill(prism_geom(q1, (q1[0]-d[0]*hd, q1[1]-d[1]*hd, q1[2]-d[2]*hd),
                          circ(db*0.58, 6)), weld_vertices=True)
        E.fill(prism_geom(q2, (q2[0]+d[0]*hd, q2[1]+d[1]*hd, q2[2]+d[2]*hd),
                          circ(db*0.58, 6)), weld_vertices=True)
    soften_group(g, 0.6); apply_mat(g, mat); return g

# -----------------------------------------------------------------------------
# 5. COSTADO CILINDRICO  Ø1100 x 1300   (z 1250 -> 2550)   [PDF manuscrito]
# -----------------------------------------------------------------------------
g_cil = mk(RE, 'CORPO_CILINDRICO_D1100_H1300', TAGS['01_TANQUE'])
g_cil.get_entities().fill(shell2_geom(
    [(R, 1250.0), (R, 2550.0)], [(R-CH, 1250.0), (R-CH, 2550.0)], NS), weld_vertices=True)
soften_group(g_cil); apply_mat(g_cil, MAT['inox'])

# -----------------------------------------------------------------------------
# 6. FUNDO CONICO  Ø1100 -> Ø50, h 600   (z 650 -> 1250)   [PDF lapis "600"]
# -----------------------------------------------------------------------------
g_cone = mk(RE, 'FUNDO_CONICO_H600_D1100_P_D50', TAGS['03_CONE_INFERIOR'])
g_cone.get_entities().fill(shell2_geom(
    [(30.0, 650.0), (R, 1250.0)], [(25.0, 650.0), (R-CH, 1250.0)], NS), weld_vertices=True)
soften_group(g_cone); apply_mat(g_cone, MAT['inox'])

# -----------------------------------------------------------------------------
# 7. TAMPA ABAULADA, flecha 150   (z 2550 -> 2700)   [PDF manuscrito 15 cm]
# -----------------------------------------------------------------------------
po = []; pi = []
for r in [550.0, 470.0, 380.0, 280.0, 170.0, 80.0, 25.0]:
    z = 2550.0 + 150.0*(1.0-(r/550.0)**2)
    po.append((r, z)); pi.append((r, z-CH))
g_tampa = mk(RE, 'TAMPA_SUPERIOR_FLECHA_150', TAGS['02_TAMPA'])
g_tampa.get_entities().fill(shell2_geom(po, pi, NM), weld_vertices=True)
soften_group(g_tampa); apply_mat(g_tampa, MAT['inox'])
z_apex = po[-1][1]

g_resp = mk(RE, 'RESPIRO_CENTRAL_D40', TAGS['02_TAMPA'])
g_resp.get_entities().fill(prism_geom((0., 0., z_apex-12.), (0., 0., z_apex+140.),
                                      circ(20., NP), circ(15., NP)), weld_vertices=True)
soften_group(g_resp); apply_mat(g_resp, MAT['tubo'])

# -----------------------------------------------------------------------------
# 8. SISTEMA INTERNO   (vista superior: Ø1100 / Ø1000 / Ø700 / Ø400)
#    900 (tubo Ø700) + 400 (cone Ø700->Ø400) = 1300 = altura do costado
# -----------------------------------------------------------------------------
g_int = mk(RE, 'SISTEMA_INTERNO', TAGS['04_INTERNOS']); IE = g_int.get_entities()

g_anel = mk(IE, 'ANEL_D1100_D1000', TAGS['04_INTERNOS'])
g_anel.get_entities().fill(shell2_geom([(550., 2395.), (550., 2400.)],
                                       [(500., 2395.), (500., 2400.)], NM), weld_vertices=True)
soften_group(g_anel); apply_mat(g_anel, MAT['inox_esc'])

g_calha = mk(IE, 'CALHA_VERTEDOURO_D1000', TAGS['04_INTERNOS'])
g_calha.get_entities().fill(shell2_geom([(500., 2400.), (500., 2500.)],
                                        [(495., 2400.), (495., 2500.)], NM), weld_vertices=True)
soften_group(g_calha); apply_mat(g_calha, MAT['inox_esc'])

g_t700 = mk(IE, 'TUBO_INTERNO_D700_H900', TAGS['04_INTERNOS'])
g_t700.get_entities().fill(shell2_geom([(350., 1650.), (350., 2550.)],
                                       [(345., 1650.), (345., 2550.)], NM), weld_vertices=True)
soften_group(g_t700); apply_mat(g_t700, MAT['inox_esc'])

g_c700 = mk(IE, 'CONE_INTERNO_D700_D400_H400', TAGS['04_INTERNOS'])
g_c700.get_entities().fill(shell2_geom([(200., 1250.), (350., 1650.)],
                                       [(195., 1250.), (345., 1650.)], NM), weld_vertices=True)
soften_group(g_c700); apply_mat(g_c700, MAT['inox_esc'])

g_sus = mk(IE, 'SUSTENTACAO_INTERNOS', TAGS['04_INTERNOS'])   # ESTIMATIVA
for i in range(4):
    a = math.radians(45.0+90.0*i)
    g_sus.get_entities().fill(prism_geom(
        (352.*math.cos(a), 352.*math.sin(a), 2500.),
        (545.*math.cos(a), 545.*math.sin(a), 2530.), rect(70., 6.)), weld_vertices=True)
soften_group(g_sus, 0.9); apply_mat(g_sus, MAT['estrut'])

# -----------------------------------------------------------------------------
# 9. ENTRADA Ø40 - bocal superior lateral + tubo mergulhador (seta p/ baixo)
# -----------------------------------------------------------------------------
ZE = PARAM['z_entrada']
g_ent = mk(RE, 'ENTRADA_ALIMENTACAO', TAGS['05_ENTRADA']); EE = g_ent.get_entities()
g_te = mk(EE, 'TUBO_ENTRADA_D40', TAGS['05_ENTRADA'])
g_te.get_entities().fill(prism_geom((-1150., 0., ZE), (-450., 0., ZE),
                                    circ(20., NP), circ(15., NP)), weld_vertices=True)
g_te.get_entities().fill(prism_geom((-450., 0., ZE+20.), (-450., 0., PARAM['z_mergulho']),
                                    circ(20., NP), circ(15., NP)), weld_vertices=True)
soften_group(g_te); apply_mat(g_te, MAT['tubo'])
g_lve = mk(EE, 'LUVA_PASSAGEM_ENTRADA', TAGS['05_ENTRADA'])
g_lve.get_entities().fill(prism_geom((-585., 0., ZE), (-515., 0., ZE),
                                     circ(34., NP), circ(20., NP)), weld_vertices=True)
soften_group(g_lve); apply_mat(g_lve, MAT['flange'])
make_flange(EE, 'FLANGE_ENTRADA_D40', (-1150., 0., ZE), (-1135., 0., ZE), 62., 20., MAT['flange'])
make_bolts(EE, 'PARAFUSOS_ENTRADA_D40', (-1152., 0., ZE), (-1133., 0., ZE), 46., 4, 12., MAT['parafuso'])

# -----------------------------------------------------------------------------
# 10. SAIDA Ø40 - coletor interno -> tubo horizontal -> coluna descendente
# -----------------------------------------------------------------------------
ZS = PARAM['z_saida']; RC = PARAM['r_coluna_saida']
g_sai = mk(RE, 'SAIDA_EFLUENTE_CLARIFICADO', TAGS['06_SAIDA']); SE = g_sai.get_entities()
g_fun = mk(SE, 'COLETOR_FUNIL', TAGS['06_SAIDA'])
g_fun.get_entities().fill(shell2_geom([(22., ZS+15.), (160., ZS+120.)],
                                      [(17., ZS+15.), (155., ZS+120.)], NM), weld_vertices=True)
soften_group(g_fun); apply_mat(g_fun, MAT['inox_esc'])
g_fun.set_transform(SUTransformation([1,0,0,0, 0,1,0,0, 0,0,1,0, -180.0/25.4, 0, 0, 1]))
g_ts = mk(SE, 'TUBO_SAIDA_D40', TAGS['06_SAIDA'])
g_ts.get_entities().fill(prism_geom((-180., 0., ZS), (RC, 0., ZS),
                                    circ(20., NP), circ(15., NP)), weld_vertices=True)
g_ts.get_entities().fill(prism_geom((RC, 0., ZS+20.), (RC, 0., PARAM['z_base_coluna']),
                                    circ(20., NP), circ(15., NP)), weld_vertices=True)
soften_group(g_ts); apply_mat(g_ts, MAT['tubo'])
g_lvs = mk(SE, 'LUVA_PASSAGEM_SAIDA', TAGS['06_SAIDA'])
g_lvs.get_entities().fill(prism_geom((515., 0., ZS), (585., 0., ZS),
                                     circ(34., NP), circ(20., NP)), weld_vertices=True)
soften_group(g_lvs); apply_mat(g_lvs, MAT['flange'])
make_flange(SE, 'FLANGE_SAIDA_D40', (RC, 0., PARAM['z_base_coluna']),
            (RC, 0., PARAM['z_base_coluna']-15.), 62., 20., MAT['flange'])
make_bolts(SE, 'PARAFUSOS_SAIDA_D40', (RC, 0., PARAM['z_base_coluna']+2.),
           (RC, 0., PARAM['z_base_coluna']-17.), 46., 4, 12., MAT['parafuso'])

# -----------------------------------------------------------------------------
# 11. DRENO Ø50 HORIZONTAL (eixo Z=600) + VALVULA DE ALAVANCA   [PDF]
# -----------------------------------------------------------------------------
ZD = PARAM['z_dreno_eixo']
g_dre = mk(RE, 'DRENO_INFERIOR', TAGS['07_DRENO_VALVULA']); DE = g_dre.get_entities()
g_pes = mk(DE, 'PESCOCO_CURVA_D50', TAGS['07_DRENO_VALVULA'])
g_pes.get_entities().fill(prism_geom((0., 0., ZD), (0., 0., PARAM['z_cone_saida']+5.),
                                     circ(30., NP), circ(25., NP)), weld_vertices=True)
g_pes.get_entities().fill(prism_geom((0., 0., ZD), (-400., 0., ZD),
                                     circ(30., NP), circ(25., NP)), weld_vertices=True)
soften_group(g_pes); apply_mat(g_pes, MAT['tubo'])
make_flange(DE, 'FLANGE_D50_A', (-400., 0., ZD), (-415., 0., ZD), 90., 25., MAT['flange'])
make_flange(DE, 'FLANGE_D50_B', (-415., 0., ZD), (-430., 0., ZD), 90., 25., MAT['flange'])
make_bolts(DE, 'PARAFUSOS_DRENO_A', (-397., 0., ZD), (-433., 0., ZD), 70., 4, 16., MAT['parafuso'])

g_val = mk(DE, 'VALVULA_D50', TAGS['07_DRENO_VALVULA']); VE = g_val.get_entities()
g_vc = mk(VE, 'CORPO_VALVULA', TAGS['07_DRENO_VALVULA'])
g_vc.get_entities().fill(prism_geom((-430., 0., ZD), (-570., 0., ZD),
                                    circ(72., 32), circ(25., 32)), weld_vertices=True)
soften_group(g_vc); apply_mat(g_vc, MAT['valvula'])
g_vh = mk(VE, 'HASTE_ALAVANCA', TAGS['07_DRENO_VALVULA'])
g_vh.get_entities().fill(prism_geom((-500., 0., ZD+60.), (-500., 0., ZD+150.),
                                    circ(11., NP)), weld_vertices=True)
g_vh.get_entities().fill(prism_geom((-500., 0., ZD+55.), (-500., 0., ZD+90.),
                                    circ(30., NP), circ(12., NP)), weld_vertices=True)
soften_group(g_vh, 0.6); apply_mat(g_vh, MAT['valvula'])
g_al = mk(VE, 'ALAVANCA', TAGS['07_DRENO_VALVULA'])
g_al.get_entities().fill(prism_geom((-500., -130., ZD+150.), (-500., 130., ZD+150.),
                                    rect(22., 16.)), weld_vertices=True)
for sg in [-1., 1.]:
    g_al.get_entities().fill(prism_geom((-500., sg*130., ZD+150.), (-500., sg*175., ZD+128.),
                                        rect(16., 12.)), weld_vertices=True)
soften_group(g_al, 0.9); apply_mat(g_al, MAT['volante'])

make_flange(DE, 'FLANGE_D50_C', (-570., 0., ZD), (-585., 0., ZD), 90., 25., MAT['flange'])
make_flange(DE, 'FLANGE_D50_D', (-585., 0., ZD), (-600., 0., ZD), 90., 25., MAT['flange'])
make_bolts(DE, 'PARAFUSOS_DRENO_B', (-567., 0., ZD), (-603., 0., ZD), 70., 4, 16., MAT['parafuso'])
g_tsd = mk(DE, 'TUBO_SAIDA_DRENO_D50', TAGS['07_DRENO_VALVULA'])
g_tsd.get_entities().fill(prism_geom((-600., 0., ZD), (-PARAM['r_dreno_fim'], 0., ZD),
                                     circ(30., NP), circ(25., NP)), weld_vertices=True)
soften_group(g_tsd); apply_mat(g_tsd, MAT['tubo'])

# -----------------------------------------------------------------------------
# 12. TRES PES - perfil dobrado 80 x 80 com abas 20, chapa #3/16   [PDF croqui]
# -----------------------------------------------------------------------------
A = PARAM['perfil_pe_a']; B = PARAM['perfil_pe_b']
AB = PARAM['perfil_pe_aba']; T = PARAM['perfil_pe_esp']

def perfil_pe():
    """Contorno fechado do perfil dobrado 80x80 com abas de 20 (sentido CCW)."""
    pts = [(AB, B), (0., B), (0., 0.), (A, 0.), (A, AB),
           (A-T, AB), (A-T, T), (T, T), (T, B-T), (AB, B-T)]
    return [(x-A/2.0, y-B/2.0) for (x, y) in pts]

PROF   = perfil_pe()
R_TOP  = PARAM['r_pe_topo']; Z_TOP = PARAM['z_pe_fixacao']
SAP_T  = PARAM['sapata_t'];  Z_BOT = SAP_T
DZ     = Z_TOP - Z_BOT
DR     = math.sqrt(PARAM['comprimento_pe']**2 - DZ**2)   # garante L = 1500 exatos
R_BOT  = R_TOP + DR

cd_pe, is_new = get_or_create_definition('PE_TANQUE_PERFIL_80x80_AB20')
if is_new:
    PEE = cd_pe.get_entities()
    g_p = mk(PEE, 'PERFIL_PE_80x80_ABA20', TAGS['08_PES'])
    g_p.get_entities().fill(prism_geom((R_TOP, 0., Z_TOP), (R_BOT, 0., Z_BOT), PROF),
                            weld_vertices=True)
    soften_ents(g_p.get_entities(), 0.95); apply_mat(g_p, MAT['estrut'])

    g_c = mk(PEE, 'CONSOLES_FIXACAO_COSTADO', TAGS['08_PES'])
    for zc in [1300.0, 1440.0]:
        g_c.get_entities().fill(prism_geom((543., 0., zc), (625., 0., zc), rect(150., 12.)),
                                weld_vertices=True)
    soften_ents(g_c.get_entities(), 0.95); apply_mat(g_c, MAT['estrut'])
    make_bolts(PEE, 'PARAFUSOS_CONSOLES', (600., 0., 1288.), (600., 0., 1452.),
               82., 2, 16., MAT['parafuso'])

    g_s = mk(PEE, 'SAPATA_200x160x12', TAGS['08_PES'])
    g_s.get_entities().fill(prism_geom((R_BOT, 0., 0.), (R_BOT, 0., SAP_T),
                                       rect(PARAM['sapata_b'], PARAM['sapata_a'])),
                            weld_vertices=True)
    soften_ents(g_s.get_entities(), 0.95); apply_mat(g_s, MAT['estrut'])

    g_e = mk(PEE, 'ENRIJECEDORES_SAPATA', TAGS['08_PES'])
    for sg in [-1., 1.]:
        g_e.get_entities().fill(prism_geom((R_BOT, sg*46., SAP_T), (R_BOT, sg*46., SAP_T+110.),
                                           rect(8., 110.)), weld_vertices=True)
    soften_ents(g_e.get_entities(), 0.95); apply_mat(g_e, MAT['estrut'])

    make_bolts(PEE, 'CHUMBADORES', (R_BOT, 0., -90.), (R_BOT, 0., SAP_T),
               55., 2, 18., MAT['parafuso'])

g_pes3 = mk(RE, 'TRES_PES_INCLINADOS', TAGS['08_PES'])
for i in range(3):
    ang = math.radians(120.0*i); ca = math.cos(ang); sa = math.sin(ang)
    inst = cd_pe.create_instance(); inst.set_name('PE_%02d' % (i+1))
    inst.set_transform(SUTransformation([ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
    inst.set_layer(TAGS['08_PES'])
    g_pes3.get_entities().add_instance(inst)

# NOTA: o desenho traz "ESCADA NAO" -> escada, estrutura tubular e travamento
# central NAO sao modelados (nao constam do fornecimento / do desenho).

# -----------------------------------------------------------------------------
# 13. VALIDACAO DE SOLIDOS
# -----------------------------------------------------------------------------
def leaves(ents, acc):
    for g in ents.get_groups():
        e = g.get_entities()
        if e.get_groups() or e.get_instances(): leaves(e, acc)
        else: acc.append(g)
    return acc

def orient_ok(g):
    for ed in g.get_entities().get_edges():
        fs = ed.get_faces()
        if len(fs) == 2 and ed.is_reversed_in_face(fs[0]) == ed.is_reversed_in_face(fs[1]):
            return False
    return True

def outward(g):
    s = 0.0
    for f in g.get_entities().get_faces():
        n = f.get_normal(); a = f.get_area(); vs = f.get_vertices()
        if not vs: continue
        cx = 0.0; cy = 0.0; cz = 0.0
        for v in vs:
            p = v.get_position(); cx += p.x; cy += p.y; cz += p.z
        k = len(vs); s += a*(n.x*cx/k + n.y*cy/k + n.z*cz/k)
    return s > 0

allg = leaves(root.get_entities(), [])
for d in model.get_component_definitions(): allg = leaves(d.get_entities(), allg)
for g in allg:
    e = g.get_entities()
    st = [ed for ed in e.get_edges() if ed.get_num_faces() == 0]
    if st: e.erase_entities(st)
if [g for g in allg if not orient_ok(g)]: model.orient_faces_consistently(True)
for g in allg:
    if not outward(g):
        for f in g.get_entities().get_faces(): f.reverse()

# -----------------------------------------------------------------------------
# 14. CENAS   (ATENCAO: scene.add_layer() OCULTA a tag)
# -----------------------------------------------------------------------------
scene_defs = [('01_GERAL', []),
              ('02_INTERNOS_VISIVEIS', ['01_TANQUE', '02_TAMPA', '03_CONE_INFERIOR']),
              ('03_ESTRUTURA_E_PES', ['04_INTERNOS', '05_ENTRADA', '06_SAIDA', '02_TAMPA']),
              ('04_VISTA_FRONTAL', []),
              ('05_VISTA_SUPERIOR', [])]
scenes = []
for nm, _h in scene_defs:
    sc = Scene(); sc.set_name(nm); scenes.append(sc)
model.add_scenes(scenes)

rb = root.get_bounding_box()
xmin, ymin, zmin = rb.min_point[0], rb.min_point[1], rb.min_point[2]
xmax, ymax, zmax = rb.max_point[0], rb.max_point[1], rb.max_point[2]
cx = (xmin+xmax)/2.; cy = (ymin+ymax)/2.; cz = (zmin+zmax)/2.
w = xmax-xmin; d = ymax-ymin; h = zmax-zmin

def hero(fov, az, el, aspect=0.85, margin=1.22):
    ar = math.radians(az); er = math.radians(el)
    dx = math.cos(ar)*math.cos(er); dy = -math.sin(ar)*math.cos(er); dz = math.sin(er)
    rl = math.sqrt(dx*dx+dy*dy); rx = -dy/rl; ry = dx/rl; rz = 0.0
    ux = dy*rz-dz*ry; uy = dz*rx-dx*rz; uz = dx*ry-dy*rx
    he = abs(rx)*w + abs(ry)*d + abs(rz)*h
    ve = abs(ux)*w + abs(uy)*d + abs(uz)*h
    hv = math.radians(fov/2.); hh = math.atan(aspect*math.tan(hv))
    dist = max((ve/2.)/math.tan(hv), (he/2.)/math.tan(hh))*margin
    return (SUPoint3D(cx+dist*dx, cy+dist*dy, cz+dist*dz), SUPoint3D(cx, cy, zmin+h*0.45))

def cam(eye, tgt, fov):
    c = Camera(); c.set_orientation(eye, tgt, SUVector3D(0, 0, 1))
    c.enable_perspective(); c.set_perspective_frustum_fov(fov); return c

FOV = 32.0
e0, t0 = hero(FOV, 45., 20.)
e1, t1 = hero(FOV, 35., 10., margin=1.02)
e2, t2 = hero(FOV, 55., 6.,  margin=1.15)
specs = [(e0, t0, FOV), (e1, t1, FOV), (e2, t2, FOV),
         (SUPoint3D(cx, cy-520., cz), SUPoint3D(cx, cy, cz), 15.0),
         (SUPoint3D(cx+0.01, cy, zmax+520.), SUPoint3D(cx, cy, zmin), 15.0)]
for i, (nm, hide) in enumerate(scene_defs):
    eye, tgt, fv = specs[i]
    scenes[i].set_use_camera(True); scenes[i].set_camera(cam(eye, tgt, fv))
    scenes[i].set_use_hidden_layers(True)
    for hl in hide: scenes[i].add_layer(TAGS[hl])
model.set_active_scene(scenes[0])

# -----------------------------------------------------------------------------
# 15. ESTILO
# -----------------------------------------------------------------------------
ESTILO = {'rendering_options': {
    'EDGE_DISPLAY_MODE': TypedValue(int_value=1), 'EDGE_COLOR_MODE': TypedValue(int_value=0),
    'RENDER_MODE': TypedValue(int_value=2), 'MODEL_TRANSPARENCY': TypedValue(bool_value=False),
    'MATERIAL_TRANSPARENCY': TypedValue(bool_value=True),
    'DRAW_DEPTH_QUE': TypedValue(bool_value=False), 'DEPTH_QUE_WIDTH': TypedValue(int_value=1),
    'DRAW_SILHOUETTES': TypedValue(bool_value=True), 'SILHOUETTE_WIDTH': TypedValue(int_value=2),
    'DRAW_HORIZON': TypedValue(bool_value=False), 'DRAW_GROUND': TypedValue(bool_value=False),
    'DISPLAY_SKETCH_AXES': TypedValue(bool_value=False),
    'HIGHLIGHT_COLOR': TypedValue(color_value=SUColor(0, 1, 255, 255)),
    'LOCKED_COLOR': TypedValue(color_value=SUColor(255, 0, 0, 255)),
    'BACKGROUND_COLOR': TypedValue(color_value=SUColor(214, 216, 218, 255)),
    'FACE_FRONT_COLOR': TypedValue(color_value=SUColor(245, 240, 230, 255)),
    'FACE_BACK_COLOR': TypedValue(color_value=SUColor(180, 178, 170, 255)),
    'FOREGROUND_COLOR': TypedValue(color_value=SUColor(50, 48, 45, 255)),
    'AMBIENT_OCCLUSION': TypedValue(bool_value=False)},
  'shadow_info': {'DISPLAY_SHADOWS': TypedValue(bool_value=True),
    'LIGHT': TypedValue(int_value=80), 'DARK': TypedValue(int_value=62)}}
apply_preset(model, ESTILO)
st = model.get_styles().get_active_style()
st.set_name('Tanque Decantador - Estudio Tecnico')
st.set_description('Cotas conforme PDF escaneado (anotacoes manuscritas). Unidades: metro.')

model.set_camera(cam(e0, t0, FOV))

# -----------------------------------------------------------------------------
# 16. UNIDADES DO MODELO: METRO
# -----------------------------------------------------------------------------
# O sandbox nao expoe o enum LengthUnitType; usa-se qualquer membro de enum
# pre-carregado com o .value desejado (0 = DECIMAL / 4 = METER).
lf = model.get_length_formatter()
lf.set_format(RenderMode.WIREFRAME)         # value 0  -> DECIMAL   (aplicar 1o)
lf.set_units(RenderMode.TEXTURE_OBSOLETE)   # value 4  -> METER
lf.set_area_units(RenderMode.TEXTURE_OBSOLETE)      # SQUARE_METER
lf.set_volume_units(RenderMode.TEXTURE_OBSOLETE)    # CUBIC_METER
lf.set_precision(3)
lf.set_suppress_units(False)

result = {
    'modelo': 'TANQUE_DECANTADOR_COMPLETO',
    'unidade_exibicao': lf.get_units().name,
    'corpo_mm': [PARAM['diam_tanque'], PARAM['altura_costado']],
    'cone_mm': [PARAM['altura_cone'], PARAM['diam_dreno']],
    'altura_total_mm': PARAM['z_tampa_topo'],
    'pes': cd_pe.get_num_instances(),
    'comprimento_pe_mm': round(math.sqrt(DR*DR + DZ*DZ), 1),
    'cenas': [s.get_name() for s in scenes],
    'massas_pdf_kg': MASSAS_PDF_KG,
}
