# =============================================================================
# TANQUE DECANTADOR / SEPARADOR CONICO VERTICAL  -  MODELO 3D PARAMETRICO
# =============================================================================
# Executar via conector MCP do SketchUp (build_model).
# O namespace ja expoe: model, SUPoint3D, SUVector3D, SUTransformation, SUColor,
# GeometryInput, LoopInput, Group, ComponentDefinition, Material, Layer, Scene,
# Camera, TypedValue, RenderingOptionKey, ShadowInfoKey, apply_preset, math.
# NAO usar 'import'.
#
# UNIDADES: todos os parametros deste arquivo estao em MILIMETROS.
#           O SketchUp trabalha em polegadas -> conversao unica em P() via S.
#
# SISTEMA DE COORDENADAS:
#   X = largura, Y = profundidade, Z = vertical
#   eixo do tanque em X=0 / Y=0
#   Z=0    -> boca de saida inferior do cone (D50)
#   Z=600  -> transicao cone/cilindro
#   Z=1500 -> topo do cilindro / base da tampa
#   Z=-600 -> piso (base das sapatas dos pes)
# =============================================================================

S = 1.0 / 25.4

def P(x, y, z):
    return SUPoint3D(x * S, y * S, z * S)

# -----------------------------------------------------------------------------
# 1. PARAMETROS  (unico bloco - nao espalhar numeros pelo codigo)
# -----------------------------------------------------------------------------
PARAM = {
    # --- CONFIRMADOS PELO USUARIO ---
    'diam_tanque':        1100.0,
    'raio_tanque':         550.0,
    'altura_cilindro':     900.0,
    'altura_cone':         600.0,
    'z_cone_bot':            0.0,
    'z_cone_top':          600.0,
    'z_cyl_top':          1500.0,
    'diam_dreno':           50.0,
    'diam_entrada':         40.0,
    'diam_saida':           40.0,
    'diam_respiro':         40.0,
    'diam_defletor_700':   700.0,
    'diam_defletor_400':   400.0,
    'espessura_chapa':       5.0,
    'altura_tampa':         30.0,
    'comprimento_pe':     1500.0,

    # --- AJUSTAVEIS (cotas manuscritas pouco legiveis no desenho) ---
    'z_piso':             -600.0,   # AJUSTAVEL - decorrente do pe de 1500 mm
    'perfil_pe_x':          80.0,   # AJUSTAVEL - anotacao "80x20"
    'perfil_pe_y':          20.0,   # AJUSTAVEL
    'espessura_perfil':      2.0,   # AJUSTAVEL - desenho sugere #3/16" (4,76)
    'espessura_flange':     15.0,   # AJUSTAVEL
    'raio_flange':          90.0,   # AJUSTAVEL
    'sapata_x':            120.0,   # AJUSTAVEL
    'sapata_y':            100.0,   # AJUSTAVEL
    'sapata_t':             10.0,   # AJUSTAVEL
    'calha_z_fundo':      1300.0,   # AJUSTAVEL
    'calha_t_fundo':        10.0,   # AJUSTAVEL
    'calha_z_topo':       1430.0,   # AJUSTAVEL
    'calha_z_vertedouro': 1400.0,   # AJUSTAVEL
    'calha_r_int':         455.0,   # AJUSTAVEL
    'z_feedwell_bot':      950.0,   # AJUSTAVEL
    'z_feedwell_top':     1440.0,   # AJUSTAVEL
    'z_anel700_bot':       800.0,   # AJUSTAVEL
    'z_anel700_top':      1150.0,   # AJUSTAVEL
    'z_entrada':          1470.0,   # AJUSTAVEL
    'z_saida':            1345.0,   # AJUSTAVEL
    'theta_entrada':       180.0,   # AJUSTAVEL - posicao angular do bocal
    'theta_saida':           0.0,   # AJUSTAVEL - posicao angular do bocal

    # resolucao
    'seg': 64, 'seg_med': 48, 'seg_peq': 24, 'seg_min': 12,
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

R  = PARAM['raio_tanque']
CH = PARAM['espessura_chapa']
NS = PARAM['seg']; NM = PARAM['seg_med']; NP = PARAM['seg_peq']

# -----------------------------------------------------------------------------
# 5. CORPO CILINDRICO  D1100 x H900   (z 600 -> 1500)
# -----------------------------------------------------------------------------
g_cil = mk(RE, 'CORPO_CILINDRICO_D1100_H900', TAGS['01_TANQUE'])
g_cil.get_entities().fill(
    shell2_geom([(R, 600.0), (R, 1500.0)], [(R-CH, 600.0), (R-CH, 1500.0)], NS),
    weld_vertices=True)
soften_group(g_cil); apply_mat(g_cil, MAT['inox'])

# -----------------------------------------------------------------------------
# 6. FUNDO CONICO  H600, tronco de cone terminando em D50   (z 0 -> 600)
# -----------------------------------------------------------------------------
g_cone = mk(RE, 'FUNDO_CONICO_H600_SAIDA_D50', TAGS['03_CONE_INFERIOR'])
g_cone.get_entities().fill(
    shell2_geom([(30.0, 0.0), (R, 600.0)], [(25.0, 0.0), (R-CH, 600.0)], NS),
    weld_vertices=True)
soften_group(g_cone); apply_mat(g_cone, MAT['inox'])

# -----------------------------------------------------------------------------
# 7. TAMPA SUPERIOR abaulada (flecha 30 mm) + respiro central D40
# -----------------------------------------------------------------------------
prof_o = []; prof_i = []
for r in [550.0, 470.0, 380.0, 280.0, 170.0, 80.0, 25.0]:
    z = 1500.0 + PARAM['altura_tampa'] * (1.0 - (r/550.0)**2)
    prof_o.append((r, z)); prof_i.append((r, z - CH))
g_tampa = mk(RE, 'TAMPA_SUPERIOR_ABAULADA', TAGS['02_TAMPA'])
g_tampa.get_entities().fill(shell2_geom(prof_o, prof_i, NM), weld_vertices=True)
soften_group(g_tampa); apply_mat(g_tampa, MAT['inox'])

z_apex = prof_o[-1][1]
g_resp = mk(RE, 'RESPIRO_CENTRAL_D40', TAGS['02_TAMPA'])
g_resp.get_entities().fill(
    prism_geom((0.0, 0.0, z_apex - 12.0), (0.0, 0.0, z_apex + 120.0),
               circ(20.0, NP), circ(15.0, NP)), weld_vertices=True)
soften_group(g_resp); apply_mat(g_resp, MAT['tubo'])
make_flange(RE, 'FLANGE_RESPIRO_D40',
            (0.0, 0.0, z_apex + 105.0), (0.0, 0.0, z_apex + 120.0), 62.0, 20.0, MAT['flange'])
make_bolts(RE, 'PARAFUSOS_RESPIRO_D40',
           (0.0, 0.0, z_apex + 103.0), (0.0, 0.0, z_apex + 122.0), 46.0, 4, 12.0, MAT['parafuso'])

# -----------------------------------------------------------------------------
# 8. SISTEMA INTERNO DE DECANTACAO / SEPARACAO
# -----------------------------------------------------------------------------
g_int = mk(RE, 'SISTEMA_INTERNO', TAGS['04_INTERNOS'])
IE = g_int.get_entities()

# 8.1 poco de alimentacao / defletor D400  (raio 200)
g_d400 = mk(IE, 'DEFLETOR_D400_POCO_ALIMENTACAO', TAGS['04_INTERNOS'])
g_d400.get_entities().fill(
    shell2_geom([(200.0, PARAM['z_feedwell_bot']), (200.0, PARAM['z_feedwell_top'])],
                [(200.0-CH, PARAM['z_feedwell_bot']), (200.0-CH, PARAM['z_feedwell_top'])], NM),
    weld_vertices=True)
soften_group(g_d400); apply_mat(g_d400, MAT['inox_esc'])

# 8.2 anel concentrico / defletor D700  (raio 350)
g_d700 = mk(IE, 'DEFLETOR_D700_ANEL_CONCENTRICO', TAGS['04_INTERNOS'])
g_d700.get_entities().fill(
    shell2_geom([(350.0, PARAM['z_anel700_bot']), (350.0, PARAM['z_anel700_top'])],
                [(350.0-CH, PARAM['z_anel700_bot']), (350.0-CH, PARAM['z_anel700_top'])], NM),
    weld_vertices=True)
soften_group(g_d700); apply_mat(g_d700, MAT['inox_esc'])

# 8.3 saia conica do defletor D700
g_saia = mk(IE, 'SAIA_CONICA_D700', TAGS['04_INTERNOS'])
g_saia.get_entities().fill(
    shell2_geom([(350.0, 800.0), (430.0, 700.0)], [(345.0, 800.0), (425.0, 700.0)], NM),
    weld_vertices=True)
soften_group(g_saia); apply_mat(g_saia, MAT['inox_esc'])

# 8.4 cone defletor central (chapeu, apice para cima)
g_cdef = mk(IE, 'DEFLETOR_CENTRAL_CONICO', TAGS['04_INTERNOS'])
g_cdef.get_entities().fill(
    shell2_geom([(300.0, 810.0), (40.0, 935.0)], [(295.0, 810.0), (35.0, 935.0)], NM),
    weld_vertices=True)
soften_group(g_cdef); apply_mat(g_cdef, MAT['inox_esc'])

g_tir = mk(IE, 'TIRANTES_CONE_CENTRAL', TAGS['04_INTERNOS'])
for i in range(4):
    a = math.radians(45.0 + 90.0*i)
    g_tir.get_entities().fill(
        prism_geom((150.0*math.cos(a), 150.0*math.sin(a), 930.0),
                   (195.0*math.cos(a), 195.0*math.sin(a), PARAM['z_feedwell_bot'] + 30.0),
                   circ(8.0, 8)), weld_vertices=True)
soften_group(g_tir); apply_mat(g_tir, MAT['estrut'])

# 8.5 calha / vertedouro anular perimetral
g_calha = mk(IE, 'CALHA_VERTEDOURO', TAGS['04_INTERNOS'])
CE = g_calha.get_entities()
zf = PARAM['calha_z_fundo']; tf = PARAM['calha_t_fundo']
g_cf = mk(CE, 'FUNDO_CALHA', TAGS['04_INTERNOS'])
g_cf.get_entities().fill(
    shell2_geom([(545.0, zf), (545.0, zf+tf)],
                [(PARAM['calha_r_int'], zf), (PARAM['calha_r_int'], zf+tf)], NM),
    weld_vertices=True)
soften_group(g_cf); apply_mat(g_cf, MAT['inox_esc'])

g_cpe = mk(CE, 'PAREDE_EXTERNA_CALHA', TAGS['04_INTERNOS'])
g_cpe.get_entities().fill(
    shell2_geom([(545.0, zf+tf), (545.0, PARAM['calha_z_topo'])],
                [(540.0, zf+tf), (540.0, PARAM['calha_z_topo'])], NM), weld_vertices=True)
soften_group(g_cpe); apply_mat(g_cpe, MAT['inox_esc'])

g_cvt = mk(CE, 'VERTEDOURO_INTERNO', TAGS['04_INTERNOS'])
g_cvt.get_entities().fill(
    shell2_geom([(460.0, zf+tf), (460.0, PARAM['calha_z_vertedouro'])],
                [(455.0, zf+tf), (455.0, PARAM['calha_z_vertedouro'])], NM), weld_vertices=True)
soften_group(g_cvt); apply_mat(g_cvt, MAT['inox_esc'])

g_csup = mk(CE, 'CONSOLOS_CALHA', TAGS['04_INTERNOS'])
for i in range(6):
    a = math.radians(60.0*i + 30.0)
    g_csup.get_entities().fill(
        prism_geom((455.0*math.cos(a), 455.0*math.sin(a), zf - 90.0),
                   (543.0*math.cos(a), 543.0*math.sin(a), zf + 3.0),
                   rect(60.0, 6.0)), weld_vertices=True)
soften_group(g_csup); apply_mat(g_csup, MAT['estrut'])

# 8.6 defletores angulares (6 chapas inclinadas) - componente + array radial
cd_chapa, is_new = get_or_create_definition('CHAPA_DEFLETORA_ANGULAR')
if is_new:
    cd_chapa.get_entities().fill(
        prism_geom((380.0, 0.0, 690.0), (520.0, 0.0, 830.0), rect(210.0, CH)), weld_vertices=True)
    soften_ents(cd_chapa.get_entities()); apply_mat_def(cd_chapa, MAT['inox_esc'])
g_ang = mk(IE, 'DEFLETORES_ANGULARES', TAGS['04_INTERNOS'])
for i in range(6):
    ang = math.radians(60.0 * i); ca = math.cos(ang); sa = math.sin(ang)
    inst = cd_chapa.create_instance()
    inst.set_name('DEFLETOR_ANGULAR_%02d' % (i+1))
    inst.set_transform(SUTransformation([ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
    inst.set_layer(TAGS['04_INTERNOS'])
    g_ang.get_entities().add_instance(inst)

# -----------------------------------------------------------------------------
# 9. ENTRADA DE ALIMENTACAO D40  (lateral superior -> desce no poco D400)
# -----------------------------------------------------------------------------
Z_ENT = PARAM['z_entrada']; X_DESC = -160.0
g_ent = mk(RE, 'ENTRADA_ALIMENTACAO', TAGS['05_ENTRADA'])
EE = g_ent.get_entities()
g_te = mk(EE, 'TUBO_ENTRADA_D40', TAGS['05_ENTRADA'])
g_te.get_entities().fill(
    prism_geom((-1150.0, 0.0, Z_ENT), (X_DESC, 0.0, Z_ENT), circ(20.0, NP), circ(15.0, NP)),
    weld_vertices=True)
g_te.get_entities().fill(
    prism_geom((X_DESC, 0.0, Z_ENT + 20.0), (X_DESC, 0.0, 1200.0), circ(20.0, NP), circ(15.0, NP)),
    weld_vertices=True)
soften_group(g_te); apply_mat(g_te, MAT['tubo'])

g_luvae = mk(EE, 'LUVA_PASSAGEM_ENTRADA', TAGS['05_ENTRADA'])
g_luvae.get_entities().fill(
    prism_geom((-585.0, 0.0, Z_ENT), (-515.0, 0.0, Z_ENT), circ(34.0, NP), circ(20.0, NP)),
    weld_vertices=True)
soften_group(g_luvae); apply_mat(g_luvae, MAT['flange'])
make_flange(EE, 'FLANGE_ENTRADA_D40',
            (-1150.0, 0.0, Z_ENT), (-1135.0, 0.0, Z_ENT), 62.0, 20.0, MAT['flange'])
make_bolts(EE, 'PARAFUSOS_ENTRADA_D40',
           (-1152.0, 0.0, Z_ENT), (-1133.0, 0.0, Z_ENT), 46.0, 4, 12.0, MAT['parafuso'])

# -----------------------------------------------------------------------------
# 10. SAIDA DE EFLUENTE CLARIFICADO D40  (ligada a calha/vertedouro)
# -----------------------------------------------------------------------------
Z_SAI = PARAM['z_saida']
g_sai = mk(RE, 'SAIDA_EFLUENTE_CLARIFICADO', TAGS['06_SAIDA'])
SE = g_sai.get_entities()
g_ts = mk(SE, 'TUBO_SAIDA_D40', TAGS['06_SAIDA'])
g_ts.get_entities().fill(
    prism_geom((480.0, 0.0, Z_SAI), (900.0, 0.0, Z_SAI), circ(20.0, NP), circ(15.0, NP)),
    weld_vertices=True)
soften_group(g_ts); apply_mat(g_ts, MAT['tubo'])
g_luvas = mk(SE, 'LUVA_PASSAGEM_SAIDA', TAGS['06_SAIDA'])
g_luvas.get_entities().fill(
    prism_geom((520.0, 0.0, Z_SAI), (590.0, 0.0, Z_SAI), circ(34.0, NP), circ(20.0, NP)),
    weld_vertices=True)
soften_group(g_luvas); apply_mat(g_luvas, MAT['flange'])
make_flange(SE, 'FLANGE_SAIDA_D40', (885.0, 0.0, Z_SAI), (900.0, 0.0, Z_SAI),
            62.0, 20.0, MAT['flange'])
make_bolts(SE, 'PARAFUSOS_SAIDA_D40', (883.0, 0.0, Z_SAI), (902.0, 0.0, Z_SAI),
           46.0, 4, 12.0, MAT['parafuso'])

# -----------------------------------------------------------------------------
# 11. DRENO INFERIOR D50 + VALVULA / REGISTRO
# -----------------------------------------------------------------------------
g_dre = mk(RE, 'DRENO_INFERIOR', TAGS['07_DRENO_VALVULA'])
DE = g_dre.get_entities()
g_pes = mk(DE, 'PESCOCO_DRENO_D50', TAGS['07_DRENO_VALVULA'])
g_pes.get_entities().fill(
    prism_geom((0.0, 0.0, -60.0), (0.0, 0.0, 2.0), circ(30.0, NP), circ(25.0, NP)),
    weld_vertices=True)
soften_group(g_pes); apply_mat(g_pes, MAT['tubo'])

make_flange(DE, 'FLANGE_D50_TANQUE',   (0.0,0.0,-75.0), (0.0,0.0,-60.0), 90.0, 25.0, MAT['flange'])
make_flange(DE, 'FLANGE_D50_VALV_SUP', (0.0,0.0,-90.0), (0.0,0.0,-75.0), 90.0, 25.0, MAT['flange'])
make_bolts (DE, 'PARAFUSOS_FLANGE_SUP',(0.0,0.0,-93.0), (0.0,0.0,-57.0), 70.0, 4, 16.0, MAT['parafuso'])

g_val = mk(DE, 'VALVULA_D50', TAGS['07_DRENO_VALVULA'])
VE = g_val.get_entities()
g_vc = mk(VE, 'CORPO_VALVULA', TAGS['07_DRENO_VALVULA'])
g_vc.get_entities().fill(
    shell2_geom([(70.0,-215.0),(78.0,-175.0),(78.0,-130.0),(70.0,-90.0)],
                [(25.0,-215.0),(25.0,-175.0),(25.0,-130.0),(25.0,-90.0)], 32), weld_vertices=True)
soften_group(g_vc); apply_mat(g_vc, MAT['valvula'])

g_vh = mk(VE, 'HASTE_VALVULA', TAGS['07_DRENO_VALVULA'])
g_vh.get_entities().fill(prism_geom((70.0,0.0,-152.0), (222.0,0.0,-152.0), circ(10.0, NP)),
                         weld_vertices=True)
g_vh.get_entities().fill(prism_geom((78.0,0.0,-152.0), (105.0,0.0,-152.0),
                                    circ(30.0, NP), circ(11.0, NP)), weld_vertices=True)
soften_group(g_vh, 0.6); apply_mat(g_vh, MAT['valvula'])

g_vv = mk(VE, 'VOLANTE_VALVULA', TAGS['07_DRENO_VALVULA'])
g_vv.get_entities().fill(prism_geom((215.0,0.0,-152.0), (229.0,0.0,-152.0),
                                    circ(95.0, 32), circ(80.0, 32)), weld_vertices=True)
for i in range(4):
    a = math.radians(45.0 + 90.0*i)
    g_vv.get_entities().fill(
        prism_geom((222.0, 0.0, -152.0),
                   (222.0, 88.0*math.cos(a), -152.0 + 88.0*math.sin(a)),
                   rect(18.0, 9.0)), weld_vertices=True)
g_vv.get_entities().fill(prism_geom((214.0,0.0,-152.0), (232.0,0.0,-152.0),
                                    circ(24.0, NP), circ(11.0, NP)), weld_vertices=True)
soften_group(g_vv, 0.6); apply_mat(g_vv, MAT['volante'])

make_flange(DE, 'FLANGE_D50_VALV_INF', (0.0,0.0,-230.0), (0.0,0.0,-215.0), 90.0, 25.0, MAT['flange'])
make_flange(DE, 'FLANGE_D50_SAIDA',    (0.0,0.0,-245.0), (0.0,0.0,-230.0), 90.0, 25.0, MAT['flange'])
make_bolts (DE, 'PARAFUSOS_FLANGE_INF',(0.0,0.0,-248.0), (0.0,0.0,-212.0), 70.0, 4, 16.0, MAT['parafuso'])

g_tsd = mk(DE, 'TUBO_SAIDA_DRENO_D50', TAGS['07_DRENO_VALVULA'])
g_tsd.get_entities().fill(prism_geom((0.0,0.0,-330.0), (0.0,0.0,-245.0),
                                     circ(30.0, NP), circ(25.0, NP)), weld_vertices=True)
soften_group(g_tsd); apply_mat(g_tsd, MAT['tubo'])

# -----------------------------------------------------------------------------
# 12. TRES PES INCLINADOS (0 / 120 / 240 graus) - componente + array radial
# -----------------------------------------------------------------------------
R_TOP  = 560.0
Z_TOP  = 800.0
Z_PISO = PARAM['z_piso']
SAP_T  = PARAM['sapata_t']
Z_BOT  = Z_PISO + SAP_T
DZ     = Z_TOP - Z_BOT
DR     = math.sqrt(PARAM['comprimento_pe']**2 - DZ**2)   # garante L = 1500 mm exatos
R_BOT  = R_TOP + DR
PX = PARAM['perfil_pe_x']; PY = PARAM['perfil_pe_y']; PT = PARAM['espessura_perfil']

cd_pe, is_new = get_or_create_definition('PE_TANQUE')
if is_new:
    PEE = cd_pe.get_entities()
    g_perf = mk(PEE, 'PERFIL_PE_80x20', TAGS['08_PES'])
    g_perf.get_entities().fill(
        prism_geom((R_TOP, 0.0, Z_TOP), (R_BOT, 0.0, Z_BOT),
                   rect(PY, PX), rect(PY - 2*PT, PX - 2*PT)), weld_vertices=True)
    soften_ents(g_perf.get_entities(), 0.9); apply_mat(g_perf, MAT['estrut'])

    g_lig = mk(PEE, 'CHAPA_LIGACAO_COSTADO', TAGS['08_PES'])
    g_lig.get_entities().fill(
        prism_geom((549.0, 0.0, 745.0), (549.0, 0.0, 905.0), rect(150.0, 8.0)), weld_vertices=True)
    soften_ents(g_lig.get_entities(), 0.9); apply_mat(g_lig, MAT['estrut'])

    g_sap = mk(PEE, 'SAPATA_120x100x10', TAGS['08_PES'])
    g_sap.get_entities().fill(
        prism_geom((R_BOT, 0.0, Z_PISO), (R_BOT, 0.0, Z_PISO + SAP_T),
                   rect(PARAM['sapata_y'], PARAM['sapata_x'])), weld_vertices=True)
    soften_ents(g_sap.get_entities(), 0.9); apply_mat(g_sap, MAT['estrut'])

    g_enr = mk(PEE, 'ENRIJECEDORES_SAPATA', TAGS['08_PES'])
    for sgn in [-1.0, 1.0]:
        g_enr.get_entities().fill(
            prism_geom((R_BOT, sgn*16.0, Z_PISO + SAP_T),
                       (R_BOT, sgn*16.0, Z_PISO + SAP_T + 90.0),
                       rect(6.0, 90.0)), weld_vertices=True)
    soften_ents(g_enr.get_entities(), 0.9); apply_mat(g_enr, MAT['estrut'])

    make_bolts(PEE, 'PARAFUSOS_ANCORAGEM',
               (R_BOT, 0.0, Z_PISO - 70.0), (R_BOT, 0.0, Z_PISO + SAP_T),
               42.0, 4, 16.0, MAT['parafuso'])

g_pes3 = mk(RE, 'TRES_PES_INCLINADOS', TAGS['08_PES'])
for i in range(3):
    ang = math.radians(120.0 * i); ca = math.cos(ang); sa = math.sin(ang)
    inst = cd_pe.create_instance()
    inst.set_name('PE_%02d' % (i + 1))
    inst.set_transform(SUTransformation([ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
    inst.set_layer(TAGS['08_PES'])
    g_pes3.get_entities().add_instance(inst)

def pe_pt(theta_deg, z):
    """Ponto sobre o eixo de um pe, na cota z."""
    t = (Z_TOP - z) / DZ
    r = R_TOP + DR * t
    a = math.radians(theta_deg)
    return (r*math.cos(a), r*math.sin(a), z)

# -----------------------------------------------------------------------------
# 13. SUPORTE / TRAVAMENTO CENTRAL
# -----------------------------------------------------------------------------
g_sup = mk(RE, 'SUPORTE_CENTRAL', TAGS['09_SUPORTE_CENTRAL'])
SE2 = g_sup.get_entities()
g_anel = mk(SE2, 'ANEL_CENTRAL_APOIO_DRENO', TAGS['09_SUPORTE_CENTRAL'])
g_anel.get_entities().fill(
    shell2_geom([(185.0,-52.0),(185.0,-30.0)], [(140.0,-52.0),(140.0,-30.0)], 32),
    weld_vertices=True)
soften_group(g_anel); apply_mat(g_anel, MAT['estrut'])

g_brac = mk(SE2, 'BRACOS_RADIAIS_TRAVAMENTO', TAGS['09_SUPORTE_CENTRAL'])
for i in range(3):
    a = math.radians(120.0 * i)
    g_brac.get_entities().fill(
        prism_geom((150.0*math.cos(a), 150.0*math.sin(a), -41.0), pe_pt(120.0*i, 0.0),
                   rect(60.0, 40.0), rect(56.0, 36.0)), weld_vertices=True)
soften_group(g_brac, 0.9); apply_mat(g_brac, MAT['estrut'])

g_trv = mk(SE2, 'TRAVESSAS_PERIMETRAIS_INFERIORES', TAGS['09_SUPORTE_CENTRAL'])
for i in range(3):
    g_trv.get_entities().fill(
        prism_geom(pe_pt(120.0*i, 0.0), pe_pt(120.0*((i+1) % 3), 0.0),
                   rect(50.0, 50.0), rect(46.0, 46.0)), weld_vertices=True)
soften_group(g_trv, 0.9); apply_mat(g_trv, MAT['estrut'])

# -----------------------------------------------------------------------------
# 14. ESTRUTURA TUBULAR INTERMEDIARIA + ESCADA DE ACESSO
# -----------------------------------------------------------------------------
g_est = mk(RE, 'ESTRUTURA_TUBULAR', TAGS['12_ESTRUTURA'])
TE = g_est.get_entities()
g_anelsup = mk(TE, 'TRAVESSAS_PERIMETRAIS_SUPERIORES', TAGS['12_ESTRUTURA'])
for i in range(3):
    g_anelsup.get_entities().fill(
        prism_geom(pe_pt(120.0*i, 430.0), pe_pt(120.0*((i+1) % 3), 430.0),
                   circ(21.0, 16), circ(18.0, 16)), weld_vertices=True)
soften_group(g_anelsup, 0.6); apply_mat(g_anelsup, MAT['estrut'])

g_diag = mk(TE, 'DIAGONAIS_CONTRAVENTAMENTO', TAGS['12_ESTRUTURA'])
for i in range(3):
    g_diag.get_entities().fill(
        prism_geom(pe_pt(120.0*i, 430.0), pe_pt(120.0*((i+1) % 3), 0.0),
                   circ(17.0, 16), circ(14.0, 16)), weld_vertices=True)
soften_group(g_diag, 0.6); apply_mat(g_diag, MAT['estrut'])

g_esc = mk(TE, 'ESCADA_ACESSO', TAGS['12_ESTRUTURA'])
a60 = math.radians(60.0)
ux, uy = math.cos(a60), math.sin(a60)
tx, ty = -math.sin(a60), math.cos(a60)
for sgn in [-1.0, 1.0]:
    g_esc.get_entities().fill(
        prism_geom((1180.0*ux + sgn*190.0*tx, 1180.0*uy + sgn*190.0*ty, Z_PISO),
                   (700.0*ux + sgn*190.0*tx, 700.0*uy + sgn*190.0*ty, 900.0),
                   circ(21.0, 16), circ(18.0, 16)), weld_vertices=True)
for k in range(6):
    f = (k + 0.5) / 6.0
    rr = 1180.0 + (700.0 - 1180.0) * f
    zz = Z_PISO + (900.0 - Z_PISO) * f
    g_esc.get_entities().fill(
        prism_geom((rr*ux - 190.0*tx, rr*uy - 190.0*ty, zz),
                   (rr*ux + 190.0*tx, rr*uy + 190.0*ty, zz), circ(12.0, 12)), weld_vertices=True)
soften_group(g_esc, 0.6); apply_mat(g_esc, MAT['estrut'])

# -----------------------------------------------------------------------------
# 15. VALIDACAO DE SOLIDOS (arestas soltas, orientacao das faces)
# -----------------------------------------------------------------------------
def leaves(ents, acc):
    for g in ents.get_groups():
        e = g.get_entities()
        if e.get_groups() or e.get_instances():
            leaves(e, acc)
        else:
            acc.append(g)
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
        if not vs:
            continue
        cx = 0.0; cy = 0.0; cz = 0.0
        for v in vs:
            p = v.get_position(); cx += p.x; cy += p.y; cz += p.z
        k = len(vs)
        s += a * (n.x*cx/k + n.y*cy/k + n.z*cz/k)
    return s > 0

allg = leaves(root.get_entities(), [])
for d in model.get_component_definitions():
    allg = leaves(d.get_entities(), allg)
for g in allg:
    e = g.get_entities()
    st = [ed for ed in e.get_edges() if ed.get_num_faces() == 0]
    if st:
        e.erase_entities(st)
if [g for g in allg if not orient_ok(g)]:
    model.orient_faces_consistently(True)
for g in allg:
    if not outward(g):
        for f in g.get_entities().get_faces():
            f.reverse()

# -----------------------------------------------------------------------------
# 16. CENAS DE INSPECAO   (ATENCAO: scene.add_layer() OCULTA a tag)
# -----------------------------------------------------------------------------
scene_defs = [
    ('01_GERAL',             []),
    ('02_INTERNOS_VISIVEIS', ['01_TANQUE', '02_TAMPA', '03_CONE_INFERIOR']),
    ('03_ESTRUTURA_SUPORTE', ['04_INTERNOS', '05_ENTRADA', '06_SAIDA', '02_TAMPA']),
    ('04_VISTA_FRONTAL',     []),
    ('05_VISTA_SUPERIOR',    []),
]
scenes = []
for nm, _h in scene_defs:
    sc = Scene(); sc.set_name(nm); scenes.append(sc)
model.add_scenes(scenes)

bb = root.get_bounding_box()
xmin, ymin, zmin = bb.min_point[0], bb.min_point[1], bb.min_point[2]
xmax, ymax, zmax = bb.max_point[0], bb.max_point[1], bb.max_point[2]
cx = (xmin+xmax)/2.0; cy = (ymin+ymax)/2.0; cz = (zmin+zmax)/2.0
w = xmax-xmin; d = ymax-ymin; h = zmax-zmin

def hero_cam(fov, azim, elev, aspect=1.15, margin=1.25):
    ar = math.radians(azim); er = math.radians(elev)
    dx = math.cos(ar)*math.cos(er); dy = -math.sin(ar)*math.cos(er); dz = math.sin(er)
    rl = math.sqrt(dx*dx + dy*dy)
    rx = -dy/rl; ry = dx/rl; rz = 0.0
    ux2 = dy*rz - dz*ry; uy2 = dz*rx - dx*rz; uz2 = dx*ry - dy*rx
    he = abs(rx)*w + abs(ry)*d + abs(rz)*h
    ve = abs(ux2)*w + abs(uy2)*d + abs(uz2)*h
    hv = math.radians(fov/2.0); hh = math.atan(aspect*math.tan(hv))
    dist = max((ve/2.0)/math.tan(hv), (he/2.0)/math.tan(hh)) * margin
    return (SUPoint3D(cx + dist*dx, cy + dist*dy, cz + dist*dz),
            SUPoint3D(cx, cy, zmin + h*0.45))

def build_cam(eye, tgt, fov):
    c = Camera()
    c.set_orientation(eye, tgt, SUVector3D(0, 0, 1))
    c.enable_perspective()
    c.set_perspective_frustum_fov(fov)
    return c

FOV = 32.0
eye_h, tgt_h = hero_cam(FOV, 45.0, 22.0)
eye_i, tgt_i = hero_cam(FOV, 35.0, 12.0, margin=1.05)
eye_e, tgt_e = hero_cam(FOV, 55.0,  8.0, margin=1.18)
cam_specs = [
    (eye_h, tgt_h, FOV),
    (eye_i, tgt_i, FOV),
    (eye_e, tgt_e, FOV),
    (SUPoint3D(cx, cy - 460.0, cz), SUPoint3D(cx, cy, cz), 13.0),
    (SUPoint3D(cx + 0.01, cy, zmax + 470.0), SUPoint3D(cx, cy, zmin), 13.0),
]
for i, (nm, hide) in enumerate(scene_defs):
    eye, tgt, fv = cam_specs[i]
    scenes[i].set_use_camera(True)
    scenes[i].set_camera(build_cam(eye, tgt, fv))
    scenes[i].set_use_hidden_layers(True)
    for hl in hide:
        scenes[i].add_layer(TAGS[hl])
model.set_active_scene(scenes[0])

# -----------------------------------------------------------------------------
# 17. ESTILO (Furniture/Product Studio, AO off pelo volume de faces) + CAMERA
# -----------------------------------------------------------------------------
DEFAULTS = {
    'rendering_options': {
        'EDGE_DISPLAY_MODE':     TypedValue(int_value=1),
        'EDGE_COLOR_MODE':       TypedValue(int_value=0),
        'RENDER_MODE':           TypedValue(int_value=2),
        'MODEL_TRANSPARENCY':    TypedValue(bool_value=False),
        'MATERIAL_TRANSPARENCY': TypedValue(bool_value=True),
        'DRAW_DEPTH_QUE':        TypedValue(bool_value=False),
        'DEPTH_QUE_WIDTH':       TypedValue(int_value=2),
        'DRAW_SILHOUETTES':      TypedValue(bool_value=True),
        'SILHOUETTE_WIDTH':      TypedValue(int_value=2),
        'DRAW_HORIZON':          TypedValue(bool_value=False),
        'DRAW_GROUND':           TypedValue(bool_value=False),
        'DISPLAY_SKETCH_AXES':   TypedValue(bool_value=False),
        'HIGHLIGHT_COLOR':       TypedValue(color_value=SUColor(0, 1, 255, 255)),
        'LOCKED_COLOR':          TypedValue(color_value=SUColor(255, 0, 0, 255)),
    },
    'shadow_info': {},
}
STUDIO = {
    'rendering_options': {
        'BACKGROUND_COLOR':  TypedValue(color_value=SUColor(214, 216, 218, 255)),
        'FACE_FRONT_COLOR':  TypedValue(color_value=SUColor(245, 240, 230, 255)),
        'FACE_BACK_COLOR':   TypedValue(color_value=SUColor(180, 178, 170, 255)),
        'FOREGROUND_COLOR':  TypedValue(color_value=SUColor(50, 48, 45, 255)),
        'DEPTH_QUE_WIDTH':   TypedValue(int_value=1),
        'AMBIENT_OCCLUSION': TypedValue(bool_value=False),
    },
    'shadow_info': {
        'DISPLAY_SHADOWS': TypedValue(bool_value=True),
        'LIGHT':           TypedValue(int_value=80),
        'DARK':            TypedValue(int_value=62),
    },
}
apply_preset(model, {
    'rendering_options': {**DEFAULTS['rendering_options'], **STUDIO['rendering_options']},
    'shadow_info':       {**DEFAULTS['shadow_info'],       **STUDIO['shadow_info']},
})
st = model.get_styles().get_active_style()
st.set_name('Tanque Decantador - Estudio Tecnico')
st.set_description('Fundo neutro, silhuetas, sombras. Modelo parametrico em mm.')

model.set_camera(build_cam(eye_h, tgt_h, FOV))

result = {
    'modelo': 'TANQUE_DECANTADOR_COMPLETO',
    'corpo_mm': [PARAM['diam_tanque'], PARAM['altura_cilindro']],
    'cone_mm': [PARAM['altura_cone'], PARAM['diam_dreno']],
    'pes': cd_pe.get_num_instances(),
    'comprimento_pe_mm': round(math.sqrt(DR*DR + DZ*DZ), 1),
    'tags': len(TAG_NAMES),
    'cenas': [s.get_name() for s in scenes],
}
