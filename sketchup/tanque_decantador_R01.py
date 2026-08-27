# =============================================================================
# TANQUE DECANTADOR / SEPARADOR CONICO VERTICAL
# MODELO 3D PARAMETRICO 1:1  +  PRANCHA TECNICA A0 (1189 x 841)  -  REV. R01
# =============================================================================
# Cotas conforme a AUDITORIA DIMENSIONAL do PDF escaneado do projeto.
# Regra aplicada: ANOTACOES MANUSCRITAS PREVALECEM SOBRE COTAS IMPRESSAS.
#
# COMO EXECUTAR
# -------------
# O conector MCP do SketchUp executa PYTHON (nao Ruby) e NAO preserva o
# namespace entre chamadas. A unica coisa que sobrevive e o dicionario
# `session_state`. Por isso a biblioteca de helpers e guardada la
# (session_state['H'] e session_state['D']) e cada bloco a recupera no inicio.
#
# Execute os blocos ABAIXO NA ORDEM, um por chamada de build_model.
# Blocos posteriores apagam e refazem grupos de blocos anteriores quando
# houve correcao de enquadramento - o resultado final e o estado entregue.
#
# O namespace ja expoe: model, SUPoint3D, SUVector3D, SUTransformation,
# SUColor, GeometryInput, LoopInput, Group, ComponentDefinition,
# ComponentInstance, Material, Layer, Scene, Camera, RenderMode, math.
# NAO usar `import`, `eval`, `type`, `globals` nem `class`.
#
# UNIDADES DOS PARAMETROS: MILIMETROS (conversao unica em P() via S = 1/25.4).
# UNIDADE DE EXIBICAO DO MODELO: METRO.
#
# SISTEMA DE COORDENADAS
#   Z =    0  -> PISO (base das sapatas)
#   Z =  600  -> eixo do dreno horizontal O50        (PDF manuscrito: 60 cm)
#   Z =  650  -> boca inferior do cone O50           (600 + raio da curva R50)
#   Z = 1250  -> juncao cone / costado               (PDF manuscrito: 65 cm)
#   Z = 2550  -> topo do costado cilindrico          (PDF manuscrito: 130 cm)
#   Z = 2700  -> topo da tampa abaulada              (PDF manuscrito: 15 cm)
#   TOTAL 2700 mm = 270 cm (corrige os 250 cm impressos)
#
# VOLUMES (dimensoes INTERNAS, O int = O ext - 2 x 5 = 1090)
#   corpo cilindrico   1.210,00 L
#   fundo conico         195,05 L
#   VOLUME BRUTO       1.405,05 L  =  1,4050 m3
#   validacao pela geometria 3D (compute_volume): 1.404,04 L -> 0,071 %
#   (divergencia coerente: poligono de 96 lados aproxima o circulo por falta)
# =============================================================================



# ===========================================================================
# BLOCO 00  - BIBLIOTECA PERSISTENTE DE GEOMETRIA 3D
# ===========================================================================
# =========================================================================
# BLOCO 0 - BIBLIOTECA PERSISTENTE (fica em session_state e sobrevive a
#           qualquer reset do namespace entre chamadas)
# =========================================================================
S = 1.0/25.4
YSH = -5000.0

def P(x, y, z):
    return SUPoint3D(x*S, y*S, z*S)

# ---------- geometria 3D -------------------------------------------------
def tri(geom, i0, i1, i2):
    lp = LoopInput()
    lp.add_vertex_index(i0); lp.add_vertex_index(i1); lp.add_vertex_index(i2)
    _, geom = geom.add_face(lp)
    return geom

def quad(geom, i0, i1, i2, i3):
    return tri(tri(geom, i0, i1, i2), i0, i2, i3)

def circ(r, n):
    return [(r*math.cos(2.0*math.pi*i/n), r*math.sin(2.0*math.pi*i/n)) for i in range(n)]

def rectp(w, h):
    return [(-w/2.0,-h/2.0),(w/2.0,-h/2.0),(w/2.0,h/2.0),(-w/2.0,h/2.0)]

def vsub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vadd(a,b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def vscl(a,s): return (a[0]*s, a[1]*s, a[2]*s)
def vcross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def vlen(a): return math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])
def vnorm(a):
    L = vlen(a); return (a[0]/L, a[1]/L, a[2]/L)

def frame_of(p1, p2):
    ax = vsub(p2,p1); L = vlen(ax); d = vscl(ax, 1.0/L)
    ref = (0.0,0.0,1.0) if abs(d[2]) < 0.9 else (1.0,0.0,0.0)
    u = vnorm(vcross(ref, d)); v = vcross(d, u)
    return d, u, v, L

def tube2(p1, p2, po1, pi1, po2, pi2):
    d, u, v, L = frame_of(p1, p2)
    n = len(po1)
    def emit(base, prof):
        return [P(base[0]+a*u[0]+b*v[0], base[1]+a*u[1]+b*v[1], base[2]+a*u[2]+b*v[2])
                for (a,b) in prof]
    geom = GeometryInput()
    verts = emit(p1, po1) + emit(p2, po2)
    solid = (pi1 is None)
    if not solid:
        verts = verts + emit(p1, pi1) + emit(p2, pi2)
    geom.set_vertices(verts)
    ob = list(range(0,n)); ot = list(range(n,2*n))
    for j in range(n):
        k = (j+1) % n
        geom = quad(geom, ob[j], ob[k], ot[k], ot[j])
    if solid:
        lp = LoopInput()
        for j in range(n-1,-1,-1): lp.add_vertex_index(ob[j])
        _, geom = geom.add_face(lp)
        lp = LoopInput()
        for j in range(n): lp.add_vertex_index(ot[j])
        _, geom = geom.add_face(lp)
    else:
        ib = list(range(2*n,3*n)); it = list(range(3*n,4*n))
        for j in range(n):
            k = (j+1) % n
            geom = quad(geom, ib[j], it[j], it[k], ib[k])
            geom = quad(geom, ob[j], ib[j], ib[k], ob[k])
            geom = quad(geom, ot[j], ot[k], it[k], it[j])
    return geom

def prism(p1, p2, po, pi=None):
    return tube2(p1, p2, po, pi, po, pi)

def cone_tube(p1, p2, ro1, ri1, ro2, ri2, n=32):
    return tube2(p1, p2, circ(ro1,n), None if ri1 is None else circ(ri1,n),
                         circ(ro2,n), None if ri2 is None else circ(ri2,n))

def shell_rev(prof_out, prof_in, n=64):
    geom = GeometryInput(); verts = []; ro = []; ri = []
    for (r,z) in prof_out:
        s = len(verts)
        for i in range(n):
            a = 2.0*math.pi*i/n
            verts.append(P(r*math.cos(a), r*math.sin(a), z))
        ro.append(list(range(s, s+n)))
    for (r,z) in prof_in:
        s = len(verts)
        for i in range(n):
            a = 2.0*math.pi*i/n
            verts.append(P(r*math.cos(a), r*math.sin(a), z))
        ri.append(list(range(s, s+n)))
    geom.set_vertices(verts)
    m = len(prof_out)
    for k in range(m-1):
        for j in range(n):
            j2 = (j+1) % n
            geom = quad(geom, ro[k][j], ro[k][j2], ro[k+1][j2], ro[k+1][j])
            geom = quad(geom, ri[k][j], ri[k+1][j], ri[k+1][j2], ri[k][j2])
    for j in range(n):
        j2 = (j+1) % n
        geom = quad(geom, ro[0][j], ri[0][j], ri[0][j2], ro[0][j2])
        geom = quad(geom, ro[m-1][j], ro[m-1][j2], ri[m-1][j2], ri[m-1][j])
    return geom

def elbow(Sp, d_in, d_out, Rb, r_out, r_in, n_arc=16, n_tube=24, sweep=90.0):
    d_in = vnorm(d_in); d_out = vnorm(d_out)
    a1 = vscl(d_out,-1.0); a2 = d_in
    C = vadd(Sp, vscl(d_out, Rb)); B = vnorm(vcross(a1,a2))
    geom = GeometryInput(); verts = []; RO = []; RI = []
    for r_use, store in ((r_out, RO), (r_in, RI)):
        for k in range(n_arc+1):
            t = math.radians(sweep)*k/float(n_arc)
            N = vadd(vscl(a1, math.cos(t)), vscl(a2, math.sin(t)))
            Cc = vadd(C, vscl(N, -Rb))
            s = len(verts)
            for j in range(n_tube):
                ph = 2.0*math.pi*j/n_tube
                dv = vadd(vscl(N, math.cos(ph)), vscl(B, math.sin(ph)))
                verts.append(P(*vadd(Cc, vscl(dv, r_use))))
            store.append(list(range(s, s+n_tube)))
    geom.set_vertices(verts)
    for k in range(n_arc):
        for j in range(n_tube):
            j2 = (j+1) % n_tube
            geom = quad(geom, RO[k][j], RO[k][j2], RO[k+1][j2], RO[k+1][j])
            geom = quad(geom, RI[k][j], RI[k+1][j], RI[k+1][j2], RI[k][j2])
    for j in range(n_tube):
        j2 = (j+1) % n_tube
        geom = quad(geom, RO[0][j], RI[0][j], RI[0][j2], RO[0][j2])
        geom = quad(geom, RO[n_arc][j], RO[n_arc][j2], RI[n_arc][j2], RI[n_arc][j])
    return geom

def elbow_end(Sp, d_in, d_out, Rb):
    return vadd(vadd(Sp, vscl(vnorm(d_out), Rb)), vscl(vnorm(d_in), Rb))

def mk(parent, name, layer=None):
    g = Group(); parent.add_group(g); g.set_name(name)
    if layer is not None: g.set_layer(layer)
    return g

def paint(g, mat):
    for f in g.get_entities().get_faces():
        f.set_front_material(mat); f.set_back_material(mat)

def soften(g):
    for e in g.get_entities().get_edges():
        if len(e.get_faces()) == 2:
            e.set_soft(True); e.set_smooth(True)

def getmat(mdl, name, r, gg, b):
    for m in mdl.get_materials():
        if m.get_name() == name:
            return m
    mt = Material(); mt.set_name(name); mt.set_color(SUColor(r, gg, b, 255))
    mdl.add_materials([mt]); return mt

def gettag(mdl, name):
    for L in mdl.get_layers():
        if L.get_name() == name:
            return L
    L = Layer(); L.set_name(name); mdl.add_layers([L]); return L

HELP = {'S':S,'YSH':YSH,'P':P,'tri':tri,'quad':quad,'circ':circ,'rectp':rectp,
        'vsub':vsub,'vadd':vadd,'vscl':vscl,'vcross':vcross,'vlen':vlen,'vnorm':vnorm,
        'frame_of':frame_of,'tube2':tube2,'prism':prism,'cone_tube':cone_tube,
        'shell_rev':shell_rev,'elbow':elbow,'elbow_end':elbow_end,'mk':mk,
        'paint':paint,'soften':soften,'getmat':getmat,'gettag':gettag}
session_state['H'] = HELP
result = {'bloco': 0, 'helpers': len(HELP)}


# ===========================================================================
# BLOCO 01  - BIBLIOTECA 2D DE DESENHO TECNICO (fonte vetorial + cotas)
# ===========================================================================
# =========================================================================
# BLOCO 0b - BIBLIOTECA 2D DE DESENHO TECNICO (fonte vetorial + cotas)
# =========================================================================
S = 1.0/25.4
YSH = -5000.0
BUF = []

def dfill(pts, dy=0.6):
    if len(pts) >= 3:
        BUF.append((list(pts), dy))

def flush(parent, name, mat, layer=None):
    if not BUF:
        return None
    g = Group(); parent.add_group(g); g.set_name(name)
    if layer is not None: g.set_layer(layer)
    geom = GeometryInput(); verts = []; loops = []
    for (pts, dy) in BUF:
        s = len(verts)
        for (x, z) in pts:
            verts.append(SUPoint3D(x*S, (YSH-dy)*S, z*S))
        loops.append(list(range(s, s+len(pts))))
    geom.set_vertices(verts)
    for idx in loops:
        lp = LoopInput()
        for i in idx: lp.add_vertex_index(i)
        _, geom = geom.add_face(lp)
    g.get_entities().fill(geom, False)
    for f in g.get_entities().get_faces():
        f.set_front_material(mat); f.set_back_material(mat)
    del BUF[:]
    return g

def dline(x1, z1, x2, z2, w=0.35, dy=0.6):
    dx = x2-x1; dz = z2-z1
    L = math.sqrt(dx*dx+dz*dz)
    if L < 1e-9: return
    ux = -dz/L*w/2.0; uz = dx/L*w/2.0
    dfill([(x1+ux,z1+uz),(x2+ux,z2+uz),(x2-ux,z2-uz),(x1-ux,z1-uz)], dy)

def dpl(pts, w=0.35, closed=False, dy=0.6):
    n = len(pts)
    rng = range(n) if closed else range(n-1)
    for i in rng:
        a = pts[i]; b = pts[(i+1) % n]
        dline(a[0], a[1], b[0], b[1], w, dy)

def darc(cx, cz, r, a0, a1, w=0.35, n=48, dy=0.6):
    pts = [(cx+r*math.cos(math.radians(a0+(a1-a0)*i/float(n))),
            cz+r*math.sin(math.radians(a0+(a1-a0)*i/float(n)))) for i in range(n+1)]
    dpl(pts, w, False, dy)

def dcirc(cx, cz, r, w=0.35, n=64, dy=0.6):
    darc(cx, cz, r, 0.0, 360.0, w, n, dy)

def ddisc(cx, cz, r, n=32, dy=0.6):
    dfill([(cx+r*math.cos(2.0*math.pi*i/n), cz+r*math.sin(2.0*math.pi*i/n)) for i in range(n)], dy)

def drect(x0, z0, x1, z1, w=0.35, dy=0.6):
    dpl([(x0,z0),(x1,z0),(x1,z1),(x0,z1)], w, True, dy)

def dbox(x0, z0, x1, z1, dy=0.4):
    dfill([(x0,z0),(x1,z0),(x1,z1),(x0,z1)], dy)

def ddash(x1, z1, x2, z2, w=0.3, seg=2.4, gap=1.5, dy=0.6):
    dx = x2-x1; dz = z2-z1; L = math.sqrt(dx*dx+dz*dz)
    if L < 1e-9: return
    ux = dx/L; uz = dz/L; t = 0.0
    while t < L:
        t2 = min(L, t+seg); dline(x1+ux*t, z1+uz*t, x1+ux*t2, z1+uz*t2, w, dy); t = t2+gap

def dcl(x1, z1, x2, z2, w=0.26, dy=0.6):
    dx = x2-x1; dz = z2-z1; L = math.sqrt(dx*dx+dz*dz)
    if L < 1e-9: return
    ux = dx/L; uz = dz/L; t = 0.0; k = 0
    while t < L:
        seg = 5.0 if k % 2 == 0 else 0.8
        t2 = min(L, t+seg); dline(x1+ux*t, z1+uz*t, x1+ux*t2, z1+uz*t2, w, dy)
        t = t2+1.5; k += 1

def dhatch(pts, step=2.0, w=0.2, dy=0.55):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    x0 = min(xs); x1 = max(xs); z0 = min(zs); z1 = max(zs)
    def inside(px, pz):
        c = False; n = len(pts); j = n-1
        for i in range(n):
            if ((pts[i][1] > pz) != (pts[j][1] > pz)):
                xx = (pts[j][0]-pts[i][0])*(pz-pts[i][1])/(pts[j][1]-pts[i][1]+1e-12)+pts[i][0]
                if px < xx: c = not c
            j = i
        return c
    d = z1-z0
    x = x0-d
    while x < x1+d:
        seg = None
        t = 0.0
        while t <= d:
            px = x+t; pz = z0+t
            ok = (x0 <= px <= x1) and inside(px, pz)
            if ok and seg is None: seg = (px, pz)
            elif (not ok) and seg is not None:
                dline(seg[0], seg[1], px, pz, w, dy); seg = None
            t += 0.6
        if seg is not None:
            dline(seg[0], seg[1], x+d, z1, w, dy)
        x += step

# ---------- FONTE VETORIAL (grade 6 x 10, avanco 8) ----------------------
GL = {
 'A':[[(0,0),(3,10),(6,0)],[(1.2,4),(4.8,4)]],
 'B':[[(0,0),(0,10),(4,10),(5.6,8.6),(4,5),(0,5)],[(4,5),(6,3.3),(4.4,0),(0,0)]],
 'C':[[(6,8),(4,10),(2,10),(0,8),(0,2),(2,0),(4,0),(6,2)]],
 'D':[[(0,0),(0,10),(3.4,10),(6,7.4),(6,2.6),(3.4,0),(0,0)]],
 'E':[[(6,10),(0,10),(0,0),(6,0)],[(0,5),(4.4,5)]],
 'F':[[(6,10),(0,10),(0,0)],[(0,5),(4.4,5)]],
 'G':[[(6,8),(4,10),(2,10),(0,8),(0,2),(2,0),(4,0),(6,2),(6,4.4),(3.2,4.4)]],
 'H':[[(0,10),(0,0)],[(6,10),(6,0)],[(0,5),(6,5)]],
 'I':[[(1,10),(5,10)],[(3,10),(3,0)],[(1,0),(5,0)]],
 'J':[[(6,10),(6,2.4),(4,0),(2,0),(0,2)]],
 'K':[[(0,10),(0,0)],[(6,10),(0.4,4.4)],[(2.2,6.2),(6,0)]],
 'L':[[(0,10),(0,0),(6,0)]],
 'M':[[(0,0),(0,10),(3,4.6),(6,10),(6,0)]],
 'N':[[(0,0),(0,10),(6,0),(6,10)]],
 'O':[[(2,10),(4,10),(6,8),(6,2),(4,0),(2,0),(0,2),(0,8),(2,10)]],
 'P':[[(0,0),(0,10),(4,10),(6,8.4),(6,6.6),(4,5),(0,5)]],
 'Q':[[(2,10),(4,10),(6,8),(6,2),(4,0),(2,0),(0,2),(0,8),(2,10)],[(3.6,2.6),(6.4,-0.4)]],
 'R':[[(0,0),(0,10),(4,10),(6,8.4),(6,6.6),(4,5),(0,5)],[(3.4,5),(6,0)]],
 'S':[[(6,8.6),(4,10),(2,10),(0,8.6),(0,6.6),(2,5),(4,5),(6,3.4),(6,1.4),(4,0),(2,0),(0,1.4)]],
 'T':[[(0,10),(6,10)],[(3,10),(3,0)]],
 'U':[[(0,10),(0,2),(2,0),(4,0),(6,2),(6,10)]],
 'V':[[(0,10),(3,0),(6,10)]],
 'W':[[(0,10),(1.4,0),(3,6),(4.6,0),(6,10)]],
 'X':[[(0,10),(6,0)],[(0,0),(6,10)]],
 'Y':[[(0,10),(3,5),(6,10)],[(3,5),(3,0)]],
 'Z':[[(0,10),(6,10),(0,0),(6,0)]],
 '0':[[(2,10),(4,10),(6,8),(6,2),(4,0),(2,0),(0,2),(0,8),(2,10)],[(1.2,2.2),(4.8,7.8)]],
 '1':[[(0.8,7.8),(3,10),(3,0)],[(1,0),(5,0)]],
 '2':[[(0,8.4),(2,10),(4,10),(6,8.4),(6,6.8),(0,0),(6,0)]],
 '3':[[(0,9),(2,10),(4,10),(6,8.6),(6,6.6),(4,5),(2.4,5)],[(4,5),(6,3.4),(6,1.4),(4,0),(2,0),(0,1)]],
 '4':[[(4.6,0),(4.6,10),(0,3),(6,3)]],
 '5':[[(6,10),(0,10),(0,5.4),(4,5.4),(6,3.8),(6,1.8),(4,0),(2,0),(0,1)]],
 '6':[[(5,10),(2,10),(0,8),(0,2),(2,0),(4,0),(6,2),(6,3.6),(4,5.4),(2,5.4),(0,4)]],
 '7':[[(0,10),(6,10),(2,0)]],
 '8':[[(2,10),(4,10),(5.6,8.6),(4,5),(2,5),(0.4,8.6),(2,10)],[(2,5),(0,3.2),(0,1.4),(2,0),(4,0),(6,1.4),(6,3.2),(4,5)]],
 '9':[[(1,0),(4,0),(6,2),(6,8),(4,10),(2,10),(0,8),(0,6.4),(2,4.6),(4,4.6),(6,6)]],
 'O/':[[(2,10),(4,10),(6,8),(6,2),(4,0),(2,0),(0,2),(0,8),(2,10)],[(-0.4,-0.8),(6.4,10.8)]],
 '.':[[(2.4,0),(3.6,0),(3.6,1.2),(2.4,1.2),(2.4,0)]],
 ',':[[(3.6,1.4),(3.6,0.2),(2.2,-1.6)]],
 ':':[[(2.4,6),(3.6,6),(3.6,7.2),(2.4,7.2),(2.4,6)],[(2.4,0),(3.6,0),(3.6,1.2),(2.4,1.2),(2.4,0)]],
 ';':[[(2.4,6),(3.6,6),(3.6,7.2),(2.4,7.2),(2.4,6)],[(3.6,1.4),(3.6,0.2),(2.2,-1.6)]],
 '-':[[(0.8,5),(5.2,5)]],
 '_':[[(0,-1),(6,-1)]],
 '+':[[(3,7.6),(3,2.4)],[(0.4,5),(5.6,5)]],
 '=':[[(0.5,6.4),(5.5,6.4)],[(0.5,3.6),(5.5,3.6)]],
 '/':[[(0.4,0),(5.6,10)]],
 '\\':[[(0.4,10),(5.6,0)]],
 '(':[[(4.4,10.6),(1.6,7.4),(1.6,2.6),(4.4,-0.6)]],
 ')':[[(1.6,10.6),(4.4,7.4),(4.4,2.6),(1.6,-0.6)]],
 '[':[[(4.6,10.6),(1.6,10.6),(1.6,-0.6),(4.6,-0.6)]],
 ']':[[(1.4,10.6),(4.4,10.6),(4.4,-0.6),(1.4,-0.6)]],
 '*':[[(3,9),(3,5)],[(1.3,8.5),(4.7,5.5)],[(4.7,8.5),(1.3,5.5)]],
 'X*':[[(1,7.6),(5,2.4)],[(1,2.4),(5,7.6)]],
 '%':[[(0.6,8.6),(1.8,8.6),(1.8,10),(0.6,10),(0.6,8.6)],[(4.2,0),(5.4,0),(5.4,1.4),(4.2,1.4),(4.2,0)],[(0.4,0),(5.6,10)]],
 '<':[[(5,9),(1,5),(5,1)]],
 '>':[[(1,9),(5,5),(1,1)]],
 '#':[[(1.4,10),(0.8,0)],[(4.6,10),(4,0)],[(0.4,7),(5.6,7)],[(0.4,3),(5.6,3)]],
 '^':[[(0.8,7),(3,10),(5.2,7)]],
 '~':[[(0.4,4.6),(1.8,5.8),(4.2,3.8),(5.6,5)]],
 "'":[[(3,10),(3,7.4)]],
 '"':[[(2,10),(2,7.4)],[(4,10),(4,7.4)]],
 '?':[[(0.4,8.6),(2,10),(4,10),(5.8,8.6),(5.8,7),(3,5),(3,3.4)],[(2.4,0),(3.6,0),(3.6,1.2),(2.4,1.2),(2.4,0)]],
 '!':[[(3,10),(3,3)],[(2.4,0),(3.6,0),(3.6,1.2),(2.4,1.2),(2.4,0)]],
 'o':[[(1.6,8.4),(2.6,9.4),(3.6,8.4),(2.6,7.4),(1.6,8.4)]],
 '2s':[[(1,9),(2,10),(3.4,10),(4.4,9),(4.4,8.2),(1,5.6),(4.4,5.6)]],
 '3s':[[(1,9.6),(2,10),(3.4,10),(4.4,9.2),(4.4,8.6),(3.4,8),(2.6,8)],[(3.4,8),(4.4,7.4),(4.4,6.4),(3.4,5.6),(2,5.6),(1,6)]],
 ' ':[],
}
ACC = {'A':'A','E':'E','I':'I','O':'O','U':'U','C':'C'}
MAPX = {'Á':('A','ac'),'À':('A','gr'),'Â':('A','ci'),'Ã':('A','ti'),
        'É':('E','ac'),'Ê':('E','ci'),'Í':('I','ac'),'Ó':('O','ac'),
        'Ô':('O','ci'),'Õ':('O','ti'),'Ú':('U','ac'),'Ç':('C','ce'),
        'Ø':('O/',None),'°':('o',None),'×':('X*',None),'²':('2s',None),'³':('3s',None)}
ACCST = {'ac':[[(2.4,11.4),(4.4,13.2)]],
         'gr':[[(3.6,11.4),(1.6,13.2)]],
         'ci':[[(1.4,11.6),(3,13.4),(4.6,11.6)]],
         'ti':[[(1.0,11.8),(2.2,13.0),(3.8,11.4),(5.0,12.6)]],
         'ce':[[(3,0),(3.2,-1.6),(2.0,-2.2)]]}

def tw(s, h):
    return (8.0*len(s)-2.0)*h/10.0 if s else 0.0

def txt(s, x, z, h=3.0, al='l', w=None, dy=0.9):
    s = s.upper()
    if w is None: w = max(0.22, h*0.115)
    width = tw(s, h)
    if al == 'c': x = x - width/2.0
    elif al == 'r': x = x - width
    sc = h/10.0
    cx = x
    for ch in s:
        base = ch; acc = None
        if ch in MAPX:
            base, acc = MAPX[ch]
        strokes = GL.get(base)
        if strokes is None:
            strokes = GL.get('?')
        for pl in strokes:
            dpl([(cx+px*sc, z+py*sc) for (px,py) in pl], w, False, dy)
        if acc:
            for pl in ACCST[acc]:
                dpl([(cx+px*sc, z+py*sc) for (px,py) in pl], w*0.9, False, dy)
        cx += 8.0*sc
    return width

def arrowhead(x, z, dx, dz, L=2.6, W=0.9):
    n = math.sqrt(dx*dx+dz*dz)
    if n < 1e-9: return
    ux = dx/n; uz = dz/n; px = -uz; pz = ux
    dfill([(x,z),(x+ux*L+px*W, z+uz*L+pz*W),(x+ux*L-px*W, z+uz*L-pz*W)], 0.9)

def dimh(x1, x2, z, s, h=2.4, ext=1.5, extlen=3.0, tick=True):
    dline(x1, z, x2, z, 0.22, 0.85)
    for xx in (x1, x2):
        dline(xx, z-extlen, xx, z+extlen*0.4, 0.18, 0.85)
    if abs(x2-x1) > tw(s, h)+7.0:
        arrowhead(x1, z, 1.0, 0.0); arrowhead(x2, z, -1.0, 0.0)
        txt(s, (x1+x2)/2.0, z+1.1, h, 'c')
    else:
        arrowhead(x1, z, -1.0, 0.0); arrowhead(x2, z, 1.0, 0.0)
        dline(x2, z, x2+5.0, z, 0.22, 0.85)
        txt(s, x2+6.0, z+1.1, h, 'l')

def dimv(z1, z2, x, s, h=2.4, extlen=3.0, side=1):
    dline(x, z1, x, z2, 0.22, 0.85)
    for zz in (z1, z2):
        dline(x-extlen*side, zz, x+extlen*0.4*side, zz, 0.18, 0.85)
    if abs(z2-z1) > tw(s, h)+7.0:
        arrowhead(x, z1, 0.0, 1.0); arrowhead(x, z2, 0.0, -1.0)
        txt(s, x-1.2*side, (z1+z2)/2.0-h/2.0, h, 'r' if side > 0 else 'l')
    else:
        arrowhead(x, z1, 0.0, -1.0); arrowhead(x, z2, 0.0, 1.0)
        dline(x, z2, x, z2+5.0, 0.22, 0.85)
        txt(s, x-1.2*side, z2+5.5, h, 'r' if side > 0 else 'l')

def leader(px, pz, pts, s, h=2.2, al='l'):
    allp = [(px,pz)] + list(pts)
    dpl(allp, 0.2, False, 0.85)
    arrowhead(px, pz, allp[1][0]-px, allp[1][1]-pz, 2.2, 0.75)
    ex, ez = allp[-1]
    if al == 'l':
        txt(s, ex+1.2, ez-h/2.0+0.3, h, 'l')
    else:
        txt(s, ex-1.2, ez-h/2.0+0.3, h, 'r')

def balloon(cx, cz, s, r=3.2, h=2.4):
    dcirc(cx, cz, r, 0.3, 32, 0.88)
    txt(s, cx, cz-h/2.0+0.2, h, 'c')

DRAW = {'BUF':BUF,'dfill':dfill,'flush':flush,'dline':dline,'dpl':dpl,'darc':darc,
        'dcirc':dcirc,'ddisc':ddisc,'drect':drect,'dbox':dbox,'ddash':ddash,'dcl':dcl,
        'dhatch':dhatch,'tw':tw,'txt':txt,'arrowhead':arrowhead,'dimh':dimh,
        'dimv':dimv,'leader':leader,'balloon':balloon,'GL':GL}
session_state['D'] = DRAW
result = {'bloco': '0b', 'glifos': len(GL), 'funcoes': len(DRAW)}


# ===========================================================================
# BLOCO 02  - MODELO: COSTADO, CONE, TAMPA + ABA "L", INTERNOS, RESPIRO
# ===========================================================================
H = session_state['H']
P=H['P']; circ=H['circ']; shell_rev=H['shell_rev']; cone_tube=H['cone_tube']
prism=H['prism']; mk=H['mk']; paint=H['paint']; soften=H['soften']
getmat=H['getmat']; gettag=H['gettag']; tube2=H['tube2']

PARAM = {
 'z_piso':0.0,'z_dreno_eixo':600.0,'z_cone_saida':650.0,'z_cone_topo':1250.0,
 'z_costado_topo':2550.0,'z_tampa_topo':2700.0,'diam_tanque':1100.0,
 'altura_costado':1300.0,'altura_cone':600.0,'diam_anel_ext':1100.0,
 'diam_anel_int':1000.0,'diam_tubo_int':700.0,'h_tubo_int':900.0,
 'diam_cone_int':400.0,'h_cone_int':400.0,'diam_entrada':40.0,'diam_saida':40.0,
 'diam_dreno':50.0,'espessura_chapa':5.0,'comprimento_pe':1500.0,
 'diam_tampa':1140.0,'aba_L':40.0,'pe_tubo_d':76.0,'pe_tubo_e':3.0,
 'z_aba_topo':2555.0,'z_calha_fundo':2350.0,'z_crista_calha':2500.0}
session_state['PARAM'] = PARAM

E = PARAM['espessura_chapa']
RO = PARAM['diam_tanque']/2.0          # 550 raio EXTERNO do costado
RI = RO - E                            # 545 raio INTERNO
RTP = PARAM['diam_tampa']/2.0          # 570
Z1 = PARAM['z_cone_saida']             # 650
Z2 = PARAM['z_cone_topo']              # 1250
Z3 = PARAM['z_costado_topo']           # 2550
Z4 = PARAM['z_aba_topo']               # 2555
ZTP = PARAM['z_tampa_topo']            # 2700
RSAI = PARAM['diam_dreno']/2.0         # 25 boca do cone

TG = {}
for nm in ['00_REFERENCIA','01_TANQUE','02_TAMPA','03_CONE_INFERIOR','04_INTERNOS',
           '05_ENTRADA','06_SAIDA','07_DRENO_VALVULA','08_PES','09_SUPORTE_INTERNO',
           '10_FLANGES','11_PARAFUSOS','12_ESTRUTURA','13_SOLDAS',
           '20_PRANCHA_MOLDURA','21_PRANCHA_VISTAS','22_PRANCHA_COTAS',
           '23_PRANCHA_DETALHES','24_PRANCHA_TABELAS','25_PRANCHA_CARIMBO']:
    TG[nm] = gettag(model, nm)
MT = {'casco':getmat(model,'Aco_Casco',178,182,186),
      'int':getmat(model,'Aco_Interno',142,149,156),
      'estrut':getmat(model,'Aco_Estrutural',92,99,108),
      'chapa':getmat(model,'Aco_Chapa',126,133,142),
      'tubo':getmat(model,'Aco_Tubo',158,164,170),
      'curva':getmat(model,'Aco_Curva90',150,157,164),
      'flange':getmat(model,'Aco_Flange_ANSI',120,126,133),
      'paraf':getmat(model,'Aco_Parafuso',70,74,80),
      'porca':getmat(model,'Aco_Porca',78,82,88),
      'arru':getmat(model,'Aco_Arruela',96,101,108),
      'valv':getmat(model,'Valvula_Gaveta',168,48,42),
      'volante':getmat(model,'Volante',48,50,54),
      'solda':getmat(model,'Cordao_Solda',196,164,96)}

ROOT = model.get_entities()
TQ = mk(ROOT, 'TANQUE_DECANTADOR_3D')
TE = TQ.get_entities()
NR = 48

# --- 01 costado cilindrico ----------------------------------------------
g = mk(TE, '01_CORPO_CILINDRICO_D1100_H1300', TG['01_TANQUE'])
g.get_entities().fill(shell_rev([(RO,Z2),(RO,Z3)], [(RI,Z2),(RI,Z3)], NR), True)
paint(g, MT['casco']); soften(g)

# --- 02 fundo conico -----------------------------------------------------
g = mk(TE, '02_CONE_H600_D1100_P_D50', TG['03_CONE_INFERIOR'])
kc = math.sqrt((RO-RSAI)**2 + (Z2-Z1)**2)
dr = E*(Z2-Z1)/kc; dz = E*(RO-RSAI)/kc
g.get_entities().fill(shell_rev([(RSAI,Z1),(RO,Z2)],
                                [(RSAI-dr,Z1+dz),(RO-dr,Z2+dz)], NR), True)
paint(g, MT['casco']); soften(g)

# --- 04 aba em L de fechamento (horizontal + saia 40 mm) -----------------
g = mk(TE, '04_ABA_L_FECHAMENTO', TG['02_TAMPA'])
ga = mk(g.get_entities(), 'ABA_L_MESA_HORIZONTAL', TG['02_TAMPA'])
ga.get_entities().fill(shell_rev([(RTP,Z3),(RTP,Z4)], [(RI,Z3),(RI,Z4)], NR), True)
paint(ga, MT['chapa']); soften(ga)
gb = mk(g.get_entities(), 'ABA_L_SAIA_40MM', TG['02_TAMPA'])
gb.get_entities().fill(shell_rev([(RO+E,Z3-PARAM['aba_L']),(RO+E,Z3)],
                                 [(RO,Z3-PARAM['aba_L']),(RO,Z3)], NR), True)
paint(gb, MT['chapa']); soften(gb)

# --- 03 tampa abaulada D1140 --------------------------------------------
FL = ZTP - E - Z4                                  # flecha interna
RES = (RTP*RTP + FL*FL)/(2.0*FL)                   # raio da calota
ZC0 = (ZTP - E) - RES
RFURO = PARAM['diam_entrada']/2.0                  # furo central do respiro
prof_i = []; NP = 22
for i in range(NP+1):
    r = RFURO + (RTP-RFURO)*i/float(NP)
    prof_i.append((r, ZC0 + math.sqrt(RES*RES - r*r)))
prof_o = [(r, z+E) for (r, z) in prof_i]
g = mk(TE, '03_TAMPA_D1140_ESP5', TG['02_TAMPA'])
g.get_entities().fill(shell_rev(prof_o, prof_i, NR), True)
paint(g, MT['casco']); soften(g)

# --- 05 sistema interno --------------------------------------------------
g5 = mk(TE, '05_SISTEMA_INTERNO', TG['04_INTERNOS']); E5 = g5.get_entities()
RCAL = PARAM['diam_anel_int']/2.0                  # 500 crista da calha
ZCF = PARAM['z_calha_fundo']; ZCR = PARAM['z_crista_calha']
g = mk(E5, 'CALHA_VERTEDORA_PAREDE_D1000', TG['04_INTERNOS'])
g.get_entities().fill(shell_rev([(RCAL,ZCF),(RCAL,ZCR)],
                                [(RCAL-E,ZCF),(RCAL-E,ZCR)], NR), True)
paint(g, MT['int']); soften(g)
g = mk(E5, 'CALHA_VERTEDORA_FUNDO', TG['04_INTERNOS'])
g.get_entities().fill(shell_rev([(RI,ZCF-E),(RI,ZCF)],
                                [(RCAL-E,ZCF-E),(RCAL-E,ZCF)], NR), True)
paint(g, MT['int']); soften(g)

RD = PARAM['diam_tubo_int']/2.0                    # 350
RDI = PARAM['diam_cone_int']/2.0                   # 200
HTB = PARAM['h_tubo_int']; HCN = PARAM['h_cone_int']
ZD0 = Z2 + HCN                                     # 1650
g = mk(E5, 'DEFLETOR_TUBO_D700_H900', TG['04_INTERNOS'])
g.get_entities().fill(shell_rev([(RD,ZD0),(RD,ZD0+HTB)],
                                [(RD-E,ZD0),(RD-E,ZD0+HTB)], NR), True)
paint(g, MT['int']); soften(g)
g = mk(E5, 'DEFLETOR_CONE_D700_D400_H400', TG['04_INTERNOS'])
kc2 = math.sqrt((RD-RDI)**2 + HCN**2)
dr2 = E*HCN/kc2; dz2 = E*(RD-RDI)/kc2
g.get_entities().fill(shell_rev([(RDI,Z2),(RD,ZD0)],
                                [(RDI-dr2,Z2+dz2),(RD-dr2,ZD0+dz2)], NR), True)
paint(g, MT['int']); soften(g)

# --- respiro central 1" BSP ---------------------------------------------
g = mk(TE, 'RESPIRO_CENTRAL_D40', TG['02_TAMPA'])
g.get_entities().fill(cone_tube((0.,0.,ZTP-30.), (0.,0.,ZTP+140.),
                                RFURO+3., RFURO, RFURO+3., RFURO, 24), True)
paint(g, MT['tubo']); soften(g)

result = {'bloco':'M1','flecha_interna':FL,'raio_calota':round(RES,1),
          'topo_tampa':ZTP,'grupos':[x.get_name() for x in TE.get_groups()]}


# ===========================================================================
# BLOCO 03  - MODELO: COMPONENTE PE_INCLINADO_TUBO_D76 (Detalhes B e C)
# ===========================================================================
H = session_state['H']; PARAM = session_state['PARAM']
P=H['P']; circ=H['circ']; quad=H['quad']; prism=H['prism']; cone_tube=H['cone_tube']
shell_rev=H['shell_rev']; mk=H['mk']; paint=H['paint']; soften=H['soften']
getmat=H['getmat']; gettag=H['gettag']

def slab(poly, dv):
    n = len(poly); geom = GeometryInput()
    verts = [P(*p) for p in poly] + [P(p[0]+dv[0], p[1]+dv[1], p[2]+dv[2]) for p in poly]
    geom.set_vertices(verts)
    for j in range(n):
        k = (j+1) % n
        geom = quad(geom, j, k, n+k, n+j)
    lp = LoopInput()
    for j in range(n-1,-1,-1): lp.add_vertex_index(j)
    _, geom = geom.add_face(lp)
    lp = LoopInput()
    for j in range(n): lp.add_vertex_index(n+j)
    _, geom = geom.add_face(lp)
    return geom
H['slab'] = slab; session_state['H'] = H

def hexp(af):
    r = af/math.sqrt(3.0)
    return [(r*math.cos(math.radians(60*i)), r*math.sin(math.radians(60*i))) for i in range(6)]

def rotz(a):
    c = math.cos(math.radians(a)); s = math.sin(math.radians(a))
    return SUTransformation([c,s,0.,0., -s,c,0.,0., 0.,0.,1.,0., 0.,0.,0.,1.])

def newdef(name):
    cd = ComponentDefinition(); cd.set_name(name); model.add_component_definitions([cd])
    return cd

TG = {}
for nm in ['08_PES','09_SUPORTE_INTERNO','11_PARAFUSOS','12_ESTRUTURA','13_SOLDAS']:
    TG[nm] = gettag(model, nm)
MT = {k: getmat(model, v, 0,0,0) for k, v in
      [('estrut','Aco_Estrutural'),('chapa','Aco_Chapa'),('tubo','Aco_Tubo'),
       ('paraf','Aco_Parafuso'),('porca','Aco_Porca'),('arru','Aco_Arruela'),
       ('solda','Cordao_Solda'),('int','Aco_Interno')]}

TQ = [g for g in model.get_entities().get_groups() if g.get_name()=='TANQUE_DECANTADOR_3D'][0]
TE = TQ.get_entities()

# =====================================================================
# DETALHE C  - PE INCLINADO EM TUBO REDONDO O76x3  (+ DETALHE B na base)
# =====================================================================
Z_TOP = 1400.0; R_TOP = 550.0; LPE = PARAM['comprimento_pe']; ZC = 24.0
DZ = Z_TOP - ZC
DX = math.sqrt(LPE*LPE - DZ*DZ)
R_BOT = R_TOP + DX
ANG = math.degrees(math.atan2(DX, DZ))
RT = PARAM['pe_tubo_d']/2.0; TES = PARAM['pe_tubo_e']
ux = DX/LPE; uz = -DZ/LPE

cd = newdef('PE_INCLINADO_TUBO_D76')
CE = cd.get_entities()

g = mk(CE, 'TUBO_REDONDO_D76x3', TG['08_PES'])
g.get_entities().fill(prism((R_TOP,0.,Z_TOP), (R_BOT,0.,ZC), circ(RT,28), circ(RT-TES,28)), True)
paint(g, MT['tubo']); soften(g)

g = mk(CE, 'CHAPA_TOPO_10MM', TG['08_PES'])
g.get_entities().fill(prism((R_TOP-ux*10.,0.,Z_TOP-uz*10.), (R_TOP,0.,Z_TOP),
                            [(-85.,-60.),(85.,-60.),(85.,60.),(-85.,60.)]), True)
paint(g, MT['chapa'])

g = mk(CE, 'CHAPA_REFORCO_CURVADA_10MM', TG['08_PES'])
ang0 = 14.0; NA = 14
po = [(R_TOP+10.0, Z_TOP-70.0), (R_TOP+10.0, Z_TOP+70.0)]
pi = [(R_TOP, Z_TOP-70.0), (R_TOP, Z_TOP+70.0)]
vv = []; geom = GeometryInput()
for (rr, zz) in [po[0], po[1], pi[1], pi[0]]:
    pass
pts_out = []; pts_in = []
for i in range(NA+1):
    a = math.radians(-ang0 + 2*ang0*i/float(NA))
    pts_out.append((R_TOP+10.0)*math.cos(a))
poly_top = []
for i in range(NA+1):
    a = math.radians(-ang0 + 2*ang0*i/float(NA))
    poly_top.append(((R_TOP+10.)*math.cos(a), (R_TOP+10.)*math.sin(a), Z_TOP-70.))
for i in range(NA, -1, -1):
    a = math.radians(-ang0 + 2*ang0*i/float(NA))
    poly_top.append((R_TOP*math.cos(a), R_TOP*math.sin(a), Z_TOP-70.))
g.get_entities().fill(slab(poly_top, (0.,0.,140.)), True)
paint(g, MT['chapa']); soften(g)

for sgy in (-1., 1.):
    g = mk(CE, 'REFORCO_TRIANGULAR_6MM_TOPO', TG['08_PES'])
    g.get_entities().fill(slab([(R_TOP+8., sgy*40., Z_TOP+62.),
                                (R_TOP+8., sgy*40., Z_TOP-62.),
                                (R_TOP+150., sgy*40., Z_TOP-118.)], (0.,sgy*6.,0.)), True)
    paint(g, MT['chapa'])

# ---- DETALHE B : sapata (caixa soldada fechada) ---------------------
X0 = R_BOT-95.; X1 = R_BOT+95.; YB = 110.; ZB = 12.; ZBOX = 190.
g = mk(CE, 'CHAPA_BASE_12MM_260x220', TG['08_PES'])
g.get_entities().fill(slab([(R_BOT-130.,-YB,0.),(R_BOT+130.,-YB,0.),
                            (R_BOT+130.,YB,0.),(R_BOT-130.,YB,0.)], (0.,0.,ZB)), True)
paint(g, MT['chapa'])
for sg in (-1., 1.):
    g = mk(CE, 'CHAPA_LATERAL_6MM_SAPATA', TG['08_PES'])
    g.get_entities().fill(slab([(X0, sg*RT, ZB),(X1, sg*RT, ZB),
                                (X1, sg*RT, ZBOX),(X0, sg*RT, ZBOX)], (0., sg*6., 0.)), True)
    paint(g, MT['chapa'])
for (xx, sgx) in ((X0,1.),(X1,-1.)):
    g = mk(CE, 'ENRIJECEDOR_6MM_SAPATA', TG['08_PES'])
    g.get_entities().fill(slab([(xx,-YB+18.,ZB),(xx,YB-18.,ZB),
                                (xx,(YB-18.)*0.5,130.),(xx,-(YB-18.)*0.5,130.)],
                               (sgx*6.,0.,0.)), True)
    paint(g, MT['chapa'])
g = mk(CE, 'COLAR_SOLDA_PE', TG['13_SOLDAS'])
A = (R_BOT,0.,ZC); B = (R_BOT-26.*ux, 0., ZC-26.*uz)
g.get_entities().fill(cone_tube(A, B, RT+13., RT, RT+1., RT, 28), True)
paint(g, MT['solda']); soften(g)

for sx in (-1., 1.):
    for sy in (-1., 1.):
        g = mk(CE, 'CHUMBADOR_D16', TG['11_PARAFUSOS'])
        g.get_entities().fill(prism((R_BOT+sx*95., sy*80., -120.),
                                    (R_BOT+sx*95., sy*80., 15.), circ(8., 16)), True)
        paint(g, MT['paraf']); soften(g)
        g = mk(CE, 'ARRUELA_LISA_D16', TG['11_PARAFUSOS'])
        g.get_entities().fill(prism((R_BOT+sx*95., sy*80., ZB),
                                    (R_BOT+sx*95., sy*80., ZB+3.), circ(17.,20), circ(8.5,20)), True)
        paint(g, MT['arru']); soften(g)
        g = mk(CE, 'PORCA_SEXTAVADA_M16', TG['11_PARAFUSOS'])
        g.get_entities().fill(prism((R_BOT+sx*95., sy*80., ZB+3.),
                                    (R_BOT+sx*95., sy*80., ZB+16.), hexp(24.), circ(8.,12)), True)
        paint(g, MT['porca'])

gp = mk(TE, '07_PES_INCLINADOS', TG['08_PES'])
for a in (0., 120., 240.):
    ci = ComponentInstance(cd); gp.get_entities().add_instance(ci)
    ci.set_name('PE_%03d' % int(a)); ci.set_transform(rotz(a))

result = {'bloco':'M2a','R_BOT':round(R_BOT,1),'inclinacao_graus':round(ANG,2),
          'diam_ext_pe_a_pe':round(2*(R_BOT+130.),1),
          'comprimento_pe':LPE,'faces_def':len(CE.get_faces())}


# ===========================================================================
# BLOCO 04  - MODELO: INSTANCIAS DOS 3 PES A 0/120/240
# ===========================================================================
def rotz(a):
    c = math.cos(math.radians(a)); s = math.sin(math.radians(a))
    return SUTransformation([c,s,0.,0., -s,c,0.,0., 0.,0.,1.,0., 0.,0.,0.,1.])

cd = [d for d in model.get_component_definitions() if d.get_name()=='PE_INCLINADO_TUBO_D76'][0]
TQ = [g for g in model.get_entities().get_groups() if g.get_name()=='TANQUE_DECANTADOR_3D'][0]
gp = [g for g in TQ.get_entities().get_groups() if g.get_name()=='07_PES_INCLINADOS'][0]
for i in gp.get_entities().get_instances():
    gp.get_entities().erase([i])
for a in (0., 120., 240.):
    ci = cd.create_instance()
    gp.get_entities().add_instance(ci)
    ci.set_name('PE_%03d' % int(a))
    ci.set_transform(rotz(a))
bb = gp.get_bounding_box()
result = {'bloco':'M2a-fix','instancias':gp.get_entities().get_num_instances(),
          'bbox_mm':[round(bb.min_point[i]*25.4,1) for i in range(3)] +
                    [round(bb.max_point[i]*25.4,1) for i in range(3)]}


# ===========================================================================
# BLOCO 05  - MODELO: SUPORTES INTERNOS LATERAIS (Detalhe A)
# ===========================================================================
H = session_state['H']
P=H['P']; circ=H['circ']; prism=H['prism']; mk=H['mk']; paint=H['paint']
soften=H['soften']; getmat=H['getmat']; gettag=H['gettag']; slab=H['slab']

def hexp(af):
    r = af/math.sqrt(3.0)
    return [(r*math.cos(math.radians(60*i)), r*math.sin(math.radians(60*i))) for i in range(6)]
def rotz(a):
    c = math.cos(math.radians(a)); s = math.sin(math.radians(a))
    return SUTransformation([c,s,0.,0., -s,c,0.,0., 0.,0.,1.,0., 0.,0.,0.,1.])

MT = {k: getmat(model, v, 0,0,0) for k,v in
      [('chapa','Aco_Chapa'),('tubo','Aco_Tubo'),('paraf','Aco_Parafuso'),
       ('porca','Aco_Porca'),('arru','Aco_Arruela'),('int','Aco_Interno')]}
TGS = gettag(model,'09_SUPORTE_INTERNO'); TGP = gettag(model,'11_PARAFUSOS')

RI = 545.0                     # raio interno do costado
ZA = 2160.0; ZB = 2514.0       # apoios inferior e superior
RB = 440.0                     # alcance interno da travessa

cd = ComponentDefinition(); cd.set_name('SUPORTE_LATERAL_INTERNO')
model.add_component_definitions([cd]); CE = cd.get_entities()

# chapa de reforco CURVADA 6 mm acompanhando o raio interno do costado
NA = 14; ang0 = 9.0
poly = []
for i in range(NA+1):
    a = math.radians(-ang0 + 2*ang0*i/float(NA))
    poly.append(((RI)*math.cos(a), RI*math.sin(a), ZA-20.))
for i in range(NA, -1, -1):
    a = math.radians(-ang0 + 2*ang0*i/float(NA))
    poly.append(((RI-6.)*math.cos(a), (RI-6.)*math.sin(a), ZA-20.))
g = mk(CE, 'CHAPA_REFORCO_CURVADA_6MM', TGS)
g.get_entities().fill(slab(poly, (0.,0., (ZB+20.)-(ZA-20.))), True)
paint(g, MT['chapa']); soften(g)

# chapas de apoio superior e inferior 6 mm
for zz in (ZA, ZB):
    g = mk(CE, 'CHAPA_APOIO_6MM', TGS)
    g.get_entities().fill(slab([(RB,-55.,zz),(RI-6.,-55.,zz),(RI-6.,55.,zz),(RB,55.,zz)],
                               (0.,0.,6.)), True)
    paint(g, MT['chapa'])

# travessa em tubo 40x40x3
g = mk(CE, 'TRAVESSA_TUBO_40x40x3', TGS)
g.get_entities().fill(prism((RB+10.,0.,ZA+180.), (RI-6.,0.,ZA+180.),
                            [(-20.,-20.),(20.,-20.),(20.,20.),(-20.,20.)],
                            [(-17.,-17.),(17.,-17.),(17.,17.),(-17.,17.)]), True)
paint(g, MT['tubo'])

# barra roscada O16 vertical + arruela e porca nas DUAS extremidades
XR = RB + 40.0
g = mk(CE, 'BARRA_ROSCADA_D16', TGP)
g.get_entities().fill(prism((XR,0.,ZA-14.), (XR,0.,ZB+34.), circ(8.,16)), True)
paint(g, MT['paraf']); soften(g)
for (zw, zn) in ((ZA-14., ZA-11.), (ZB+9., ZB+12.)):
    g = mk(CE, 'ARRUELA_LISA_D16', TGP)
    g.get_entities().fill(prism((XR,0.,zw), (XR,0.,zn), circ(17.,20), circ(8.5,20)), True)
    paint(g, MT['arru']); soften(g)
    g = mk(CE, 'PORCA_SEXTAVADA_M16', TGP)
    zz0 = zn if zn > ZB else zn-13.
    g.get_entities().fill(prism((XR,0.,zn), (XR,0.,zn+13.), hexp(24.), circ(8.,12)), True)
    paint(g, MT['porca'])

TQ = [g for g in model.get_entities().get_groups() if g.get_name()=='TANQUE_DECANTADOR_3D'][0]
gs = mk(TQ.get_entities(), '06_SUPORTES_LATERAIS_INTERNOS', TGS)
for a in (45., 135., 225., 315.):
    ci = cd.create_instance(); gs.get_entities().add_instance(ci)
    ci.set_name('SUP_%03d' % int(a)); ci.set_transform(rotz(a))

bb = gs.get_bounding_box()
result = {'bloco':'M2b','instancias':gs.get_entities().get_num_instances(),
          'bbox_mm':[round(bb.min_point[i]*25.4,1) for i in range(3)] +
                    [round(bb.max_point[i]*25.4,1) for i in range(3)]}


# ===========================================================================
# BLOCO 06  - MODELO: BOCAIS, CURVAS 90 REAIS, FLANGES ANSI, DRENO+VALVULA
# ===========================================================================
H = session_state['H']
P=H['P']; circ=H['circ']; quad=H['quad']; prism=H['prism']; cone_tube=H['cone_tube']
mk=H['mk']; paint=H['paint']; soften=H['soften']; getmat=H['getmat']; gettag=H['gettag']
vadd=H['vadd']; vscl=H['vscl']; vnorm=H['vnorm']; vcross=H['vcross']

def elbow(Sp, d_in, d_out, Rb, r_out, r_in, n_arc=16, n_tube=24, sweep=90.0):
    """CURVA 90 REAL - varredura toroidal. O = Sp + Rb*d_out;
       C(t) = O + Rb*(a1*cos t + a2*sin t), a1=-d_out, a2=d_in."""
    d_in = vnorm(d_in); d_out = vnorm(d_out)
    a1 = vscl(d_out,-1.0); a2 = d_in
    O = vadd(Sp, vscl(d_out, Rb)); B = vnorm(vcross(a1,a2))
    geom = GeometryInput(); verts = []; RO = []; RI = []
    for r_use, store in ((r_out, RO), (r_in, RI)):
        for k in range(n_arc+1):
            t = math.radians(sweep)*k/float(n_arc)
            N = vadd(vscl(a1, math.cos(t)), vscl(a2, math.sin(t)))
            Cc = vadd(O, vscl(N, Rb))
            s = len(verts)
            for j in range(n_tube):
                ph = 2.0*math.pi*j/n_tube
                dv = vadd(vscl(N, math.cos(ph)), vscl(B, math.sin(ph)))
                verts.append(P(*vadd(Cc, vscl(dv, r_use))))
            store.append(list(range(s, s+n_tube)))
    geom.set_vertices(verts)
    for k in range(n_arc):
        for j in range(n_tube):
            j2 = (j+1) % n_tube
            geom = quad(geom, RO[k][j], RO[k][j2], RO[k+1][j2], RO[k+1][j])
            geom = quad(geom, RI[k][j], RI[k+1][j], RI[k+1][j2], RI[k][j2])
    for j in range(n_tube):
        j2 = (j+1) % n_tube
        geom = quad(geom, RO[0][j], RI[0][j], RI[0][j2], RO[0][j2])
        geom = quad(geom, RO[n_arc][j], RO[n_arc][j2], RI[n_arc][j2], RI[n_arc][j])
    return geom

def elbow_end(Sp, d_in, d_out, Rb):
    return vadd(vadd(Sp, vscl(vnorm(d_out), Rb)), vscl(vnorm(d_in), Rb))

H['elbow'] = elbow; H['elbow_end'] = elbow_end; session_state['H'] = H

def hexp(af):
    r = af/math.sqrt(3.0)
    return [(r*math.cos(math.radians(60*i)), r*math.sin(math.radians(60*i))) for i in range(6)]

MT = {k: getmat(model, v, 0,0,0) for k,v in
      [('tubo','Aco_Tubo'),('curva','Aco_Curva90'),('flange','Aco_Flange_ANSI'),
       ('paraf','Aco_Parafuso'),('porca','Aco_Porca'),('valv','Valvula_Gaveta'),
       ('volante','Volante'),('chapa','Aco_Chapa')]}
TGE=gettag(model,'05_ENTRADA'); TGS=gettag(model,'06_SAIDA')
TGD=gettag(model,'07_DRENO_VALVULA'); TGF=gettag(model,'10_FLANGES')
TGP=gettag(model,'11_PARAFUSOS')
TQ=[g for g in model.get_entities().get_groups() if g.get_name()=='TANQUE_DECANTADOR_3D'][0]
TE=TQ.get_entities()

# ANSI B16.5 classe 150
ANSI = {40:{'od':127.0,'esp':17.5,'bc':98.4,'nb':4,'db':16.0,'hub':66.0,'hl':22.0},
        50:{'od':152.4,'esp':19.1,'bc':120.7,'nb':4,'db':19.0,'hub':78.0,'hl':25.0}}

def ax(p, d, t):
    return (p[0]+d[0]*t, p[1]+d[1]*t, p[2]+d[2]*t)

def flange_par(ents, name, pos, d, dn, ro_t, ri_t, tag):
    """Par de flanges costa-a-costa + parafusos + porcas (juncao flangeada real)."""
    A = ANSI[dn]; d = vnorm(d)
    gg = mk(ents, name, tag); GE = gg.get_entities()
    for k in (0, 1):
        s = -1.0 if k == 0 else 1.0
        p0 = ax(pos, d, 0.0); p1 = ax(pos, d, s*A['esp'])
        g = mk(GE, 'FLANGE_ANSI_DN%d_CL150' % dn, tag)
        g.get_entities().fill(prism(p0, p1, circ(A['od']/2.0,32), circ(ri_t,24)), True)
        paint(g, MT['flange']); soften(g)
        g = mk(GE, 'PESCOCO_FLANGE_DN%d' % dn, tag)
        g.get_entities().fill(cone_tube(ax(pos,d,s*A['esp']), ax(pos,d,s*(A['esp']+A['hl'])),
                                        A['hub']/2.0, ri_t, ro_t+2.0, ri_t, 28), True)
        paint(g, MT['flange']); soften(g)
    for i in range(A['nb']):
        a = 2.0*math.pi*i/A['nb'] + math.pi/A['nb']
        u = vnorm(vcross(d, (0.,0.,1.) if abs(d[2]) < 0.9 else (1.,0.,0.)))
        v = vcross(d, u)
        off = vadd(vscl(u, A['bc']/2.0*math.cos(a)), vscl(v, A['bc']/2.0*math.sin(a)))
        c0 = vadd(pos, off)
        g = mk(GE, 'PARAFUSO_SEXTAVADO_M%d' % int(A['db']), TGP)
        g.get_entities().fill(prism(ax(c0,d,-A['esp']-14.), ax(c0,d,A['esp']+14.),
                                    circ(A['db']/2.0,12)), True)
        paint(g, MT['paraf']); soften(g)
        for s in (-1.0, 1.0):
            g = mk(GE, 'PORCA_SEXTAVADA', TGP)
            g.get_entities().fill(prism(ax(c0,d,s*A['esp']), ax(c0,d,s*(A['esp']+13.)),
                                        hexp(A['db']*1.6), circ(A['db']/2.0,12)), True)
            paint(g, MT['porca'])
    return gg

RE40 = 20.0; RI40 = 17.0
RE50 = 25.0; RI50 = 22.0

# ---------- 08 ENTRADA O40  (tubo -> curva 90 real -> flange) -----------
g8 = mk(TE, '08_ENTRADA_D40', TGE); E8 = g8.get_entities()
g = mk(E8, 'BOCAL_ENTRADA_D40', TGE)
g.get_entities().fill(prism((-545.,0.,2400.), (-760.,0.,2400.), circ(RE40,24), circ(RI40,24)), True)
paint(g, MT['tubo']); soften(g)
SpE = (-760.,0.,2400.)
g = mk(E8, 'CURVA_90_RAIO_R60_ENTRADA', TGE)
g.get_entities().fill(elbow(SpE, (-1.,0.,0.), (0.,0.,1.), 60., RE40, RI40), True)
paint(g, MT['curva']); soften(g)
EndE = elbow_end(SpE, (-1.,0.,0.), (0.,0.,1.), 60.)
g = mk(E8, 'PRUMADA_ENTRADA_D40', TGE)
g.get_entities().fill(prism(EndE, (EndE[0],0.,2560.), circ(RE40,24), circ(RI40,24)), True)
paint(g, MT['tubo']); soften(g)
flange_par(E8, 'JUNTA_FLANGEADA_DN40_ENTRADA', (EndE[0],0.,2560.), (0.,0.,1.), 40, RE40, RI40, TGF)

# ---------- 09 SAIDA / CALHA O40 ----------------------------------------
g9 = mk(TE, '09_SAIDA_CALHA_D40', TGS); E9 = g9.get_entities()
g = mk(E9, 'BOCAL_SAIDA_D40', TGS)
g.get_entities().fill(prism((496.,0.,2380.), (760.,0.,2380.), circ(RE40,24), circ(RI40,24)), True)
paint(g, MT['tubo']); soften(g)
SpS = (760.,0.,2380.)
g = mk(E9, 'CURVA_90_RAIO_R60_SAIDA', TGS)
g.get_entities().fill(elbow(SpS, (1.,0.,0.), (0.,0.,-1.), 60., RE40, RI40), True)
paint(g, MT['curva']); soften(g)
EndS = elbow_end(SpS, (1.,0.,0.), (0.,0.,-1.), 60.)
g = mk(E9, 'PRUMADA_SAIDA_D40', TGS)
g.get_entities().fill(prism(EndS, (EndS[0],0.,1560.), circ(RE40,24), circ(RI40,24)), True)
paint(g, MT['tubo']); soften(g)
flange_par(E9, 'JUNTA_FLANGEADA_DN40_SAIDA', (EndS[0],0.,1500.), (0.,0.,1.), 40, RE40, RI40, TGF)

# ---------- 10 DRENO O50 + curva R50 + 11 VALVULA GAVETA ---------------
g10 = mk(TE, '10_DRENO_D50', TGD); E10 = g10.get_entities()
SpD = (0.,0.,650.)
g = mk(E10, 'CURVA_90_RAIO_R50_DRENO', TGD)
g.get_entities().fill(elbow(SpD, (0.,0.,-1.), (-1.,0.,0.), 50., RE50, RI50), True)
paint(g, MT['curva']); soften(g)
EndD = elbow_end(SpD, (0.,0.,-1.), (-1.,0.,0.), 50.)
g = mk(E10, 'TUBO_DRENO_D50', TGD)
g.get_entities().fill(prism(EndD, (-300.,0.,600.), circ(RE50,24), circ(RI50,24)), True)
paint(g, MT['tubo']); soften(g)
flange_par(E10, 'JUNTA_FLANGEADA_DN50_MONTANTE', (-319.1,0.,600.), (-1.,0.,0.), 50, RE50, RI50, TGF)

g11 = mk(TE, '11_VALVULA_GAVETA_D50', TGD); E11 = g11.get_entities()
g = mk(E11, 'CORPO_VALVULA_GAVETA_D50', TGD)
g.get_entities().fill(cone_tube((-338.2,0.,600.), (-393.,0.,600.), 46., RI50, 58., RI50, 24), True)
paint(g, MT['valv']); soften(g)
g = mk(E11, 'CORPO_VALVULA_GAVETA_D50_B', TGD)
g.get_entities().fill(cone_tube((-393.,0.,600.), (-448.2,0.,600.), 58., RI50, 46., RI50, 24), True)
paint(g, MT['valv']); soften(g)
g = mk(E11, 'CASTELO_VALVULA', TGD)
g.get_entities().fill(cone_tube((-393.,0.,640.), (-393.,0.,720.), 34., 10., 26., 10., 20), True)
paint(g, MT['valv']); soften(g)
g = mk(E11, 'HASTE_VALVULA', TGD)
g.get_entities().fill(prism((-393.,0.,700.), (-393.,0.,790.), circ(9.,12)), True)
paint(g, MT['paraf']); soften(g)
g = mk(E11, 'VOLANTE_D160', TGD)
g.get_entities().fill(prism((-393.,0.,780.), (-393.,0.,792.), circ(80.,32), circ(64.,32)), True)
paint(g, MT['volante']); soften(g)
for i in range(4):
    a = math.pi*i/4.0
    g = mk(E11, 'RAIO_VOLANTE', TGD)
    g.get_entities().fill(prism((-393.-72.*math.cos(a), 72.*math.sin(a), 786.),
                                (-393.+72.*math.cos(a), -72.*math.sin(a), 786.),
                                circ(5.,8)), True)
    paint(g, MT['volante'])
flange_par(E10, 'JUNTA_FLANGEADA_DN50_JUSANTE', (-467.3,0.,600.), (-1.,0.,0.), 50, RE50, RI50, TGF)
g = mk(E10, 'TUBO_SAIDA_DRENO_D50', TGD)
g.get_entities().fill(prism((-486.4,0.,600.), (-820.,0.,600.), circ(RE50,24), circ(RI50,24)), True)
paint(g, MT['tubo']); soften(g)

# ---------- verificacao geometrica das curvas 90 (secao 17) -------------
def check_elbow(gname, Rb, r_out, plane_axes, normal_axis):
    for g in TE.get_groups():
        for sub in g.get_entities().get_groups():
            if sub.get_name() == gname:
                bb = sub.get_bounding_box()
                mn = [bb.min_point[i]*25.4 for i in range(3)]
                mx = [bb.max_point[i]*25.4 for i in range(3)]
                ext = [round(mx[i]-mn[i],2) for i in range(3)]
                esp = round(Rb + r_out, 2); enr = round(2*r_out, 2)
                ok = (abs(ext[plane_axes[0]]-esp) < 0.6 and abs(ext[plane_axes[1]]-esp) < 0.6
                      and abs(ext[normal_axis]-enr) < 0.6)
                return {'extensao': ext, 'esperado_no_plano': esp,
                        'esperado_normal': enr, 'OK': ok}
    return {'nao_encontrada': gname}

result = {'bloco':'M3',
 'curva_entrada_R60': check_elbow('CURVA_90_RAIO_R60_ENTRADA', 60., RE40, (0,2), 1),
 'curva_saida_R60':   check_elbow('CURVA_90_RAIO_R60_SAIDA',   60., RE40, (0,2), 1),
 'curva_dreno_R50':   check_elbow('CURVA_90_RAIO_R50_DRENO',   50., RE50, (0,2), 1)}


# ===========================================================================
# BLOCO 07  - CALCULO DE VOLUMES + VALIDACAO GEOMETRICA (secoes 19-36 e 46)
# ===========================================================================
H = session_state['H']; PARAM = session_state['PARAM']
P=H['P']; mk=H['mk']; lathe_solid=H['lathe_solid']
ROOT = model.get_entities()
for g in list(ROOT.get_groups()):
    if g.get_name().startswith('_TMP'):
        ROOT.erase_entities([g])

def volume_cilindro(diametro, altura):
    return math.pi * (diametro/2.0)**2 * altura
def volume_cone(raio, altura):
    return math.pi * raio**2 * altura / 3.0
def volume_tronco_cone(rM, rm, h):
    return math.pi * h / 3.0 * (rM*rM + rM*rm + rm*rm)
def L(v): return v/1000000.0
def M3(v): return v/1000000000.0

ESP = PARAM['espessura_chapa']
D_EXT = PARAM['diam_tanque']; D_INT = D_EXT - 2.0*ESP; R_INT = D_INT/2.0
Z_CS = PARAM['z_cone_saida']; Z_CT = PARAM['z_cone_topo']; Z_ST = PARAM['z_costado_topo']
R_SAI = PARAM['diam_dreno']/2.0
kc = math.sqrt((D_EXT/2.0-R_SAI)**2 + (Z_CT-Z_CS)**2)
dr = ESP*(Z_CT-Z_CS)/kc; dz = ESP*(D_EXT/2.0-R_SAI)/kc
R_CB = R_SAI-dr; Z_CB = Z_CS+dz
R_CT = D_EXT/2.0-dr; Z_CTi = Z_CT+dz
H_CONE_INT = Z_CTi-Z_CB; H_CIL_INT = Z_ST-Z_CTi
V_CONE = volume_tronco_cone(R_CT, R_CB, H_CONE_INT)
V_CIL  = volume_cilindro(D_INT, H_CIL_INT)
V_BRUTO = V_CIL + V_CONE

gtmp = mk(ROOT, '_TMP_LIQ')
gtmp.get_entities().fill(lathe_solid([(R_CB,Z_CB),(R_CT,Z_CTi),(R_INT,Z_CTi),(R_INT,Z_ST)], 96), True)
vraw = gtmp.compute_volume()
V_GEO = abs(vraw)*(25.4**3) if vraw is not None else None
ROOT.erase_entities([gtmp])
DIF = (abs(V_GEO-V_BRUTO)/V_BRUTO*100.0) if V_GEO else None

def vol_h(h):
    if h <= 0: return 0.0
    if h <= H_CONE_INT:
        rr = R_CB + (R_CT-R_CB)*h/H_CONE_INT
        return volume_tronco_cone(rr, R_CB, h)
    return V_CONE + volume_cilindro(D_INT, h-H_CONE_INT)

H_MAX = Z_ST-Z_CB
Z_CRISTA = PARAM['z_crista_calha']; H_CRISTA = Z_CRISTA-Z_CB
TAB = []
hh = 200.0
while hh <= H_MAX+0.1:
    TAB.append((hh, L(vol_h(hh)))); hh += 200.0
V_UTIL = vol_h(H_CRISTA); V_LIVRE = V_BRUTO-V_UTIL

TQ=[g for g in ROOT.get_groups() if g.get_name()=='TANQUE_DECANTADOR_3D'][0]
V_ACO = 0.0
for g in TQ.get_entities().get_groups():
    if g.get_name() in ('05_SISTEMA_INTERNO','06_SUPORTES_LATERAIS_INTERNOS'):
        for sub in g.get_entities().get_groups():
            v = sub.compute_volume()
            if v is not None: V_ACO += abs(v)*(25.4**3)

session_state['VOL'] = {'D_EXT':D_EXT,'D_INT':D_INT,'R_INT':R_INT,'ESP':ESP,
 'H_CIL_INT':H_CIL_INT,'H_CONE_INT':H_CONE_INT,'R_CT':R_CT,'R_CB':R_CB,
 'V_CIL':V_CIL,'V_CONE':V_CONE,'V_BRUTO':V_BRUTO,'V_GEO':V_GEO,'DIF':DIF,
 'V_UTIL':V_UTIL,'V_LIVRE':V_LIVRE,'H_CRISTA':H_CRISTA,'H_MAX':H_MAX,
 'Z_CRISTA':Z_CRISTA,'Z_CB':Z_CB,'TAB':TAB,'V_ACO':V_ACO}

result = {'D_int_mm':D_INT,'H_cil_int':round(H_CIL_INT,2),'H_cone_int':round(H_CONE_INT,2),
 'R_cone_topo_int':round(R_CT,2),'R_cone_fundo_int':round(R_CB,2),
 'V_cilindro_L':round(L(V_CIL),2),'V_cone_L':round(L(V_CONE),2),
 'V_bruto_L':round(L(V_BRUTO),2),'V_bruto_m3':round(M3(V_BRUTO),4),
 'V_geometria_SU_L':round(L(V_GEO),2) if V_GEO else None,
 'divergencia_pc':round(DIF,4) if DIF else None,
 'V_util_crista_L':round(L(V_UTIL),2),'V_livre_L':round(L(V_LIVRE),2),
 'aco_internos_L':round(L(V_ACO),2),
 'tab_nivel':[(int(a),round(b,1)) for (a,b) in TAB]}


# ===========================================================================
# BLOCO 08  - PRANCHA: SISTEMA DE FOLHA, AREA UTIL, GRID, MOLDURA, TITULOS
# ===========================================================================
D = session_state['D']; H = session_state['H']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; drect=D['drect']
dbox=D['dbox']; txt=D['txt']; tw=D['tw']; dcirc=D['dcirc']
getmat=H['getmat']; gettag=H['gettag']; mk=H['mk']

# ---- 2/3. SISTEMA DE FOLHA --------------------------------------------
PAPER_WIDTH=1189.0; PAPER_HEIGHT=841.0
MARGIN=20.0
MARGIN_LEFT=MARGIN; MARGIN_RIGHT=MARGIN; MARGIN_TOP=MARGIN; MARGIN_BOTTOM=MARGIN
USABLE_WIDTH  = PAPER_WIDTH-MARGIN_LEFT-MARGIN_RIGHT
USABLE_HEIGHT = PAPER_HEIGHT-MARGIN_TOP-MARGIN_BOTTOM
UX0=MARGIN_LEFT; UY0=MARGIN_BOTTOM; UX1=PAPER_WIDTH-MARGIN_RIGHT; UY1=PAPER_HEIGHT-MARGIN_TOP

# ---- 7. GRID DE REGIOES ------------------------------------------------
RV0=466.0; RV1=UY1          # vistas
RD0=232.0; RD1=RV0          # detalhes ampliados
RT0=UY0;   RT1=RD0          # tabelas / volumes / notas / carimbo
COLV=[20.0,295.0,540.0,785.0,1060.0,1169.0]
COLD=[20.0+ i*(1149.0/6.0) for i in range(7)]
COLT=[20.0,245.0,455.0,790.0,950.0,1169.0]
CARIMBO_Z=122.0
REG = {
 'V01':(COLV[0],RV0,COLV[1],RV1,'01 - PLANTA SUPERIOR','ESCALA 1:10'),
 'V02':(COLV[1],RV0,COLV[2],RV1,'02 - ELEVACAO FRONTAL','ESCALA 1:10'),
 'V03':(COLV[2],RV0,COLV[3],RV1,'03 - ELEVACAO LATERAL','ESCALA 1:10'),
 'V04':(COLV[3],RV0,COLV[4],RV1,'04 - CORTE VERTICAL A-A','ESCALA 1:10'),
 'LEG':(COLV[4],RV0,COLV[5],RV1,'LEGENDA E NIVEIS',''),
 'DA':(COLD[0],RD0,COLD[1],RD1,'DETALHE A - SUPORTE INTERNO LATERAL','ESCALA 1:5'),
 'DB':(COLD[1],RD0,COLD[2],RD1,'DETALHE B - SUPORTE INFERIOR / SAPATA','ESCALA 1:2'),
 'DC':(COLD[2],RD0,COLD[3],RD1,'DETALHE C - PE INCLINADO','ESCALA 1:10'),
 'DD':(COLD[3],RD0,COLD[4],RD1,'DETALHE D - TAMPA COM ABA EM "L"','ESCALA 1:2'),
 'DE':(COLD[4],RD0,COLD[5],RD1,'DETALHE E - CONEXAO 90 FLANGEADA','ESCALA 1:2'),
 'DF':(COLD[5],RD0,COLD[6],RD1,'DETALHE F - DRENO + VALVULA','ESCALA 1:5'),
 'T1':(COLT[0],RT0,COLT[1],RT1,'TABELA DE DIMENSOES PRINCIPAIS',''),
 'T2':(COLT[1],RT0,COLT[2],RT1,'LISTA DE COMPONENTES PRINCIPAIS',''),
 'T3':(COLT[2],RT0,COLT[3],RT1,'CALCULO DE VOLUMES - DIMENSOES INTERNAS',''),
 'T4':(COLT[3],RT0,COLT[4],RT1,'VOLUME POR REGIAO E POR NIVEL',''),
 'T5':(COLT[4],CARIMBO_Z,COLT[5],RT1,'NOTAS TECNICAS',''),
 'T6':(COLT[4],RT0,COLT[5],CARIMBO_Z,'',''),
}
session_state['SHEET'] = {'PW':PAPER_WIDTH,'PH':PAPER_HEIGHT,'MG':MARGIN,
    'UX0':UX0,'UY0':UY0,'UX1':UX1,'UY1':UY1,'REG':REG,
    'RV0':RV0,'RV1':RV1,'RD0':RD0,'RD1':RD1,'RT0':RT0,'RT1':RT1,
    'COLV':COLV,'COLD':COLD,'COLT':COLT}

MF=getmat(model,'Prancha_Fundo',252,252,250); ML=getmat(model,'Desenho_Linha',28,30,34)
MTI=getmat(model,'Desenho_Titulo',222,228,236); MTX=getmat(model,'Desenho_Texto',22,24,28)
TGM=gettag(model,'20_PRANCHA_MOLDURA'); TGC=gettag(model,'25_PRANCHA_CARIMBO')

ROOT=model.get_entities()
for g in list(ROOT.get_groups()):
    if g.get_name()=='PRANCHA_A0_R01':
        ROOT.erase_entities([g])
PR = mk(ROOT,'PRANCHA_A0_R01',TGM); PE = PR.get_entities()

# --- fundo da folha -----------------------------------------------------
dbox(0.,0.,PAPER_WIDTH,PAPER_HEIGHT,0.0)
flush(PE,'FOLHA_A0_1189x841',MF,TGM)

# --- faixas de titulo das regioes (fundo cinza) -------------------------
TB=9.0
for k,(x0,z0,x1,z1,t,e) in REG.items():
    if t: dbox(x0,z1-TB,x1,z1,0.35)
flush(PE,'FAIXAS_TITULO',MTI,TGM)

# --- moldura, margem e divisorias --------------------------------------
drect(0.,0.,PAPER_WIDTH,PAPER_HEIGHT,1.4)
drect(UX0,UY0,UX1,UY1,0.9)
for k,(x0,z0,x1,z1,t,e) in REG.items():
    drect(x0,z0,x1,z1,0.45)
    if t: dline(x0,z1-TB,x1,z1-TB,0.45)
# marcas de centragem
for (xa,za,xb,zb) in [(PAPER_WIDTH/2.,0.,PAPER_WIDTH/2.,10.),
                      (PAPER_WIDTH/2.,PAPER_HEIGHT-10.,PAPER_WIDTH/2.,PAPER_HEIGHT),
                      (0.,PAPER_HEIGHT/2.,10.,PAPER_HEIGHT/2.),
                      (PAPER_WIDTH-10.,PAPER_HEIGHT/2.,PAPER_WIDTH,PAPER_HEIGHT/2.)]:
    dline(xa,za,xb,zb,0.6)
flush(PE,'MOLDURA_E_GRID',ML,TGM)

# --- titulos das regioes ------------------------------------------------
for k,(x0,z0,x1,z1,t,e) in REG.items():
    if t:
        txt(t, x0+3.0, z1-TB+2.4, 3.6, 'l')
        if e: txt(e, x1-3.0, z1-TB+2.4, 3.0, 'r')
flush(PE,'TITULOS_DAS_REGIOES',MTX,TGM)

result={'bloco':'S1','regioes':len(REG),'area_util':[USABLE_WIDTH,USABLE_HEIGHT],
        'colunas_vistas':COLV,'colunas_detalhes':[round(c,1) for c in COLD]}


# ===========================================================================
# BLOCO 09  - PRANCHA: VISTA 01 PLANTA + VISTA 02 ELEVACAO FRONTAL
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']; PARAM=session_state['PARAM']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; darc=D['darc']
dcirc=D['dcirc']; ddisc=D['ddisc']; drect=D['drect']; dbox=D['dbox']; ddash=D['ddash']
dcl=D['dcl']; dhatch=D['dhatch']; txt=D['txt']; tw=D['tw']; dimh=D['dimh']; dimv=D['dimv']
leader=D['leader']; balloon=D['balloon']; arrowhead=D['arrowhead']
getmat=H['getmat']; gettag=H['gettag']; mk=H['mk']

ML=getmat(model,'Desenho_Linha',28,30,34); MC=getmat(model,'Desenho_Cota',24,84,168)
MTX=getmat(model,'Desenho_Texto',22,24,28); MEX=getmat(model,'Desenho_Eixo',196,46,46)
MCO=getmat(model,'Desenho_Corte',118,126,136)
TGV=gettag(model,'21_PRANCHA_VISTAS'); TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()

ESC=1.0/15.0
RO=550.0; RI=545.0; RTP=570.0; RCAL=500.0; RD=350.0; RDI=200.0
Z1=650.0; Z2=1250.0; Z3=2550.0; Z4=2555.0; ZTP=2700.0
RB=1147.2; ZTOPPE=1400.0
ZCF=2350.0; ZCR=2500.0; ZD0=1650.0

# =====================  01 - PLANTA SUPERIOR  ==========================
x0,z0,x1,z1,_,_ = SH['REG']['V01']
CX=(x0+x1)/2.0; CZ=(z0+z1-9.0)/2.0
def pl(rx,ry): return (CX+rx*ESC, CZ+ry*ESC)

for r,wid in ((RTP,0.5),(RO,0.7),(RI,0.3),(RCAL,0.45),(RD,0.5),(RDI,0.5)):
    dcirc(CX,CZ,r*ESC,wid,72)
dcirc(CX,CZ,20.0*ESC,0.4,24)
for a in (0.,120.,240.):
    ca=math.cos(math.radians(a)); sa=math.sin(math.radians(a))
    pts=[]
    for (u,v) in ((-130.,-110.),(130.,-110.),(130.,110.),(-130.,110.)):
        rx=(RB+u)*ca - v*sa; ry=(RB+u)*sa + v*ca
        pts.append(pl(rx,ry))
    dpl(pts,0.5,True)
    dpl([pl((RO)*ca,(RO)*sa), pl((RB)*ca,(RB)*sa)],0.35)
    for (u,v) in ((-95.,-80.),(95.,-80.),(95.,80.),(-95.,80.)):
        rx=(RB+u)*ca - v*sa; ry=(RB+u)*sa + v*ca
        dcirc(CX+rx*ESC, CZ+ry*ESC, 8.0*ESC, 0.3, 12)
# bocais em planta
dpl([pl(-545.,-20.),pl(-820.,-20.),pl(-820.,20.),pl(-545.,20.)],0.45,True)
dpl([pl(496.,-20.),pl(820.,-20.),pl(820.,20.),pl(496.,20.)],0.45,True)
dpl([pl(-25.,-25.),pl(-820.,-25.),pl(-820.,25.),pl(-25.,25.)],0.35,True)
flush(PE,'V01_PLANTA_GEOMETRIA',ML,TGV)

# eixos + linha de corte A-A
dcl(CX-118.,CZ,CX+118.,CZ); dcl(CX,CZ-108.,CX,CZ+108.)
flush(PE,'V01_EIXOS',MEX,TGV)
for s in (-1.,1.):
    xx=CX+s*120.
    dline(xx,CZ,xx-s*10.,CZ,0.8)
    arrowhead(xx-s*10.,CZ,-s,0.,3.4,1.2)
    txt('A',xx+s*2.5,CZ+2.5,3.6,'c' if s<0 else 'c')
flush(PE,'V01_LINHA_DE_CORTE',MEX,TGV)

RR=[(RTP,'Ø1140 TAMPA'),(RO,'Ø1100 TANQUE'),(RD,'Ø700 DEFLETOR'),(RDI,'Ø400 DEFLETOR')]
yy=CZ+ (RTP*ESC) + 5.0
for i,(r,s) in enumerate(RR):
    zz=CZ - (RTP*ESC) - 6.0 - i*6.2
    dimh(CX-r*ESC, CX+r*ESC, zz, s, 2.3)
dimh(CX-(RB+130.)*ESC, CX+(RB+130.)*ESC, CZ-(RTP*ESC)-6.0-4*6.2, 'Ø2554 EXT. PE A PE', 2.3)
txt('0°',   CX+(RB+140.)*ESC, CZ+1.0, 2.6,'l')
txt('120°', CX+(RB+140.)*ESC*math.cos(math.radians(120)),
            CZ+(RB+150.)*ESC*math.sin(math.radians(120)), 2.6,'c')
txt('240°', CX+(RB+140.)*ESC*math.cos(math.radians(240)),
            CZ-(RB+165.)*ESC, 2.6,'c')
leader(CX-560.*ESC, CZ, [(CX-95.,CZ+52.),(CX-72.,CZ+52.)],'ENTRADA Ø40',2.2)
leader(CX+560.*ESC, CZ, [(CX+72.,CZ+52.),(CX+95.,CZ+52.)],'SAIDA / CALHA Ø40',2.2,'r')
leader(CX-700.*ESC, CZ-18.*ESC, [(CX-80.,CZ-56.),(CX-58.,CZ-56.)],'DRENO Ø50',2.2)
flush(PE,'V01_COTAS_E_CHAMADAS',MC,TGK)

# =====================  02 - ELEVACAO FRONTAL  =========================
def elev(reg, lateral):
    x0,z0,x1,z1,_,_ = SH['REG'][reg]
    cx=(x0+x1)/2.0
    zb=z0+(z1-9.0-z0-ZTP*ESC)/2.0
    def q(xx,zz): return (cx+xx*ESC, zb+zz*ESC)
    # costado
    dpl([q(-RO,Z2),q(RO,Z2),q(RO,Z3),q(-RO,Z3)],0.7,True)
    # cone
    dpl([q(-RO,Z2),q(-25.,Z1),q(25.,Z1),q(RO,Z2)],0.7)
    # aba L
    dpl([q(-RTP,Z3),q(RTP,Z3),q(RTP,Z4),q(-RTP,Z4)],0.5,True)
    dpl([q(-RO-5.,Z3-40.),q(-RO-5.,Z3),q(-RO,Z3),q(-RO,Z3-40.)],0.45,True)
    dpl([q(RO,Z3-40.),q(RO,Z3),q(RO+5.,Z3),q(RO+5.,Z3-40.)],0.45,True)
    # tampa abaulada
    RES=(RTP*RTP+140.0*140.0)/(2*140.0); ZC0=(ZTP-5.0)-RES
    pts=[]
    for i in range(41):
        r=-RTP+2*RTP*i/40.0
        pts.append(q(r, ZC0+math.sqrt(max(0.0,RES*RES-r*r))+5.0))
    dpl(pts,0.6)
    # respiro
    dpl([q(-20.,ZTP-10.),q(-20.,ZTP+140.),q(20.,ZTP+140.),q(20.,ZTP-10.)],0.45,True)
    # pes
    angs=(0.,120.,240.) if not lateral else (90.,210.,330.)
    for a in angs:
        ca=math.cos(math.radians(a))
        xt=RO*ca; xbm=RB*ca
        if abs(ca)<0.05: continue
        for s in (-1.,1.):
            dpl([q(xt+s*38.*(1 if ca>0 else -1), ZTOPPE), q(xbm+s*38.*(1 if ca>0 else -1), 24.)],
                0.55 if abs(ca)>0.9 else 0.35)
        dpl([q(xbm-130.*abs(ca)/ca if ca else 0., 0.), q(xbm+130.*abs(ca)/ca if ca else 0., 0.),
             q(xbm+130.*abs(ca)/ca if ca else 0., 12.), q(xbm-130.*abs(ca)/ca if ca else 0., 12.)],
            0.5,True)
    dline(cx-(RB+150.)*ESC, zb, cx+(RB+150.)*ESC, zb, 0.9)
    return cx, zb, q

cx2, zb2, q2 = elev('V02', False)
# bocais elevacao frontal
dpl([q2(-545.,2380.),q2(-760.,2380.),q2(-760.,2420.),q2(-545.,2420.)],0.5,True)
dpl([q2(-780.,2420.),q2(-780.,2560.),q2(-740.,2560.),q2(-740.,2440.)],0.5,True)
dpl([q2(-800.,2560.),q2(-800.,2595.),q2(-720.,2595.),q2(-720.,2560.)],0.5,True)
dpl([q2(496.,2360.),q2(760.,2360.),q2(760.,2400.),q2(496.,2400.)],0.5,True)
dpl([q2(800.,2320.),q2(800.,1500.),q2(840.,1500.),q2(840.,2340.)],0.5,True)
dpl([q2(780.,1500.),q2(780.,1465.),q2(860.,1465.),q2(860.,1500.)],0.5,True)
dpl([q2(-50.,575.),q2(-820.,575.),q2(-820.,625.),q2(-50.,625.)],0.5,True)
dpl([q2(-448.,540.),q2(-338.,540.),q2(-338.,660.),q2(-448.,660.)],0.55,True)
dpl([q2(-410.,660.),q2(-410.,780.),q2(-376.,780.),q2(-376.,660.)],0.45,True)
dpl([q2(-473.,780.),q2(-473.,792.),q2(-313.,792.),q2(-313.,780.)],0.5,True)
flush(PE,'V02_GEOMETRIA',ML,TGV)
dcl(cx2, zb2-4.0, cx2, zb2+(ZTP+165.)*ESC)
flush(PE,'V02_EIXO',MEX,TGV)

xL=cx2-(RB+150.)*ESC-6.0
dimv(zb2+Z3*ESC, zb2+ZTP*ESC, xL, '150', 2.3)
dimv(zb2+Z2*ESC, zb2+Z3*ESC, xL, '1300', 2.3)
dimv(zb2+Z1*ESC, zb2+Z2*ESC, xL, '600', 2.3)
dimv(zb2, zb2+600.*ESC, xL, '600', 2.3)
dimv(zb2, zb2+ZTP*ESC, xL-17.0, '2700 TOTAL', 2.3)
dimh(cx2-RO*ESC, cx2+RO*ESC, zb2-7.0, 'Ø1100', 2.3)
dimh(cx2-(RB+130.)*ESC, cx2+(RB+130.)*ESC, zb2-14.5, 'Ø2554 EXT. PE A PE', 2.3)
leader(cx2-770.*ESC, zb2+2560.*ESC, [(cx2-46.,zb2+188.),(cx2-24.,zb2+188.)],'ENTRADA Ø40',2.2)
leader(cx2+820.*ESC, zb2+1490.*ESC, [(cx2+52.,zb2+112.),(cx2+74.,zb2+112.)],'SAIDA Ø40',2.2,'r')
leader(cx2-393.*ESC, zb2+790.*ESC, [(cx2-48.,zb2+72.),(cx2-26.,zb2+72.)],'DRENO Ø50 + VALVULA',2.2)
leader(cx2+0.*ESC, zb2+(ZTP+130.)*ESC, [(cx2+30.,zb2+204.),(cx2+52.,zb2+204.)],'RESPIRO 1" BSP',2.2,'r')
flush(PE,'V02_COTAS',MC,TGK)
result={'bloco':'S2a','V01_centro':[CX,CZ],'V02_centro':[cx2,zb2],'escala':'1:15'}


# ===========================================================================
# BLOCO 10  - PRANCHA: VISTA 03 LATERAL, VISTA 04 CORTE A-A, LEGENDA
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']; VOL=session_state['VOL']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; darc=D['darc']
dcirc=D['dcirc']; drect=D['drect']; dbox=D['dbox']; ddash=D['ddash']; dcl=D['dcl']
dhatch=D['dhatch']; txt=D['txt']; tw=D['tw']; dimh=D['dimh']; dimv=D['dimv']
leader=D['leader']; arrowhead=D['arrowhead']
getmat=H['getmat']; gettag=H['gettag']; mk=H['mk']

ML=getmat(model,'Desenho_Linha',28,30,34); MC=getmat(model,'Desenho_Cota',24,84,168)
MTX=getmat(model,'Desenho_Texto',22,24,28); MEX=getmat(model,'Desenho_Eixo',196,46,46)
MCO=getmat(model,'Desenho_Corte',118,126,136); MAG=getmat(model,'Desenho_Nivel',118,186,226)
MVD=getmat(model,'Desenho_Verde',36,128,72); MLR=getmat(model,'Desenho_Laranja',208,108,32)
MAM=getmat(model,'Desenho_Amarelo',224,196,92)
TGV=gettag(model,'21_PRANCHA_VISTAS'); TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()

ESC=1.0/15.0
RO=550.; RI=545.; RTP=570.; RCAL=500.; RD=350.; RDI=200.
Z1=650.; Z2=1250.; Z3=2550.; Z4=2555.; ZTP=2700.
RB=1147.2; ZTOPPE=1400.; ZCF=2350.; ZCR=2500.; ZD0=1650.

def mkq(reg):
    x0,z0,x1,z1,_,_ = SH['REG'][reg]
    cx=(x0+x1)/2.0
    zb=z0+(z1-9.0-z0-ZTP*ESC)/2.0
    def q(xx,zz): return (cx+xx*ESC, zb+zz*ESC)
    return cx, zb, q

def casco(q, com_tampa=True):
    dpl([q(-RO,Z2),q(RO,Z2),q(RO,Z3),q(-RO,Z3)],0.7,True)
    dpl([q(-RO,Z2),q(-25.,Z1),q(25.,Z1),q(RO,Z2)],0.7)
    if com_tampa:
        dpl([q(-RTP,Z3),q(RTP,Z3),q(RTP,Z4),q(-RTP,Z4)],0.5,True)
        for s in (-1.,1.):
            dpl([q(s*(RO+5.),Z3-40.),q(s*(RO+5.),Z3),q(s*RO,Z3),q(s*RO,Z3-40.)],0.45,True)
        RES=(RTP*RTP+140.*140.)/280.; ZC0=(ZTP-5.)-RES
        pts=[q(-RTP+2*RTP*i/40., ZC0+math.sqrt(max(0.,RES*RES-(-RTP+2*RTP*i/40.)**2))+5.)
             for i in range(41)]
        dpl(pts,0.6)
        dpl([q(-20.,ZTP-10.),q(-20.,ZTP+140.),q(20.,ZTP+140.),q(20.,ZTP-10.)],0.45,True)

def pes(q, angs):
    for a in angs:
        ca=math.cos(math.radians(a))
        if abs(ca)<0.02:
            xt=0.; xbm=0.; wl=0.35
        else:
            xt=RO*ca; xbm=RB*ca; wl=0.55 if abs(ca)>0.9 else 0.4
        sgn=1.0 if ca>=0 else -1.0
        for s in (-1.,1.):
            dpl([q(xt+s*38.*sgn,ZTOPPE), q(xbm+s*38.*sgn,24.)], wl)
        dpl([q(xbm-130.,0.),q(xbm+130.,0.),q(xbm+130.,12.),q(xbm-130.,12.)],0.5,True)
    dline(q(-(RB+150.),0.)[0], q(0.,0.)[1], q((RB+150.),0.)[0], q(0.,0.)[1], 0.9)

# =====================  03 - ELEVACAO LATERAL  =========================
cx3,zb3,q3 = mkq('V03')
casco(q3); pes(q3,(90.,210.,330.))
dpl([q3(496.,2360.),q3(760.,2360.),q3(760.,2400.),q3(496.,2400.)],0.35,True)
dpl([q3(-50.,575.),q3(-330.,575.),q3(-330.,625.),q3(-50.,625.)],0.35,True)
for zz in (2160.,2514.):
    for s in (-1.,1.):
        dpl([q3(s*440.,zz),q3(s*545.,zz),q3(s*545.,zz+6.),q3(s*440.,zz+6.)],0.3,True)
flush(PE,'V03_GEOMETRIA',ML,TGV)
dcl(cx3, zb3-4., cx3, zb3+(ZTP+165.)*ESC)
flush(PE,'V03_EIXO',MEX,TGV)
xL3=cx3-(RB+150.)*ESC-6.0
dimv(zb3+Z2*ESC, zb3+Z3*ESC, xL3, '1300', 2.3)
dimv(zb3+Z1*ESC, zb3+Z2*ESC, xL3, '600', 2.3)
dimh(cx3-(RB+130.)*ESC, cx3+(RB+130.)*ESC, zb3-7.0, 'Ø2554', 2.3)
dimv(zb3, zb3+ZTOPPE*ESC, cx3+(RB+150.)*ESC+5.0, '1400 FIX. PE', 2.3, -1)
leader(cx3+993.*ESC, zb3+700.*ESC, [(cx3+60.,zb3+40.),(cx3+80.,zb3+40.)],'3 PES C=1500',2.2,'r')
leader(cx3-545.*ESC, zb3+2514.*ESC, [(cx3-52.,zb3+186.),(cx3-30.,zb3+186.)],'SUPORTES INTERNOS',2.2)
flush(PE,'V03_COTAS',MC,TGK)

# =====================  04 - CORTE VERTICAL A-A  =======================
cx4,zb4,q4 = mkq('V04')
NIV=VOL['Z_CRISTA']
dfill([q4(-RI,Z1+3.),q4(RI,Z1+3.),q4(RI,NIV),q4(-RI,NIV)],0.45)
flush(PE,'V04_LAMINA_LIQUIDA',MAG,TGV)
casco(q4); pes(q4,(0.,120.,240.))
for s in (-1.,1.):
    dpl([q4(s*RI,Z2),q4(s*RO,Z2),q4(s*RO,Z3),q4(s*RI,Z3)],0.5,True)
    dpl([q4(s*RCAL,ZCF),q4(s*RCAL,ZCR),q4(s*(RCAL-5.),ZCR),q4(s*(RCAL-5.),ZCF)],0.5,True)
    dpl([q4(s*RI,ZCF-5.),q4(s*(RCAL-5.),ZCF-5.),q4(s*(RCAL-5.),ZCF),q4(s*RI,ZCF)],0.45,True)
flush(PE,'V04_CORTE_PAREDES',ML,TGV)
for s in (-1.,1.):
    dhatch([q4(s*RI,Z2),q4(s*RO,Z2),q4(s*RO,Z3),q4(s*RI,Z3)],2.0,0.16)
flush(PE,'V04_HACHURA_CHAPA',MCO,TGV)
for s in (-1.,1.):
    dpl([q4(s*RD,ZD0),q4(s*RD,ZD0+900.),q4(s*(RD-5.),ZD0+900.),q4(s*(RD-5.),ZD0)],0.55,True)
flush(PE,'V04_DEFLETOR_D700',MVD,TGV)
for s in (-1.,1.):
    dpl([q4(s*RDI,Z2),q4(s*RD,ZD0),q4(s*(RD-5.),ZD0),q4(s*(RDI-5.),Z2)],0.55,True)
flush(PE,'V04_DEFLETOR_D400',MLR,TGV)
for s in (-1.,1.):
    dpl([q4(s*RI,ZCF-5.),q4(s*(RCAL-5.),ZCF-5.),q4(s*(RCAL-5.),ZCR),q4(s*RI,ZCR)],0.4)
flush(PE,'V04_CALHA_VERTEDORA',MAM,TGV)
dcl(cx4, zb4-4., cx4, zb4+(ZTP+165.)*ESC)
ddash(cx4-(RO+70.)*ESC, zb4+NIV*ESC, cx4+(RO+70.)*ESC, zb4+NIV*ESC, 0.4, 3.0, 1.8)
flush(PE,'V04_EIXO_E_NIVEL',MEX,TGV)
xL4=cx4-(RB+150.)*ESC-6.0
dimv(zb4+Z1*ESC, zb4+Z2*ESC, xL4, '600 CONE', 2.3)
dimv(zb4+Z2*ESC, zb4+Z3*ESC, xL4, '1300 COSTADO', 2.3)
dimv(zb4+Z2*ESC, zb4+ZD0*ESC, cx4-RDI*ESC-4.0, '400', 2.2)
dimv(zb4+ZD0*ESC, zb4+(ZD0+900.)*ESC, cx4-RD*ESC-4.0, '900', 2.2)
dimh(cx4-RI*ESC, cx4+RI*ESC, zb4+(Z1+120.)*ESC, 'Ø1090 INT.', 2.2)
leader(cx4+RCAL*ESC, zb4+ZCR*ESC, [(cx4+52.,zb4+196.),(cx4+74.,zb4+196.)],'CALHA VERTEDORA Ø1000',2.1,'r')
leader(cx4+RD*ESC, zb4+2100.*ESC, [(cx4+56.,zb4+150.),(cx4+78.,zb4+150.)],'DEFLETOR Ø700',2.1,'r')
leader(cx4+RDI*ESC, zb4+1300.*ESC, [(cx4+56.,zb4+96.),(cx4+78.,zb4+96.)],'DEFLETOR Ø400',2.1,'r')
txt('NIVEL DE OPERACAO (A CONFIRMAR)', cx4-(RO+66.)*ESC, zb4+NIV*ESC+1.4, 2.1, 'l')
flush(PE,'V04_COTAS',MC,TGK)

# =====================  LEGENDA + GUIA DE NIVEIS  ======================
x0,z0,x1,z1,_,_ = SH['REG']['LEG']
LX=x0+5.0; LZ=z1-9.0-8.0
ITENS=[('LAMINA LIQUIDA',MAG),('DEFLETOR SUP. Ø700',MVD),
       ('DEFLETOR INF. Ø400',MLR),('CALHA VERTEDORA',MAM),
       ('CHAPA SECCIONADA',MCO)]
for i,(t,mm) in enumerate(ITENS):
    dbox(LX, LZ-i*8.0-5.0, LX+9.0, LZ-i*8.0, 0.45)
    flush(PE,'LEG_COR_%d'%i, mm, TGV)
    txt(t, LX+12.0, LZ-i*8.0-4.4, 2.2, 'l')
flush(PE,'LEG_TEXTOS',MTX,TGV)

GZ0=LZ-5*8.0-14.0; GH=170.0; GW=16.0
dbox(LX+6.0, GZ0, LX+6.0+GW, GZ0+GH*VOL['H_CRISTA']/VOL['H_MAX'], 0.45)
flush(PE,'LEG_BARRA_NIVEL',MAG,TGV)
drect(LX+6.0, GZ0, LX+6.0+GW, GZ0+GH, 0.4)
txt('GUIA DE NIVEIS', LX, GZ0+GH+4.0, 2.6, 'l')
for (hh,vv) in VOL['TAB']:
    zz=GZ0+GH*hh/VOL['H_MAX']
    dline(LX+6.0+GW, zz, LX+6.0+GW+3.0, zz, 0.25)
    txt('%d' % int(hh), LX+4.0, zz-1.1, 2.0, 'r')
    txt('%d L' % int(round(vv)), LX+6.0+GW+4.5, zz-1.1, 2.0, 'l')
txt('H (mm)', LX, GZ0-6.0, 2.1,'l')
txt('VOLUME', LX+6.0+GW+4.5, GZ0-6.0, 2.1,'l')
flush(PE,'LEG_ESCALA_NIVEIS',MC,TGK)
result={'bloco':'S2b','V03':[cx3,zb3],'V04':[cx4,zb4],'nivel_crista':NIV}


# ===========================================================================
# BLOCO 11  - PRANCHA: REENQUADRAMENTO DA V02 E DA LEGENDA DE NIVEIS
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']; VOL=session_state['VOL']
del D['BUF'][:]
flush=D['flush']; dline=D['dline']; dbox=D['dbox']; drect=D['drect']; txt=D['txt']
dimh=D['dimh']; dimv=D['dimv']; leader=D['leader']
getmat=H['getmat']; gettag=H['gettag']
MC=getmat(model,'Desenho_Cota',24,84,168); MTX=getmat(model,'Desenho_Texto',22,24,28)
MAG=getmat(model,'Desenho_Nivel',118,186,226); MVD=getmat(model,'Desenho_Verde',36,128,72)
MLR=getmat(model,'Desenho_Laranja',208,108,32); MAM=getmat(model,'Desenho_Amarelo',224,196,92)
MCO=getmat(model,'Desenho_Corte',118,126,136)
TGK=gettag(model,'22_PRANCHA_COTAS'); TGV=gettag(model,'21_PRANCHA_VISTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()

ALVO=('V02_COTAS','LEG_COR_0','LEG_COR_1','LEG_COR_2','LEG_COR_3','LEG_COR_4',
      'LEG_TEXTOS','LEG_BARRA_NIVEL','LEG_ESCALA_NIVEIS')
rm=[g for g in PE.get_groups() if g.get_name() in ALVO]
PE.erase_entities(rm)

ESC=1.0/15.0; RO=550.; RB=1147.2
Z1=650.; Z2=1250.; Z3=2550.; ZTP=2700.
x0,z0,x1,z1,_,_ = SH['REG']['V02']
cx2=(x0+x1)/2.0; zb2=z0+(z1-9.0-z0-ZTP*ESC)/2.0
xL=cx2-(RB+150.)*ESC-6.0
xR=cx2+(RB+150.)*ESC+6.0
dimv(zb2+Z3*ESC, zb2+ZTP*ESC, xL, '150', 2.3)
dimv(zb2+Z2*ESC, zb2+Z3*ESC, xL, '1300', 2.3)
dimv(zb2+Z1*ESC, zb2+Z2*ESC, xL, '600', 2.3)
dimv(zb2, zb2+600.*ESC, xL, '600', 2.3)
dimv(zb2, zb2+ZTP*ESC, xR, '2700 TOTAL', 2.3, -1)
dimh(cx2-RO*ESC, cx2+RO*ESC, zb2-7.0, 'Ø1100', 2.3)
dimh(cx2-(RB+130.)*ESC, cx2+(RB+130.)*ESC, zb2-14.5, 'Ø2554 EXT. PE A PE', 2.3)
leader(cx2-770.*ESC, zb2+2560.*ESC, [(cx2-44.,zb2+188.),(cx2-24.,zb2+188.)],'ENTRADA Ø40',2.2)
leader(cx2+820.*ESC, zb2+1490.*ESC, [(cx2+50.,zb2+112.),(cx2+68.,zb2+112.)],'SAIDA Ø40',2.2,'r')
leader(cx2-393.*ESC, zb2+790.*ESC, [(cx2-46.,zb2+72.),(cx2-26.,zb2+72.)],'DRENO Ø50 + VALVULA',2.2)
leader(cx2+0.*ESC, zb2+(ZTP+130.)*ESC, [(cx2+26.,zb2+204.),(cx2+46.,zb2+204.)],'RESPIRO 1" BSP',2.2,'r')
flush(PE,'V02_COTAS',MC,TGK)

# ---- LEGENDA reenquadrada ---------------------------------------------
lx0,lz0,lx1,lz1,_,_ = SH['REG']['LEG']
LX=lx0+5.0; LZ=lz1-9.0-8.0
ITENS=[('LAMINA LIQUIDA',MAG),('DEFLETOR SUP. Ø700',MVD),
       ('DEFLETOR INF. Ø400',MLR),('CALHA VERTEDORA',MAM),('CHAPA SECCIONADA',MCO)]
for i,(t,mm) in enumerate(ITENS):
    dbox(LX, LZ-i*8.0-5.0, LX+9.0, LZ-i*8.0, 0.45)
    flush(PE,'LEG_COR_%d'%i, mm, TGV)
for i,(t,mm) in enumerate(ITENS):
    txt(t, LX+11.5, LZ-i*8.0-4.4, 2.1, 'l')
flush(PE,'LEG_TEXTOS',MTX,TGV)

GZ0=lz0+16.0; GH=(LZ-5*8.0-14.0)-GZ0; GW=14.0
dbox(LX+7.0, GZ0, LX+7.0+GW, GZ0+GH*VOL['H_CRISTA']/VOL['H_MAX'], 0.45)
flush(PE,'LEG_BARRA_NIVEL',MAG,TGV)
drect(LX+7.0, GZ0, LX+7.0+GW, GZ0+GH, 0.4)
txt('GUIA DE NIVEIS', LX, GZ0+GH+7.0, 2.5, 'l')
txt('H (mm)   /   VOLUME', LX, GZ0+GH+2.6, 2.0, 'l')
for (hh,vv) in VOL['TAB']:
    zz=GZ0+GH*hh/VOL['H_MAX']
    dline(LX+7.0+GW, zz, LX+7.0+GW+2.5, zz, 0.25)
    txt('%d' % int(hh), LX+5.0, zz-1.0, 1.9, 'r')
    txt('%d L' % int(round(vv)), LX+7.0+GW+3.5, zz-1.0, 1.9, 'l')
zc=GZ0+GH*VOL['H_CRISTA']/VOL['H_MAX']
dline(LX, zc, LX+7.0+GW+2.5, zc, 0.45)
txt('CRISTA', LX+7.0+GW+3.5, zc+1.4, 1.9, 'l')
flush(PE,'LEG_ESCALA_NIVEIS',MC,TGK)

bb={}
for g in PE.get_groups():
    b=g.get_bounding_box()
    bb[g.get_name()]=[round(b.min_point[0]*25.4,1), round(b.min_point[2]*25.4,1),
                      round(b.max_point[0]*25.4,1), round(b.max_point[2]*25.4,1)]
fora=[k for k,v in bb.items() if v[0]<0 or v[1]<0 or v[2]>1189 or v[3]>841]
result={'bloco':'S2-fix','fora_da_folha':fora,
        'V02_COTAS':bb.get('V02_COTAS'),'LEG_ESCALA_NIVEIS':bb.get('LEG_ESCALA_NIVEIS'),
        'MOLDURA':bb.get('MOLDURA_E_GRID')}


# ===========================================================================
# BLOCO 12  - PRANCHA: DETALHES A, B, C
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; dcirc=D['dcirc']
drect=D['drect']; ddash=D['ddash']; dcl=D['dcl']; dhatch=D['dhatch']; txt=D['txt']
dimh=D['dimh']; dimv=D['dimv']; balloon=D['balloon']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MC=getmat(model,'Desenho_Cota',24,84,168)
MTX=getmat(model,'Desenho_Texto',22,24,28); MB=getmat(model,'Desenho_Balao',190,60,40)
MCO=getmat(model,'Desenho_Corte',118,126,136)
TGD=gettag(model,'23_PRANCHA_DETALHES'); TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name().startswith('DET_')])

def cell(k):
    x0,z0,x1,z1,_,_ = SH['REG'][k]
    return x0+4.0, z0+4.0, x1-4.0, z1-13.0
def legenda(x0, zbase, itens, h=1.95, dz=4.6):
    z = zbase + (len(itens)-1)*dz
    for t in itens:
        txt(t, x0, z, h, 'l'); z -= dz
BAL=[]
def bal(a,b,s): BAL.append((a,b,s))

# ---------------- DETALHE A (1:3) --------------------------------------
ax0,az0,ax1,az1 = cell('DA'); K=1.0/3.0
OX=430.0; OZ=2120.0; CXA=ax0+34.0; CZA=az0+62.0
def A(a,b): return (CXA+(a-OX)*K, CZA+(b-OZ)*K)
dfill([A(545.,2120.),A(556.,2120.),A(556.,2570.),A(545.,2570.)],0.5)
flush(PE,'DET_A_COSTADO',MCO,TGD)
dhatch([A(545.,2120.),A(556.,2120.),A(556.,2570.),A(545.,2570.)],1.7,0.15)
flush(PE,'DET_A_HACHURA',ML,TGD)
dpl([A(545.,2120.),A(556.,2120.),A(556.,2570.),A(545.,2570.)],0.6,True)
dpl([A(539.,2140.),A(545.,2140.),A(545.,2534.),A(539.,2534.)],0.5,True)
for (u,v) in ((2160.,2166.),(2514.,2520.)):
    dpl([A(440.,u),A(539.,u),A(539.,v),A(440.,v)],0.5,True)
dpl([A(450.,2320.),A(539.,2320.),A(539.,2360.),A(450.,2360.)],0.5,True)
dpl([A(453.,2323.),A(539.,2323.),A(539.,2357.),A(453.,2357.)],0.3,True)
dpl([A(472.,2144.),A(488.,2144.),A(488.,2548.),A(472.,2548.)],0.5,True)
for (u,v,w) in ((2144.,2157.,25.),(2157.,2160.,17.),(2520.,2523.,17.),(2523.,2536.,25.)):
    dpl([A(480.-w,u),A(480.+w,u),A(480.+w,v),A(480.-w,v)],0.45,True)
flush(PE,'DET_A_GEOMETRIA',ML,TGD)
dimv(A(0.,2140.)[1], A(0.,2534.)[1], ax0+3.0, '394', 2.0)
dimh(A(440.,0.)[0], A(539.,0.)[0], A(0.,2102.)[1], '99', 2.0)
txt('COSTADO Ø1100  e=5', A(556.,0.)[0]-30.0, A(0.,2578.)[1], 1.9,'l')
flush(PE,'DET_A_COTAS',MC,TGK)
bal(A(545.,2450.)[0]+15.0, A(0.,2450.)[1], '1')
bal(A(490.,2166.)[0]+12.0, A(0.,2166.)[1]-8.0, '2')
bal(A(494.,2340.)[0]+22.0, A(0.,2340.)[1], '3')
bal(A(480.,2548.)[0]+15.0, A(0.,2548.)[1]+7.0, '4')
legenda(ax0, az0, ['1  CHAPA REFORCO CURVADA e=6','2  CHAPA DE APOIO e=6 (2x)',
                   '3  TRAVESSA TUBO 40x40x3','4  BARRA ROSCADA Ø16 + ARRUELA',
                   '   LISA + PORCA SEXTAVADA M16'])
flush(PE,'DET_A_LEGENDA',MTX,TGD)

# ---------------- DETALHE B (1:2) --------------------------------------
bx0,bz0,bx1,bz1 = cell('DB'); K=0.5
OX=1017.0; OZ=-140.0; CXB=bx0+22.0; CZB=bz0+32.0
def B(a,b): return (CXB+(a-OX)*K, CZB+(b-OZ)*K)
ux=597.2/1500.0; uz=-1376.0/1500.0; nx=-uz; nz=ux
dpl([B(1017.,0.),B(1277.,0.),B(1277.,12.),B(1017.,12.)],0.7,True)
dpl([B(1052.,12.),B(1242.,12.),B(1242.,190.),B(1052.,190.)],0.55,True)
dpl([B(1052.,12.),B(1052.,130.),B(1085.,130.),B(1085.,12.)],0.32,True)
dpl([B(1242.,12.),B(1242.,130.),B(1209.,130.),B(1209.,12.)],0.32,True)
for off in (-38.,38.):
    dpl([B(1147.2+nx*off, 24.+nz*off), B(1147.2+nx*off-ux*160., 24.-uz*160.+nz*off)],0.6)
dpl([B(1147.2-51.,26.),B(1147.2-38.,0.),B(1147.2+38.,0.),B(1147.2+51.,26.)],0.45)
for sx in (-1.,1.):
    dpl([B(1147.2+sx*95.-8.,-120.),B(1147.2+sx*95.+8.,-120.),
         B(1147.2+sx*95.+8.,15.),B(1147.2+sx*95.-8.,15.)],0.45,True)
    dpl([B(1147.2+sx*95.-17.,12.),B(1147.2+sx*95.+17.,12.),
         B(1147.2+sx*95.+17.,15.),B(1147.2+sx*95.-17.,15.)],0.4,True)
    dpl([B(1147.2+sx*95.-14.,15.),B(1147.2+sx*95.+14.,15.),
         B(1147.2+sx*95.+14.,28.),B(1147.2+sx*95.-14.,28.)],0.45,True)
ddash(B(1017.,0.)[0]-5.0, B(0.,0.)[1], B(1277.,0.)[0]+5.0, B(0.,0.)[1], 0.4)
flush(PE,'DET_B_GEOMETRIA',ML,TGD)
dimh(B(1017.,0.)[0], B(1277.,0.)[0], B(0.,-132.)[1], '260', 2.0)
dimv(B(0.,0.)[1], B(0.,12.)[1], bx1-3.0, '12', 2.0, -1)
dimv(B(0.,12.)[1], B(0.,190.)[1], bx0+3.0, '178', 2.0)
dimh(B(1147.2-95.,0.)[0], B(1147.2+95.,0.)[0], B(0.,208.)[1], '190 ENTRE CHUMBADORES', 2.0)
txt('TUBO Ø76 APOIA NA CHAPA  (Zmin = 7,9)', bx0, B(0.,-110.)[1], 1.9,'l')
flush(PE,'DET_B_COTAS',MC,TGK)
bal(B(1147.2,6.)[0]-32.0, B(0.,6.)[1]-1.0,'1')
bal(B(1052.,155.)[0]-9.0, B(0.,155.)[1],'2')
bal(B(1147.2,20.)[0]+30.0, B(0.,20.)[1]-9.0,'3')
bal(B(1147.2+95.,28.)[0]+13.0, B(0.,70.)[1],'4')
legenda(bx0, bz0, ['1  CHAPA DE BASE e=12  (260 x 220)','2  CHAPA LATERAL e=6 (2x, y = ±38)',
                   '3  ENRIJECEDOR e=6 (2x) + COLAR DE','   SOLDA CONICO NO PE DO TUBO',
                   '4  CHUMBADOR Ø16 + ARRUELA LISA +','   PORCA SEXTAVADA M16  (4x)'])
flush(PE,'DET_B_LEGENDA',MTX,TGD)

# ---------------- DETALHE C (1:10) -------------------------------------
cx0,cz0,cx1,cz1 = cell('DC'); K=0.1
OX=500.0; OZ=-130.0; CXC=cx0+24.0; CZC=cz0+32.0
def C(a,b): return (CXC+(a-OX)*K, CZC+(b-OZ)*K)
dpl([C(545.,1230.),C(562.,1230.),C(562.,1520.),C(545.,1520.)],0.6,True)
dhatch([C(545.,1230.),C(562.,1230.),C(562.,1520.),C(545.,1520.)],1.5,0.14)
dpl([C(550.,1330.),C(560.,1330.),C(560.,1470.),C(550.,1470.)],0.5,True)
for off in (-38.,38.):
    dpl([C(550.+nx*off,1400.+nz*off), C(1147.2+nx*off,24.+nz*off)],0.6)
for off in (-35.,35.):
    dpl([C(550.+nx*off,1400.+nz*off), C(1147.2+nx*off,24.+nz*off)],0.24)
dpl([C(1017.,0.),C(1277.,0.),C(1277.,12.),C(1017.,12.)],0.6,True)
dpl([C(1052.,12.),C(1242.,12.),C(1242.,190.),C(1052.,190.)],0.5,True)
for sx in (-1.,1.):
    dpl([C(1147.2+sx*95.-8.,-120.),C(1147.2+sx*95.+8.,-120.),
         C(1147.2+sx*95.+8.,28.),C(1147.2+sx*95.-8.,28.)],0.4,True)
dpl([C(552.,1328.),C(552.,1472.),C(566.,1472.),C(566.,1328.)],0.45,True)
ddash(C(500.,0.)[0], C(0.,0.)[1], C(1310.,0.)[0], C(0.,0.)[1],0.4)
dcl(C(550.,1400.)[0], C(0.,1400.)[1], C(1147.2,24.)[0], C(0.,24.)[1])
flush(PE,'DET_C_GEOMETRIA',ML,TGD)
dimv(C(0.,0.)[1], C(0.,1400.)[1], cx0+3.0, '1400', 2.0)
dimh(C(550.,0.)[0], C(1147.2,0.)[0], C(0.,-66.)[1], '597', 2.0)
txt('TUBO REDONDO Ø76 x 3', C(0.,0.)[0]+58.0, C(0.,900.)[1]+9.0, 1.95,'l')
txt('L = 1500   /   23,48° C/ VERTICAL', C(0.,0.)[0]+58.0, C(0.,900.)[1]+4.4, 1.95,'l')
txt('3 PES A 0° / 120° / 240°', C(0.,0.)[0]+58.0, C(0.,900.)[1]-0.2, 1.95,'l')
flush(PE,'DET_C_COTAS',MC,TGK)
bal(C(556.,1400.)[0]-10.0, C(0.,1400.)[1]+10.0,'1')
bal(C(850.,712.)[0]-10.0, C(0.,712.)[1]-7.0,'2')
bal(C(1147.2,100.)[0]+20.0, C(0.,100.)[1]+4.0,'3')
legenda(cx0, cz0, ['1  CHAPA TOPO e=10 + CHAPA DE','   REFORCO CURVADA e=10 NO COSTADO',
                   '2  TUBO REDONDO Ø76 x 3  L = 1500','3  SAPATA  -  VER DETALHE B'])
flush(PE,'DET_C_LEGENDA',MTX,TGD)
for (a,b,s) in BAL: balloon(a,b,s,3.0,2.2)
flush(PE,'DET_ABC_BALOES',MB,TGD)

RES={}
for g in PE.get_groups():
    if g.get_name().startswith('DET_'):
        bb=g.get_bounding_box()
        RES[g.get_name()]=[round(bb.min_point[0]*25.4,1), round(bb.min_point[2]*25.4,1),
                           round(bb.max_point[0]*25.4,1), round(bb.max_point[2]*25.4,1)]
bad=[k for k,v in RES.items() if v[1]<232.0 or v[3]>457.0]
result={'bloco':'S3a-fix','fora_da_faixa_de_detalhes':bad,'n':len(RES)}


# ===========================================================================
# BLOCO 13 - PRANCHA: DETALHES D, E, F + CORRECAO DA PRUMADA DA ENTRADA
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; darc=D['darc']
dcirc=D['dcirc']; drect=D['drect']; ddash=D['ddash']; dcl=D['dcl']; dhatch=D['dhatch']
txt=D['txt']; dimh=D['dimh']; dimv=D['dimv']; balloon=D['balloon']; leader=D['leader']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MC=getmat(model,'Desenho_Cota',24,84,168)
MTX=getmat(model,'Desenho_Texto',22,24,28); MB=getmat(model,'Desenho_Balao',190,60,40)
MCO=getmat(model,'Desenho_Corte',118,126,136)
TGD=gettag(model,'23_PRANCHA_DETALHES'); TGK=gettag(model,'22_PRANCHA_COTAS')
TGV=gettag(model,'21_PRANCHA_VISTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups()
                   if g.get_name() in ('DET_D_GEOMETRIA','DET_D_COTAS','DET_D_LEGENDA',
                    'DET_E_GEOMETRIA','DET_E_COTAS','DET_E_LEGENDA','DET_F_GEOMETRIA',
                    'DET_F_COTAS','DET_F_LEGENDA','DET_DEF_BALOES','V02_GEOMETRIA')])

def cell(k):
    x0,z0,x1,z1,_,_ = SH['REG'][k]
    return x0+4.0, z0+4.0, x1-4.0, z1-13.0
def legenda(x0, zbase, itens, h=1.95, dz=4.6):
    z = zbase + (len(itens)-1)*dz
    for t in itens:
        txt(t, x0, z, h, 'l'); z -= dz
BAL=[]
def bal(a,b,s): BAL.append((a,b,s))
RES=1230.36; ZC0=(2700.0-5.0)-RES

# ---------------- DETALHE D  (1:1) tampa + aba em L --------------------
dx0,dz0,dx1,dz1 = cell('DD'); K=1.0
OX=485.0; OZ=2492.0; CXD=dx0+30.0; CZD=dz0+34.0
def Fd(a,b): return (CXD+(a-OX)*K, CZD+(b-OZ)*K)
dfill([Fd(545.,2492.),Fd(550.,2492.),Fd(550.,2550.),Fd(545.,2550.)],0.5)
flush(PE,'DET_D_COSTADO',MCO,TGD)
dhatch([Fd(545.,2492.),Fd(550.,2492.),Fd(550.,2550.),Fd(545.,2550.)],1.8,0.15)
dpl([Fd(545.,2492.),Fd(550.,2492.),Fd(550.,2550.),Fd(545.,2550.)],0.6,True)
dpl([Fd(545.,2550.),Fd(570.,2550.),Fd(570.,2555.),Fd(545.,2555.)],0.6,True)
dpl([Fd(550.,2510.),Fd(555.,2510.),Fd(555.,2550.),Fd(550.,2550.)],0.6,True)
pi=[]; po=[]
for i in range(31):
    r=485.0+(570.0-485.0)*i/30.0
    zz=ZC0+math.sqrt(max(0.0,RES*RES-r*r))
    pi.append(Fd(r,zz)); po.append(Fd(r,zz+5.0))
dpl(pi,0.6); dpl(po,0.6)
dpl([pi[-1],po[-1]],0.6); dpl([pi[0],po[0]],0.3)
dfill([Fd(570.,2555.),Fd(570.,2549.),Fd(576.,2555.)],0.55)
dfill([Fd(545.,2550.),Fd(538.,2550.),Fd(545.,2557.)],0.55)
dfill([Fd(555.,2510.),Fd(555.,2503.),Fd(548.,2510.)],0.55)
flush(PE,'DET_D_GEOMETRIA',ML,TGD)
dimh(Fd(550.,0.)[0], Fd(570.,0.)[0], Fd(0.,2568.)[1], '20 SOBRA', 2.0)
dimv(Fd(0.,2510.)[1], Fd(0.,2550.)[1], dx1-3.0, '40 ABA', 2.0, -1)
dimv(Fd(0.,2550.)[1], Fd(0.,2555.)[1], dx0+16.0, '5', 1.9)
txt('Ø TAMPA = Ø TANQUE + 40 = Ø1140', dx0, Fd(0.,2612.)[1], 2.0,'l')
txt('CHAPA e=5   /   SOLDA FILETE INT. + EXT.', dx0, Fd(0.,2604.)[1], 2.0,'l')
flush(PE,'DET_D_COTAS',MC,TGK)
bal(Fd(520.,2600.)[0], Fd(0.,2600.)[1]+6.0,'1')
bal(Fd(560.,2552.)[0]+22.0, Fd(0.,2552.)[1]+2.0,'2')
bal(Fd(552.,2528.)[0]+26.0, Fd(0.,2528.)[1],'3')
bal(Fd(547.,2500.)[0]-14.0, Fd(0.,2500.)[1],'4')
legenda(dx0, dz0, ['1  TAMPA ABAULADA Ø1140 e=5','2  ABA "L" - MESA HORIZONTAL e=5',
                   '3  ABA "L" - SAIA 40 mm e=5','4  CORPO DO TANQUE Ø1100 e=5',
                   '   FLECHA DA TAMPA = 150 mm'])
flush(PE,'DET_D_LEGENDA',MTX,TGD)

# ---------------- DETALHE E  (1:2) conexao 90 flangeada ----------------
ex0,ez0,ex1,ez1 = cell('DE'); K=0.5
OX=-830.0; OZ=2360.0; CXE=ex0+16.0; CZE=ez0+34.0
def Fe(a,b): return (CXE+(a-OX)*K, CZE+(b-OZ)*K)
dfill([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],0.5)
flush(PE,'DET_E_COSTADO',MCO,TGD)
dhatch([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],1.8,0.15)
dpl([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],0.6,True)
for zz in (2380.,2420.):
    dpl([Fe(-545.,zz),Fe(-760.,zz)],0.6)
for zz in (2383.,2417.):
    dpl([Fe(-545.,zz),Fe(-760.,zz)],0.25)
OE=Fe(-760.,2460.)
for (rr,ww) in ((80.,0.6),(40.,0.6),(77.,0.25),(43.,0.25)):
    darc(OE[0],OE[1],rr*K,270.,180.,ww,28)
darc(OE[0],OE[1],60.*K,270.,180.,0.22,20)
for xx in (-840.,-800.):
    dpl([Fe(xx,2460.),Fe(xx,2560.)],0.6)
for xx in (-837.,-803.):
    dpl([Fe(xx,2460.),Fe(xx,2560.)],0.25)
for (z0f,z1f) in ((2560.,2577.5),(2577.5,2595.)):
    dpl([Fe(-820.-63.5,z0f),Fe(-820.+63.5,z0f),Fe(-820.+63.5,z1f),Fe(-820.-63.5,z1f)],0.6,True)
for s in (-1.,1.):
    xb=-820.+s*49.2
    dpl([Fe(xb-8.,2546.),Fe(xb+8.,2546.),Fe(xb+8.,2609.),Fe(xb-8.,2609.)],0.45,True)
    dpl([Fe(xb-13.,2546.),Fe(xb+13.,2546.),Fe(xb+13.,2559.),Fe(xb-13.,2559.)],0.4,True)
    dpl([Fe(xb-13.,2595.),Fe(xb+13.,2595.),Fe(xb+13.,2608.),Fe(xb-13.,2608.)],0.4,True)
dcl(Fe(-545.,2400.)[0],Fe(0.,2400.)[1],Fe(-760.,2400.)[0],Fe(0.,2400.)[1])
dcl(Fe(-820.,2440.)[0],Fe(0.,2440.)[1],Fe(-820.,2600.)[0],Fe(0.,2600.)[1])
flush(PE,'DET_E_GEOMETRIA',ML,TGD)
dline(OE[0],OE[1],Fe(-820.,2460.)[0],Fe(-820.,2460.)[1],0.22,0.85)
txt('R60', OE[0]-11.0, OE[1]+1.6, 2.0,'l')
dimv(Fe(0.,2560.)[1], Fe(0.,2595.)[1], ex1-3.0, '2x17,5', 1.9, -1)
dimh(Fe(-820.-63.5,0.)[0], Fe(-820.+63.5,0.)[0], Fe(0.,2622.)[1], 'Ø127', 2.0)
txt('TUBO Ø40 x 3', ex0+2.0, Fe(0.,2352.)[1], 2.0,'l')
txt('CURVA 90° POR ARCO TOROIDAL REAL', ex0+2.0, Fe(0.,2340.)[1], 2.0,'l')
flush(PE,'DET_E_COTAS',MC,TGK)
bal(Fe(-650.,2400.)[0], Fe(0.,2400.)[1]-13.0,'1')
bal(OE[0]+13.0, OE[1]-13.0,'2')
bal(Fe(-820.,2578.)[0]+40.0, Fe(0.,2578.)[1],'3')
bal(Fe(-820.-49.2,2609.)[0]-12.0, Fe(0.,2609.)[1],'4')
legenda(ex0, ez0, ['1  TUBO Ø40 x 3 (BOCAL)','2  CURVA 90° RAIO LONGO R60',
                   '3  PAR DE FLANGES ANSI B16.5','   CL.150 DN40 - Ø127 x 17,5',
                   '4  4 x PARAFUSO Ø16 + PORCA','   FURACAO BC 98,4'])
flush(PE,'DET_E_LEGENDA',MTX,TGD)

# ---------------- DETALHE F  (1:5) dreno + valvula ---------------------
fx0,fz0,fx1,fz1 = cell('DF'); K=0.2
OX=-700.0; OZ=500.0; CXF=fx0+12.0; CZF=fz0+40.0
def Ff(a,b): return (CXF+(a-OX)*K, CZF+(b-OZ)*K)
dpl([Ff(-25.,760.),Ff(-25.,650.)],0.6); dpl([Ff(25.,760.),Ff(25.,650.)],0.6)
dpl([Ff(-22.,760.),Ff(-22.,650.)],0.25); dpl([Ff(22.,760.),Ff(22.,650.)],0.25)
OF=Ff(-50.,650.)
for (rr,ww) in ((75.,0.6),(25.,0.6),(72.,0.25),(28.,0.25)):
    darc(OF[0],OF[1],rr*K,0.,-90.,ww,24)
darc(OF[0],OF[1],50.*K,0.,-90.,0.22,18)
for zz in (575.,625.):
    dpl([Ff(-50.,zz),Ff(-300.,zz)],0.6)
for zz in (578.,622.):
    dpl([Ff(-50.,zz),Ff(-300.,zz)],0.25)
for (a0,a1) in ((-300.,-319.1),(-319.1,-338.2),(-448.2,-467.3),(-467.3,-486.4)):
    dpl([Ff(a0,600.-76.2),Ff(a1,600.-76.2),Ff(a1,600.+76.2),Ff(a0,600.+76.2)],0.55,True)
dpl([Ff(-338.2,554.),Ff(-393.,542.),Ff(-448.2,554.),Ff(-448.2,646.),Ff(-393.,658.),
     Ff(-338.2,646.)],0.6,True)
dpl([Ff(-419.,658.),Ff(-419.,720.),Ff(-367.,720.),Ff(-367.,658.)],0.5,True)
dpl([Ff(-402.,720.),Ff(-402.,780.),Ff(-384.,780.),Ff(-384.,720.)],0.45,True)
dpl([Ff(-473.,780.),Ff(-473.,792.),Ff(-313.,792.),Ff(-313.,780.)],0.55,True)
for zz in (575.,625.):
    dpl([Ff(-486.4,zz),Ff(-700.,zz)],0.6)
dcl(Ff(-700.,600.)[0],Ff(0.,600.)[1],Ff(-40.,600.)[0],Ff(0.,600.)[1])
dcl(Ff(0.,760.)[0],Ff(0.,760.)[1],Ff(0.,640.)[0],Ff(0.,640.)[1])
flush(PE,'DET_F_GEOMETRIA',ML,TGD)
dline(OF[0],OF[1],Ff(-50.,600.)[0],Ff(-50.,600.)[1],0.22,0.85)
txt('R50', OF[0]-11.0, OF[1]-6.0, 2.0,'l')
dimv(Ff(0.,600.)[1], Ff(0.,650.)[1], fx1-3.0, '50', 1.9, -1)
txt('EIXO DO DRENO  Z = 600', fx0+2.0, Ff(0.,520.)[1], 2.0,'l')
txt('BOCA DO CONE  Z = 650  ->  R50 IMPOSTO', fx0+2.0, Ff(0.,508.)[1], 2.0,'l')
flush(PE,'DET_F_COTAS',MC,TGK)
bal(Ff(0.,720.)[0]+13.0, Ff(0.,720.)[1],'1')
bal(OF[0]-6.0, OF[1]+16.0,'2')
bal(Ff(-319.,600.)[0], Ff(0.,600.)[1]-24.0,'3')
bal(Ff(-393.,760.)[0]-22.0, Ff(0.,760.)[1]+2.0,'4')
legenda(fx0, fz0, ['1  BOCA DO CONE Ø50','2  CURVA 90° R50 (ARCO REAL)',
                   '3  FLANGES ANSI B16.5 CL.150 DN50','   Ø152,4 x 19,1  -  4 x Ø19',
                   '4  VALVULA GAVETA Ø50 + VOLANTE'])
flush(PE,'DET_F_LEGENDA',MTX,TGD)
for (a,b,s) in BAL: balloon(a,b,s,3.0,2.2)
flush(PE,'DET_DEF_BALOES',MB,TGD)

# ---------------- correcao: prumada da entrada na V02 ------------------
ESC=1.0/15.0; RO=550.; RI=545.; RTP=570.; RB=1147.2
Z1=650.; Z2=1250.; Z3=2550.; Z4=2555.; ZTP=2700.; ZTOPPE=1400.
x0,z0,x1,z1,_,_ = SH['REG']['V02']
cx2=(x0+x1)/2.0; zb2=z0+(z1-9.0-z0-ZTP*ESC)/2.0
def q2(a,b): return (cx2+a*ESC, zb2+b*ESC)
dpl([q2(-RO,Z2),q2(RO,Z2),q2(RO,Z3),q2(-RO,Z3)],0.7,True)
dpl([q2(-RO,Z2),q2(-25.,Z1),q2(25.,Z1),q2(RO,Z2)],0.7)
dpl([q2(-RTP,Z3),q2(RTP,Z3),q2(RTP,Z4),q2(-RTP,Z4)],0.5,True)
for s in (-1.,1.):
    dpl([q2(s*(RO+5.),Z3-40.),q2(s*(RO+5.),Z3),q2(s*RO,Z3),q2(s*RO,Z3-40.)],0.45,True)
pts=[q2(-RTP+2*RTP*i/40., ZC0+math.sqrt(max(0.,RES*RES-(-RTP+2*RTP*i/40.)**2))+5.) for i in range(41)]
dpl(pts,0.6)
dpl([q2(-20.,ZTP-10.),q2(-20.,ZTP+140.),q2(20.,ZTP+140.),q2(20.,ZTP-10.)],0.45,True)
for a in (0.,120.,240.):
    ca=math.cos(math.radians(a)); sgn=1.0 if ca>=0 else -1.0
    for s in (-1.,1.):
        dpl([q2(RO*ca+s*38.*sgn,ZTOPPE), q2(RB*ca+s*38.*sgn,24.)], 0.55 if abs(ca)>0.9 else 0.4)
    dpl([q2(RB*ca-130.,0.),q2(RB*ca+130.,0.),q2(RB*ca+130.,12.),q2(RB*ca-130.,12.)],0.5,True)
dline(q2(-(RB+150.),0.)[0], q2(0.,0.)[1], q2((RB+150.),0.)[0], q2(0.,0.)[1], 0.9)
dpl([q2(-545.,2380.),q2(-760.,2380.),q2(-760.,2420.),q2(-545.,2420.)],0.5,True)
dpl([q2(-840.,2460.),q2(-840.,2560.),q2(-800.,2560.),q2(-800.,2460.)],0.5,True)
darc(q2(-760.,2460.)[0],q2(-760.,2460.)[1],80.*ESC,270.,180.,0.5,20)
darc(q2(-760.,2460.)[0],q2(-760.,2460.)[1],40.*ESC,270.,180.,0.5,20)
dpl([q2(-884.,2560.),q2(-884.,2595.),q2(-756.,2595.),q2(-756.,2560.)],0.5,True)
dpl([q2(496.,2360.),q2(760.,2360.),q2(760.,2400.),q2(496.,2400.)],0.5,True)
dpl([q2(800.,2320.),q2(800.,1500.),q2(840.,1500.),q2(840.,2320.)],0.5,True)
darc(q2(760.,2320.)[0],q2(760.,2320.)[1],80.*ESC,90.,0.,0.5,20)
darc(q2(760.,2320.)[0],q2(760.,2320.)[1],40.*ESC,90.,0.,0.5,20)
dpl([q2(744.,1500.),q2(744.,1465.),q2(896.,1465.),q2(896.,1500.)],0.5,True)
dpl([q2(-50.,575.),q2(-820.,575.),q2(-820.,625.),q2(-50.,625.)],0.5,True)
darc(q2(-50.,650.)[0],q2(-50.,650.)[1],75.*ESC,0.,-90.,0.5,18)
darc(q2(-50.,650.)[0],q2(-50.,650.)[1],25.*ESC,0.,-90.,0.5,18)
dpl([q2(-448.,542.),q2(-338.,542.),q2(-338.,658.),q2(-448.,658.)],0.55,True)
dpl([q2(-419.,658.),q2(-419.,780.),q2(-367.,780.),q2(-367.,658.)],0.45,True)
dpl([q2(-473.,780.),q2(-473.,792.),q2(-313.,792.),q2(-313.,780.)],0.5,True)
flush(PE,'V02_GEOMETRIA',ML,TGV)

OUT={}
for g in PE.get_groups():
    if g.get_name().startswith('DET_'):
        bb=g.get_bounding_box()
        OUT[g.get_name()]=[round(bb.min_point[0]*25.4,1), round(bb.min_point[2]*25.4,1),
                           round(bb.max_point[0]*25.4,1), round(bb.max_point[2]*25.4,1)]
bad=[]
LIM={'A':(20.,211.5),'B':(211.5,403.),'C':(403.,594.5),
     'D':(594.5,786.),'E':(786.,977.5),'F':(977.5,1169.)}
for k,v in OUT.items():
    ltr=k.split('_')[1]
    if ltr in LIM:
        lo,hi=LIM[ltr]
        if v[0]<lo or v[2]>hi or v[1]<232.0 or v[3]>457.0:
            bad.append((k,v))
result={'bloco':'S3b','violacoes':bad,'n_detalhes':len(OUT)}


# ===========================================================================
# BLOCO 14 - PRANCHA: REENQUADRAMENTO DO DETALHE E E DAS COTAS DO DETALHE C
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
dfill=D['dfill']; flush=D['flush']; dline=D['dline']; dpl=D['dpl']; darc=D['darc']
dcl=D['dcl']; dhatch=D['dhatch']; txt=D['txt']; dimh=D['dimh']; dimv=D['dimv']
balloon=D['balloon']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MC=getmat(model,'Desenho_Cota',24,84,168)
MTX=getmat(model,'Desenho_Texto',22,24,28); MB=getmat(model,'Desenho_Balao',190,60,40)
MCO=getmat(model,'Desenho_Corte',118,126,136)
TGD=gettag(model,'23_PRANCHA_DETALHES'); TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name() in
    ('DET_E_COSTADO','DET_E_GEOMETRIA','DET_E_COTAS','DET_E_LEGENDA','DET_C_COTAS')])

def cell(k):
    x0,z0,x1,z1,_,_ = SH['REG'][k]
    return x0+4.0, z0+4.0, x1-4.0, z1-13.0
def legenda(x0, zbase, itens, h=1.95, dz=4.6):
    z = zbase + (len(itens)-1)*dz
    for t in itens:
        txt(t, x0, z, h, 'l'); z -= dz

# ---- DET C : cotas reposicionadas -------------------------------------
cx0,cz0,cx1,cz1 = cell('DC'); K=0.1
OX=500.0; OZ=-130.0; CXC=cx0+24.0; CZC=cz0+32.0
def C(a,b): return (CXC+(a-OX)*K, CZC+(b-OZ)*K)
dimv(C(0.,0.)[1], C(0.,1400.)[1], cx0+9.0, '1400', 2.0)
dimh(C(550.,0.)[0], C(1147.2,0.)[0], C(0.,-66.)[1], '597', 2.0)
txt('TUBO REDONDO Ø76 x 3', C(0.,0.)[0]+58.0, C(0.,900.)[1]+9.0, 1.95,'l')
txt('L = 1500   /   23,48° C/ VERTICAL', C(0.,0.)[0]+58.0, C(0.,900.)[1]+4.4, 1.95,'l')
txt('3 PES A 0° / 120° / 240°', C(0.,0.)[0]+58.0, C(0.,900.)[1]-0.2, 1.95,'l')
flush(PE,'DET_C_COTAS',MC,TGK)

# ---- DET E : reenquadrado ---------------------------------------------
ex0,ez0,ex1,ez1 = cell('DE'); K=0.5
OX=-890.0; OZ=2360.0; CXE=ex0+3.0; CZE=ez0+34.0
def Fe(a,b): return (CXE+(a-OX)*K, CZE+(b-OZ)*K)
dfill([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],0.5)
flush(PE,'DET_E_COSTADO',MCO,TGD)
dhatch([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],1.8,0.15)
dpl([Fe(-550.,2360.),Fe(-545.,2360.),Fe(-545.,2600.),Fe(-550.,2600.)],0.6,True)
for zz in (2380.,2420.):
    dpl([Fe(-545.,zz),Fe(-760.,zz)],0.6)
for zz in (2383.,2417.):
    dpl([Fe(-545.,zz),Fe(-760.,zz)],0.25)
OE=Fe(-760.,2460.)
for (rr,ww) in ((80.,0.6),(40.,0.6),(77.,0.25),(43.,0.25)):
    darc(OE[0],OE[1],rr*K,270.,180.,ww,28)
darc(OE[0],OE[1],60.*K,270.,180.,0.22,20)
for xx in (-840.,-800.):
    dpl([Fe(xx,2460.),Fe(xx,2560.)],0.6)
for xx in (-837.,-803.):
    dpl([Fe(xx,2460.),Fe(xx,2560.)],0.25)
for (a,b) in ((2560.,2577.5),(2577.5,2595.)):
    dpl([Fe(-820.-63.5,a),Fe(-820.+63.5,a),Fe(-820.+63.5,b),Fe(-820.-63.5,b)],0.6,True)
for s in (-1.,1.):
    xb=-820.+s*49.2
    dpl([Fe(xb-8.,2546.),Fe(xb+8.,2546.),Fe(xb+8.,2609.),Fe(xb-8.,2609.)],0.45,True)
    dpl([Fe(xb-13.,2546.),Fe(xb+13.,2546.),Fe(xb+13.,2559.),Fe(xb-13.,2559.)],0.4,True)
    dpl([Fe(xb-13.,2595.),Fe(xb+13.,2595.),Fe(xb+13.,2608.),Fe(xb-13.,2608.)],0.4,True)
dcl(Fe(-545.,2400.)[0],Fe(0.,2400.)[1],Fe(-770.,2400.)[0],Fe(0.,2400.)[1])
dcl(Fe(-820.,2445.)[0],Fe(0.,2445.)[1],Fe(-820.,2600.)[0],Fe(0.,2600.)[1])
flush(PE,'DET_E_GEOMETRIA',ML,TGD)
dline(OE[0],OE[1],Fe(-820.,2460.)[0],Fe(-820.,2460.)[1],0.22,0.85)
txt('R60', OE[0]-12.5, OE[1]+1.8, 2.0,'l')
dimv(Fe(0.,2560.)[1], Fe(0.,2595.)[1], ex1-3.0, '2 x 17,5', 1.9, -1)
dimh(Fe(-820.-63.5,0.)[0], Fe(-820.+63.5,0.)[0], Fe(0.,2624.)[1], 'Ø127', 2.0)
txt('TUBO Ø40 x 3  -  BOCAL Ø40', ex0, Fe(0.,2352.)[1], 2.0,'l')
txt('CURVA 90° POR ARCO TOROIDAL REAL', ex0, Fe(0.,2340.)[1], 2.0,'l')
flush(PE,'DET_E_COTAS',MC,TGK)
legenda(ex0, ez0, ['1  TUBO Ø40 x 3 (BOCAL)','2  CURVA 90° RAIO LONGO R60',
                   '3  PAR DE FLANGES ANSI B16.5','   CL.150 DN40  Ø127 x 17,5',
                   '4  4 x PARAFUSO Ø16 + PORCA','   FURACAO BC 98,4'])
flush(PE,'DET_E_LEGENDA',MTX,TGD)
for (a,b,s) in ((Fe(-650.,2400.)[0], Fe(0.,2400.)[1]-13.0,'1'),
                (OE[0]+13.0, OE[1]-13.0,'2'),
                (Fe(-820.,2578.)[0]+42.0, Fe(0.,2578.)[1],'3'),
                (Fe(-820.-49.2,2612.)[0]-9.0, Fe(0.,2612.)[1],'4')):
    balloon(a,b,s,3.0,2.2)
flush(PE,'DET_E_BALOES',MB,TGD)

LIM={'A':(20.,211.5),'B':(211.5,403.),'C':(403.,594.5),
     'D':(594.5,786.),'E':(786.,977.5),'F':(977.5,1169.)}
bad=[]
for g in PE.get_groups():
    n=g.get_name()
    if n.startswith('DET_') and len(n.split('_'))>1 and n.split('_')[1] in LIM and 'BALOES' not in n:
        bb=g.get_bounding_box()
        v=[round(bb.min_point[0]*25.4,1), round(bb.min_point[2]*25.4,1),
           round(bb.max_point[0]*25.4,1), round(bb.max_point[2]*25.4,1)]
        lo,hi=LIM[n.split('_')[1]]
        if v[0]<lo or v[2]>hi or v[1]<232.0 or v[3]>457.0:
            bad.append((n,v))
result={'bloco':'S3-fix','violacoes':bad}


# ===========================================================================
# BLOCO 15 - PRANCHA: TABELAS, VOLUMES, NOTAS, CARIMBO
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']; VOL=session_state['VOL']
del D['BUF'][:]
flush=D['flush']; dline=D['dline']; dpl=D['dpl']; drect=D['drect']; dbox=D['dbox']
txt=D['txt']; tw=D['tw']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MTX=getmat(model,'Desenho_Texto',22,24,28)
MTI=getmat(model,'Desenho_Titulo',222,228,236); MC=getmat(model,'Desenho_Cota',24,84,168)
MVD=getmat(model,'Desenho_Verde',36,128,72)
TGT=gettag(model,'24_PRANCHA_TABELAS'); TGC=gettag(model,'25_PRANCHA_CARIMBO')
TGM=gettag(model,'20_PRANCHA_MOLDURA')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name().startswith('TAB_')
                   or g.get_name().startswith('CARIMBO') or g.get_name()=='TITULOS_DAS_REGIOES'])

def L(v): return v/1000000.0
def M3(v): return v/1000000000.0
def fm(v, nd=2):
    s = ('%.'+str(nd)+'f') % v
    a,b = (s.split('.')+[''])[:2]
    neg = a.startswith('-'); a = a.lstrip('-')
    out=''
    while len(a) > 3:
        out = '.'+a[-3:]+out; a = a[:-3]
    out = a+out
    return ('-' if neg else '')+out+(','+b if b else '')

def tabela(x0, ztop, colw, cab, linhas, rh=9.0, hcab=9.0, h=2.05, hh=2.05):
    W=sum(colw)
    dbox(x0, ztop-hcab, x0+W, ztop, 0.35)
    flush(PE,'TAB_CAB_%d_%d'%(int(x0),int(ztop)), MTI, TGT)
    z=ztop
    dline(x0, z, x0+W, z, 0.4)
    z-=hcab
    dline(x0, z, x0+W, z, 0.4)
    for r in linhas:
        z-=rh
        dline(x0, z, x0+W, z, 0.18)
    dline(x0, ztop, x0, z, 0.4); dline(x0+W, ztop, x0+W, z, 0.4)
    xx=x0
    for c in colw[:-1]:
        xx+=c; dline(xx, ztop, xx, z, 0.25)
    flush(PE,'TAB_GRID_%d_%d'%(int(x0),int(ztop)), ML, TGT)
    xx=x0
    for i,c in enumerate(colw):
        txt(cab[i], xx+2.0, ztop-hcab+2.6, hh, 'l'); xx+=c
    zz=ztop-hcab
    for r in linhas:
        zz-=rh; xx=x0
        for i,c in enumerate(colw):
            if i < len(r):
                al = 'r' if (i==len(colw)-1 and len(colw)>2) else 'l'
                if al=='r': txt(r[i], xx+c-2.0, zz+2.6, h, 'r')
                else:       txt(r[i], xx+2.0, zz+2.6, h, 'l')
        xx+=c
    flush(PE,'TAB_TXT_%d_%d'%(int(x0),int(ztop)), MTX, TGT)
    return z

# ================= T1 - TABELA DE DIMENSOES PRINCIPAIS =================
x0,z0,x1,z1,_,_ = SH['REG']['T1']
DIMS=[('1','DIAMETRO EXTERNO DO TANQUE','Ø1100'),
      ('2','DIAMETRO INTERNO DO TANQUE','Ø1090'),
      ('3','ALTURA DO COSTADO','1300'),
      ('4','ALTURA DO CONE','600'),
      ('5','DIAMETRO INFERIOR DO CONE','Ø50'),
      ('6','DIAMETRO DA TAMPA','Ø1140'),
      ('7','FLECHA DA TAMPA','150'),
      ('8','ALTURA DA ABA EM "L"','40'),
      ('9','DEFLETOR SUPERIOR (Ø / h)','Ø700 / 900'),
      ('10','DEFLETOR INFERIOR (Ø / h)','Ø400 / 400'),
      ('11','CALHA VERTEDORA','Ø1000'),
      ('12','ENTRADA','Ø40'),
      ('13','SAIDA / CALHA','Ø40'),
      ('14','DRENO','Ø50'),
      ('15','PES - TUBO REDONDO','Ø76 x 3'),
      ('16','COMPRIMENTO DOS PES','1500'),
      ('17','Ø EXTERNO PE A PE (DERIVADO)','2554'),
      ('18','ESPESSURA DAS CHAPAS','5'),
      ('19','ALTURA TOTAL','2700')]
zf=tabela(x0+3.0, z1-13.0, [13.0,146.0,60.0], ['IT','DESCRICAO','DIMENSAO (mm)'], DIMS, 8.6, 8.6)
txt('COTAS CONFORME AUDITORIA DO PDF - ANOTACOES', x0+3.0, zf-6.0, 1.9,'l')
txt('MANUSCRITAS PREVALECEM SOBRE AS IMPRESSAS.', x0+3.0, zf-10.4, 1.9,'l')
flush(PE,'TAB_T1_NOTA',MTX,TGT)

# ================= T2 - LISTA DE COMPONENTES ===========================
x0,z0,x1,z1,_,_ = SH['REG']['T2']
COMP=[('01','1','CORPO CILINDRICO Ø1100','CHAPA CARBONO e=5'),
      ('02','1','FUNDO CONICO H=600','CHAPA CARBONO e=5'),
      ('03','1','TAMPA Ø1140 ABAULADA','CHAPA CARBONO e=5'),
      ('04','1','ABA DE FECHAMENTO EM "L"','CHAPA CARBONO e=5'),
      ('05','1','DEFLETOR SUPERIOR Ø700','CHAPA CARBONO e=5'),
      ('06','1','DEFLETOR INFERIOR Ø400','CHAPA CARBONO e=5'),
      ('07','1','CALHA VERTEDORA Ø1000','CHAPA CARBONO e=5'),
      ('08','1','ENTRADA Ø40 + CURVA 90° R60','TUBO ACO CARBONO'),
      ('09','1','SAIDA Ø40 + CURVA 90° R60','TUBO ACO CARBONO'),
      ('10','1','DRENO Ø50 + CURVA 90° R50','TUBO ACO CARBONO'),
      ('11','1','VALVULA GAVETA Ø50','ACO / FERRO FUNDIDO'),
      ('12','3','PE INCLINADO Ø76 x 3','TUBO ACO CARBONO'),
      ('13','4','SUPORTE INTERNO LATERAL','CHAPA / TUBO 40x40'),
      ('14','6','FLANGE ANSI B16.5 CL.150','ACO CARBONO'),
      ('15','1','RESPIRO CENTRAL 1" BSP','TUBO ACO CARBONO'),
      ('16','-','PARAFUSOS / PORCAS / ARRUELAS','ACO CARBONO')]
zf=tabela(x0+3.0, z1-13.0, [13.0,15.0,104.0,72.0], ['IT','QT','COMPONENTE','MATERIAL'],
          COMP, 8.6, 8.6)
txt('SOLDAS DE FILETE CONTINUAS, SALVO INDICACAO', x0+3.0, zf-6.0, 1.9,'l')
txt('CONTRARIA.  FLANGES CONFORME ANSI B16.5.', x0+3.0, zf-10.4, 1.9,'l')
flush(PE,'TAB_T2_NOTA',MTX,TGT)

# ================= T3 - CALCULO DE VOLUMES =============================
x0,z0,x1,z1,_,_ = SH['REG']['T3']
CA=x0+4.0; CB=x0+118.0; CC=x0+232.0
ZT=z1-16.0
def bloco(cx, titulo, linhas, larg=110.0):
    dbox(cx, ZT-7.0, cx+larg, ZT, 0.35)
    flush(PE,'TAB_T3_H_%d'%int(cx), MTI, TGT)
    drect(cx, ZT-7.0-len(linhas)*5.2-3.0, cx+larg, ZT, 0.3)
    flush(PE,'TAB_T3_B_%d'%int(cx), ML, TGT)
    txt(titulo, cx+2.5, ZT-5.4, 2.1,'l')
    z=ZT-12.0
    for t in linhas:
        txt(t, cx+2.5, z, 1.95,'l'); z-=5.2
    flush(PE,'TAB_T3_T_%d'%int(cx), MTX, TGT)
bloco(CA,'DADOS UTILIZADOS (INTERNOS)',
 ['Ø EXTERNO = 1100    e = 5','Ø INTERNO  D = 1100 - 2x5 = 1090','RAIO  R = D/2 = 545',
  'ALTURA CILINDRICA  h = %s' % fm(VOL['H_CIL_INT'],2),
  'ALTURA DO CONE  h = 600','RAIO MAIOR  R = %s' % fm(VOL['R_CT'],2),
  'RAIO MENOR   r = %s' % fm(VOL['R_CB'],2),
  '1.000.000 mm³ = 1 LITRO','1.000.000.000 mm³ = 1 m³'])
bloco(CB,'1 - VOLUME DO CILINDRO',
 ['V = P x R² x h','V = 3,141593 x 545² x %s' % fm(VOL['H_CIL_INT'],2),
  'V = %s mm³' % fm(VOL['V_CIL'],0),'',
  'V = %s m³' % fm(M3(VOL['V_CIL']),4),
  'V = %s LITROS' % fm(L(VOL['V_CIL']),2),'','','' ])
bloco(CC,'2 - VOLUME DO TRONCO DE CONE',
 ['V = P x h/3 x (R² + R.r + r²)','h = 600   R = %s   r = %s' % (fm(VOL['R_CT'],2), fm(VOL['R_CB'],2)),
  'V = %s mm³' % fm(VOL['V_CONE'],0),'',
  'V = %s m³' % fm(M3(VOL['V_CONE']),4),
  'V = %s LITROS' % fm(L(VOL['V_CONE']),2),
  'DIAMETRO INFERIOR > 0  ->  NAO','E CONE SIMPLES: TRONCO DE CONE.',''])
ZB=ZT-7.0-9*5.2-3.0-6.0
dbox(x0+4.0, ZB-30.0, x1-4.0, ZB-22.0, 0.35)
flush(PE,'TAB_T3_TOT_H',MVD,TGT)
drect(x0+4.0, ZB-56.0, x1-4.0, ZB-22.0, 0.4)
flush(PE,'TAB_T3_TOT_B',ML,TGT)
txt('3 - VOLUME BRUTO TOTAL   E   VALIDACAO GEOMETRICA (SECAO 46)', x0+7.0, ZB-28.4, 2.15,'l')
txt('V TOTAL = V CILINDRO + V CONE = %s mm³' % fm(VOL['V_BRUTO'],0), x0+7.0, ZB-33.6, 2.0,'l')
txt('V TOTAL = %s m³   =   %s LITROS' % (fm(M3(VOL['V_BRUTO']),4), fm(L(VOL['V_BRUTO']),2)),
    x0+7.0, ZB-38.8, 2.3,'l')
txt('VOLUME DERIVADO DA GEOMETRIA 3D (compute_volume) = %s L' % fm(L(VOL['V_GEO']),2),
    x0+7.0, ZB-44.6, 2.0,'l')
txt('DIVERGENCIA = %s %%  ->  DENTRO DO ESPERADO (POLIGONO DE 96 LADOS' % fm(VOL['DIF'],3),
    x0+7.0, ZB-49.4, 1.95,'l')
txt('APROXIMA O CIRCULO POR FALTA EM 0,071 %). SEM INCONSISTENCIA.', x0+7.0, ZB-54.2, 1.95,'l')
flush(PE,'TAB_T3_TOTAL',MTX,TGT)

# ================= T4 - VOLUME POR REGIAO E POR NIVEL ==================
x0,z0,x1,z1,_,_ = SH['REG']['T4']
REG4=[('CORPO CILINDRICO', fm(L(VOL['V_CIL']),2)),
      ('FUNDO CONICO', fm(L(VOL['V_CONE']),2)),
      ('ACO DOS INTERNOS (-)', fm(L(VOL['V_ACO']),2)),
      ('TOTAL BRUTO', fm(L(VOL['V_BRUTO']),2))]
zf=tabela(x0+3.0, z1-13.0, [92.0,58.0], ['REGIAO','VOLUME (L)'], REG4, 8.6, 8.6)
NIV=[(fm(a,0), fm(b,1)) for (a,b) in VOL['TAB']]
zf2=tabela(x0+3.0, zf-6.0, [92.0,58.0], ['ALTURA DE LIQUIDO (mm)','VOLUME (L)'], NIV, 8.0, 8.0)
txt('NIVEL OPERACIONAL NAO COTADO NO PDF.', x0+3.0, zf2-5.6, 1.85,'l')
txt('CRISTA DA CALHA h=%s -> V UTIL %s L' % (fm(VOL['H_CRISTA'],0), fm(L(VOL['V_UTIL']),1)),
    x0+3.0, zf2-9.8, 1.85,'l')
txt('V LIVRE = %s L    (A CONFIRMAR)' % fm(L(VOL['V_LIVRE']),1), x0+3.0, zf2-14.0, 1.85,'l')
flush(PE,'TAB_T4_NOTA',MTX,TGT)

# ================= T5 - NOTAS TECNICAS =================================
x0,z0,x1,z1,_,_ = SH['REG']['T5']
NOTAS=['1. TODAS AS DIMENSOES EM MILIMETROS, SALVO INDICACAO CONTRARIA.',
 '2. AS MEDIDAS MANUSCRITAS DO PROJETO PREVALECEM SOBRE AS COTAS',
 '    IMPRESSAS QUANDO IDENTIFICADAS COMO CORRECOES.',
 '3. DIMENSOES NAO CONFIRMADAS ESTAO MARCADAS "A CONFIRMAR".',
 '4. VOLUMES CALCULADOS COM DIMENSOES INTERNAS: Ø INT = Ø EXT - 2 x e.',
 '5. MODELO 3D PARAMETRICO 1:1 - ALTERAR PARAM ATUALIZA A GEOMETRIA',
 '    E RECALCULA AUTOMATICAMENTE TODOS OS VOLUMES.',
 '6. CURVAS DE 90° POR ARCO TOROIDAL REAL - NUNCA MITRADAS.',
 '7. FLANGES CONFORME ANSI B16.5 CLASSE 150.',
 '8. NIVEL OPERACIONAL NAO INFORMADO NO PDF; ADOTADA A CRISTA DA',
 '    CALHA VERTEDORA COMO HIPOTESE GEOMETRICA (A CONFIRMAR).',
 '9. Ø EXTERNO PE A PE = 2554 E COTA DERIVADA (L=1500, FIX. Z=1400).']
z=z1-16.0
for t in NOTAS:
    txt(t, x0+4.0, z, 1.95,'l'); z-=4.7
flush(PE,'TAB_T5_NOTAS',MTX,TGT)

# ================= T6 - CARIMBO ========================================
x0,z0,x1,z1,_,_ = SH['REG']['T6']
CW=x1-x0
dbox(x0, z1-9.0, x1, z1, 0.35)
flush(PE,'CARIMBO_FAIXA',MTI,TGC)
drect(x0, z0, x1, z1, 0.5)
dline(x0, z1-9.0, x1, z1-9.0, 0.4)
for zz in (z1-29.0, z1-45.0, z1-61.0, z1-77.0):
    dline(x0, zz, x1, zz, 0.3)
dline(x0+CW*0.5, z1-61.0, x0+CW*0.5, z1-77.0, 0.3)
dline(x0+CW*0.5, z1-77.0, x0+CW*0.5, z0, 0.3)
flush(PE,'CARIMBO_GRID',ML,TGC)
txt('CARIMBO', x0+3.0, z1-6.6, 2.6,'l')
txt('FOLHA 01/01', x1-3.0, z1-6.6, 2.6,'r')
txt('PROJETO:', x0+3.0, z1-14.0, 1.9,'l')
txt('TANQUE DECANTADOR / SEPARADOR CONICO VERTICAL', x0+3.0, z1-21.5, 2.5,'l')
txt('DESENHO:', x0+3.0, z1-34.0, 1.9,'l')
txt('MODELO 3D + DETALHAMENTO EXECUTIVO + VOLUMES', x0+3.0, z1-41.0, 2.2,'l')
txt('CLIENTE / EXECUCAO:', x0+3.0, z1-50.0, 1.9,'l')
txt('MARTINS NOTARI CONSTRUTORA', x0+3.0, z1-57.0, 2.2,'l')
txt('UNIDADE:  mm', x0+3.0, z1-67.0, 2.0,'l')
txt('ESCALA:  INDICADA', x0+CW*0.5+3.0, z1-67.0, 2.0,'l')
txt('REVISAO:  R01', x0+3.0, z1-73.5, 2.0,'l')
txt('DATA:  27/08/2026', x0+CW*0.5+3.0, z1-73.5, 2.0,'l')
txt('STATUS:', x0+3.0, z1-83.0, 1.9,'l')
txt('DETALHAMENTO / CONFERENCIA', x0+3.0, z1-89.5, 2.0,'l')
txt('FOLHA:', x0+CW*0.5+3.0, z1-83.0, 1.9,'l')
txt('A0  1189 x 841  -  MARGEM 20', x0+CW*0.5+3.0, z1-89.5, 1.9,'l')
flush(PE,'CARIMBO_TEXTO',MTX,TGC)

# ================= TITULOS DAS REGIOES (escalas corrigidas) ============
ESCALAS={'V01':'ESCALA 1:15','V02':'ESCALA 1:15','V03':'ESCALA 1:15','V04':'ESCALA 1:15',
         'DA':'ESCALA 1:3','DB':'ESCALA 1:2','DC':'ESCALA 1:10','DD':'ESCALA 1:1',
         'DE':'ESCALA 1:2','DF':'ESCALA 1:5'}
for k,(a,b,c,d,t,e) in SH['REG'].items():
    if t:
        txt(t, a+3.0, d-9.0+2.4, 3.5, 'l')
        ee = ESCALAS.get(k, e)
        if ee: txt(ee, c-3.0, d-9.0+2.4, 2.9, 'r')
flush(PE,'TITULOS_DAS_REGIOES',MTX,TGM)
result={'bloco':'S4','V_bruto_L':fm(L(VOL['V_BRUTO']),2),'V_util_L':fm(L(VOL['V_UTIL']),2)}


# ===========================================================================
# BLOCO 16 - PRANCHA: MOLDURA INSET, UNIDADES EM METRO, CHECK_BOUNDS
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
flush=D['flush']; dline=D['dline']; drect=D['drect']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); TGM=gettag(model,'20_PRANCHA_MOLDURA')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name()=='MOLDURA_E_GRID'])

PW=SH['PW']; PH=SH['PH']
UX0=SH['UX0']; UY0=SH['UY0']; UX1=SH['UX1']; UY1=SH['UY1']
drect(0.8,0.8,PW-0.8,PH-0.8,1.4)          # moldura externa INSET (nao ultrapassa)
drect(UX0,UY0,UX1,UY1,0.9)                # limite da area util
TB=9.0
for k,(x0,z0,x1,z1,t,e) in SH['REG'].items():
    drect(x0,z0,x1,z1,0.45)
    if t: dline(x0,z1-TB,x1,z1-TB,0.45)
for (xa,za,xb,zb) in [(PW/2.,1.6,PW/2.,11.),(PW/2.,PH-11.,PW/2.,PH-1.6),
                      (1.6,PH/2.,11.,PH/2.),(PW-11.,PH/2.,PW-1.6,PH/2.)]:
    dline(xa,za,xb,zb,0.6)
flush(PE,'MOLDURA_E_GRID',ML,TGM)

# ---- unidades de exibicao: METRO --------------------------------------
lf = model.get_length_formatter()
lf.set_format(RenderMode.WIREFRAME)          # 0 = DECIMAL
lf.set_units(RenderMode.TEXTURE_OBSOLETE)    # 4 = METER
lf.set_precision(3)

# ---- 4/40/41. CONTROLE AUTOMATICO DE FOLHA ----------------------------
def check_bounds(g, sheet_bounds):
    bb = g.get_bounding_box()
    mn = [bb.min_point[i]*25.4 for i in range(3)]
    mx = [bb.max_point[i]*25.4 for i in range(3)]
    x0,z0,x1,z1 = sheet_bounds
    dentro = (mn[0] >= x0-0.01 and mn[2] >= z0-0.01 and
              mx[0] <= x1+0.01 and mx[2] <= z1+0.01)
    return dentro, [round(mn[0],2), round(mn[2],2), round(mx[0],2), round(mx[2],2)]

FOLHA=(0.0, 0.0, PW, PH)
UTIL=(UX0, UY0, UX1, UY1)
fora_folha=[]; fora_util=[]
for g in PE.get_groups():
    okf,v = check_bounds(g, FOLHA)
    oku,_ = check_bounds(g, UTIL)
    if not okf: fora_folha.append((g.get_name(), v))
    if not oku and g.get_name() not in ('FOLHA_A0_1189x841','MOLDURA_E_GRID'):
        fora_util.append((g.get_name(), v))
bb=PR.get_bounding_box()
result={'bloco':'S5','MIN_X':round(bb.min_point[0]*25.4,2),'MIN_Y':round(bb.min_point[2]*25.4,2),
        'MAX_X':round(bb.max_point[0]*25.4,2),'MAX_Y':round(bb.max_point[2]*25.4,2),
        'LIMITE': [0,0,PW,PH],
        'GRUPOS_FORA_DA_FOLHA': fora_folha,
        'GRUPOS_FORA_DA_AREA_UTIL': fora_util,
        'n_grupos': len(PE.get_groups()),
        'faces_prancha': PR.get_bounding_box() is not None}


# ===========================================================================
# BLOCO 17 - PRANCHA: CORRECAO DAS TABELAS E DAS COTAS DAS VISTAS 01 E 04
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']; VOL=session_state['VOL']
del D['BUF'][:]
flush=D['flush']; dline=D['dline']; dbox=D['dbox']; drect=D['drect']; txt=D['txt']
dimh=D['dimh']; dimv=D['dimv']; leader=D['leader']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MTX=getmat(model,'Desenho_Texto',22,24,28)
MTI=getmat(model,'Desenho_Titulo',222,228,236); MC=getmat(model,'Desenho_Cota',24,84,168)
TGT=gettag(model,'24_PRANCHA_TABELAS'); TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name().startswith('TAB_')
                   or g.get_name() in ('V01_COTAS_E_CHAMADAS','V04_COTAS')])

def L(v): return v/1000000.0
def M3(v): return v/1000000000.0
def fm(v, nd=2):
    s=('%.'+str(nd)+'f')%v
    a,b=(s.split('.')+[''])[:2]
    neg=a.startswith('-'); a=a.lstrip('-'); out=''
    while len(a)>3:
        out='.'+a[-3:]+out; a=a[:-3]
    return ('-' if neg else '')+a+out+(','+b if b else '')

def tabela(x0, ztop, colw, cab, linhas, rh=9.0, hcab=9.0, h=2.05, tag='X'):
    W=sum(colw)
    dbox(x0, ztop-hcab, x0+W, ztop, 0.35)
    flush(PE,'TAB_%s_CAB'%tag, MTI, TGT)
    z=ztop
    dline(x0,z,x0+W,z,0.4); z-=hcab; dline(x0,z,x0+W,z,0.4)
    for r in linhas:
        z-=rh; dline(x0,z,x0+W,z,0.18)
    dline(x0,ztop,x0,z,0.4); dline(x0+W,ztop,x0+W,z,0.4)
    xx=x0
    for c in colw[:-1]:
        xx+=c; dline(xx,ztop,xx,z,0.25)
    flush(PE,'TAB_%s_GRID'%tag, ML, TGT)
    xx=x0
    for i,c in enumerate(colw):
        txt(cab[i], xx+2.0, ztop-hcab+2.6, h, 'l'); xx+=c
    zz=ztop-hcab
    for r in linhas:
        zz-=rh; xx=x0
        for i,c in enumerate(colw):
            if i < len(r):
                if i == len(colw)-1 and len(colw) > 2:
                    txt(r[i], xx+c-2.5, zz+2.6, h, 'r')
                else:
                    txt(r[i], xx+2.5, zz+2.6, h, 'l')
            xx += c
    flush(PE,'TAB_%s_TXT'%tag, MTX, TGT)
    return z

# ---- T1 ----------------------------------------------------------------
x0,z0,x1,z1,_,_ = SH['REG']['T1']
DIMS=[('1','DIAMETRO EXTERNO DO TANQUE','Ø1100'),('2','DIAMETRO INTERNO DO TANQUE','Ø1090'),
 ('3','ALTURA DO COSTADO','1300'),('4','ALTURA DO CONE','600'),
 ('5','DIAMETRO INFERIOR DO CONE','Ø50'),('6','DIAMETRO DA TAMPA','Ø1140'),
 ('7','FLECHA DA TAMPA','150'),('8','ALTURA DA ABA EM "L"','40'),
 ('9','DEFLETOR SUPERIOR (Ø / h)','Ø700 / 900'),('10','DEFLETOR INFERIOR (Ø / h)','Ø400 / 400'),
 ('11','CALHA VERTEDORA','Ø1000'),('12','ENTRADA','Ø40'),('13','SAIDA / CALHA','Ø40'),
 ('14','DRENO','Ø50'),('15','PES - TUBO REDONDO','Ø76 x 3'),('16','COMPRIMENTO DOS PES','1500'),
 ('17','Ø EXT. PE A PE (DERIVADO)','2554'),('18','ESPESSURA DAS CHAPAS','5'),
 ('19','ALTURA TOTAL','2700')]
zf=tabela(x0+3.0, z1-13.0, [12.0,145.0,62.0], ['IT','DESCRICAO','DIMENSAO (mm)'], DIMS, 8.6, 8.6, 2.0, 'T1')
txt('COTAS CONFORME AUDITORIA DO PDF - ANOTACOES', x0+3.0, zf-6.0, 1.9,'l')
txt('MANUSCRITAS PREVALECEM SOBRE AS IMPRESSAS.', x0+3.0, zf-10.4, 1.9,'l')
flush(PE,'TAB_T1_NOTA',MTX,TGT)

# ---- T2 ----------------------------------------------------------------
x0,z0,x1,z1,_,_ = SH['REG']['T2']
COMP=[('01','1','CORPO CILINDRICO Ø1100','CHAPA e=5'),('02','1','FUNDO CONICO H=600','CHAPA e=5'),
 ('03','1','TAMPA Ø1140 ABAULADA','CHAPA e=5'),('04','1','ABA DE FECHAMENTO "L"','CHAPA e=5'),
 ('05','1','DEFLETOR SUPERIOR Ø700','CHAPA e=5'),('06','1','DEFLETOR INFERIOR Ø400','CHAPA e=5'),
 ('07','1','CALHA VERTEDORA Ø1000','CHAPA e=5'),('08','1','ENTRADA Ø40 + CURVA R60','TUBO ACO'),
 ('09','1','SAIDA Ø40 + CURVA R60','TUBO ACO'),('10','1','DRENO Ø50 + CURVA R50','TUBO ACO'),
 ('11','1','VALVULA GAVETA Ø50','ACO / FoFo'),('12','3','PE INCLINADO Ø76 x 3','TUBO ACO'),
 ('13','4','SUPORTE INTERNO LATERAL','CHAPA/TUBO'),('14','6','FLANGE ANSI B16.5 CL.150','ACO CARBONO'),
 ('15','1','RESPIRO CENTRAL 1" BSP','TUBO ACO'),('16','-','PARAFUSOS/PORCAS/ARRUELAS','ACO CARBONO')]
zf=tabela(x0+3.0, z1-13.0, [12.0,14.0,110.0,68.0], ['IT','QT','COMPONENTE','MATERIAL'],
          COMP, 8.6, 8.6, 2.0, 'T2')
txt('SOLDAS DE FILETE CONTINUAS, SALVO INDICACAO', x0+3.0, zf-6.0, 1.9,'l')
txt('CONTRARIA.  FLANGES CONFORME ANSI B16.5.', x0+3.0, zf-10.4, 1.9,'l')
flush(PE,'TAB_T2_NOTA',MTX,TGT)

# ---- T3 ----------------------------------------------------------------
x0,z0,x1,z1,_,_ = SH['REG']['T3']
CA=x0+4.0; CB=x0+118.0; CC=x0+232.0; ZT=z1-16.0
def bloco(cx,titulo,linhas,tg,larg=110.0):
    dbox(cx, ZT-7.0, cx+larg, ZT, 0.35); flush(PE,'TAB_T3H_%s'%tg, MTI, TGT)
    drect(cx, ZT-7.0-len(linhas)*5.2-3.0, cx+larg, ZT, 0.3); flush(PE,'TAB_T3B_%s'%tg, ML, TGT)
    txt(titulo, cx+2.5, ZT-5.4, 2.1,'l')
    z=ZT-12.0
    for t in linhas:
        txt(t, cx+2.5, z, 1.95,'l'); z-=5.2
    flush(PE,'TAB_T3T_%s'%tg, MTX, TGT)
bloco(CA,'DADOS UTILIZADOS (INTERNOS)',
 ['Ø EXTERNO = 1100      e = 5','Ø INTERNO D = 1100 - 2 x 5 = 1090','RAIO  R = D / 2 = 545',
  'ALTURA CILINDRICA h = %s'%fm(VOL['H_CIL_INT'],2),'ALTURA DO CONE  h = 600',
  'RAIO MAIOR  R = %s'%fm(VOL['R_CT'],2),'RAIO MENOR  r = %s'%fm(VOL['R_CB'],2),
  '1.000.000 mm³ = 1 LITRO','1.000.000.000 mm³ = 1 m³'],'A')
bloco(CB,'1 - VOLUME DO CILINDRO',
 ['V = P x R² x h','V = 3,141593 x 545² x %s'%fm(VOL['H_CIL_INT'],2),
  'V = %s mm³'%fm(VOL['V_CIL'],0),'','V = %s m³'%fm(M3(VOL['V_CIL']),4),
  'V = %s LITROS'%fm(L(VOL['V_CIL']),2),'ALTURA INTERNA MEDIDA DO','TOPO DO CONE AO TOPO DO','COSTADO (Z 1253,29 - 2550).'],'B')
bloco(CC,'2 - VOLUME DO TRONCO DE CONE',
 ['V = P x h/3 x (R² + R.r + r²)','h = 600   R = %s   r = %s'%(fm(VOL['R_CT'],2),fm(VOL['R_CB'],2)),
  'V = %s mm³'%fm(VOL['V_CONE'],0),'','V = %s m³'%fm(M3(VOL['V_CONE']),4),
  'V = %s LITROS'%fm(L(VOL['V_CONE']),2),'DIAMETRO INFERIOR > 0  ->  NAO','E CONE SIMPLES: APLICADA A',
  'FORMULA DO TRONCO DE CONE.'],'C')
ZB=ZT-7.0-9*5.2-3.0-6.0
dbox(x0+4.0, ZB-30.0, x1-4.0, ZB-22.0, 0.35)
flush(PE,'TAB_T3_TOT_H',getmat(model,'Desenho_Verde',36,128,72),TGT)
drect(x0+4.0, ZB-56.0, x1-4.0, ZB-22.0, 0.4); flush(PE,'TAB_T3_TOT_B',ML,TGT)
txt('3 - VOLUME BRUTO TOTAL   E   VALIDACAO GEOMETRICA (SECAO 46)', x0+7.0, ZB-28.4, 2.15,'l')
txt('V TOTAL = V CILINDRO + V CONE = %s mm³'%fm(VOL['V_BRUTO'],0), x0+7.0, ZB-33.6, 2.0,'l')
txt('V TOTAL = %s m³      =      %s LITROS'%(fm(M3(VOL['V_BRUTO']),4), fm(L(VOL['V_BRUTO']),2)),
    x0+7.0, ZB-39.0, 2.4,'l')
txt('VOLUME DERIVADO DA GEOMETRIA 3D (compute_volume) = %s L'%fm(L(VOL['V_GEO']),2),
    x0+7.0, ZB-45.0, 2.0,'l')
txt('DIVERGENCIA = %s %% - COERENTE: O POLIGONO DE 96 LADOS APROXIMA O CIRCULO'%fm(VOL['DIF'],3),
    x0+7.0, ZB-50.0, 1.95,'l')
txt('POR FALTA EM 0,071 %. NAO HA INCONSISTENCIA DE VOLUME.', x0+7.0, ZB-54.6, 1.95,'l')
flush(PE,'TAB_T3_TOTAL',MTX,TGT)

# ---- T4 ----------------------------------------------------------------
x0,z0,x1,z1,_,_ = SH['REG']['T4']
REG4=[('CORPO CILINDRICO', fm(L(VOL['V_CIL']),2)),('FUNDO CONICO', fm(L(VOL['V_CONE']),2)),
      ('ACO DOS INTERNOS (-)', fm(L(VOL['V_ACO']),2)),('TOTAL BRUTO', fm(L(VOL['V_BRUTO']),2))]
zf=tabela(x0+3.0, z1-13.0, [90.0,60.0], ['REGIAO','VOLUME (L)'], REG4, 8.6, 8.6, 2.0,'T4a')
NIV=[(fm(a,0), fm(b,1)) for (a,b) in VOL['TAB']]
zf2=tabela(x0+3.0, zf-6.0, [90.0,60.0], ['ALTURA LIQUIDO (mm)','VOLUME (L)'], NIV, 8.0, 8.0, 2.0,'T4b')
txt('NIVEL OPERACIONAL NAO COTADO NO PDF.', x0+3.0, zf2-5.6, 1.85,'l')
txt('CRISTA DA CALHA h=%s -> V UTIL %s L'%(fm(VOL['H_CRISTA'],0), fm(L(VOL['V_UTIL']),1)),
    x0+3.0, zf2-9.8, 1.85,'l')
txt('V LIVRE = %s L   (A CONFIRMAR)'%fm(L(VOL['V_LIVRE']),1), x0+3.0, zf2-14.0, 1.85,'l')
flush(PE,'TAB_T4_NOTA',MTX,TGT)

# ---- V01 : cadeia de cotas fora da geometria --------------------------
ESC=1.0/15.0; RO=550.; RTP=570.; RD=350.; RDI=200.; RB=1147.2
a0,b0,a1,b1,_,_ = SH['REG']['V01']
CX=(a0+a1)/2.0; CZ=(b0+b1-9.0)/2.0
ZBASE=CZ-(RB+130.)*ESC-7.0
for i,(r,s) in enumerate([(RD,'Ø700 DEFLETOR'),(RDI,'Ø400 DEFLETOR')]):
    dimh(CX-r*ESC, CX+r*ESC, ZBASE-i*6.3, s, 2.2)
dimh(CX-RO*ESC, CX+RO*ESC, ZBASE-2*6.3, 'Ø1100 TANQUE', 2.2)
dimh(CX-RTP*ESC, CX+RTP*ESC, ZBASE-3*6.3, 'Ø1140 TAMPA', 2.2)
dimh(CX-(RB+130.)*ESC, CX+(RB+130.)*ESC, ZBASE-4*6.3, 'Ø2554 EXT. PE A PE', 2.2)
txt('0°',   CX+(RB+142.)*ESC, CZ+1.0, 2.5,'l')
txt('120°', CX-(RB+40.)*ESC, CZ+(RB+90.)*ESC, 2.5,'c')
txt('240°', CX-(RB+40.)*ESC, CZ-(RB+120.)*ESC, 2.5,'c')
leader(CX-560.*ESC, CZ, [(CX-92.,CZ+56.),(CX-70.,CZ+56.)],'ENTRADA Ø40',2.2)
leader(CX+560.*ESC, CZ, [(CX+70.,CZ+56.),(CX+92.,CZ+56.)],'SAIDA / CALHA Ø40',2.2,'r')
leader(CX-700.*ESC, CZ-18.*ESC, [(CX-80.,CZ-60.),(CX-58.,CZ-60.)],'DRENO Ø50',2.2)
txt('CORTE A-A', CX+118.0, CZ+3.0, 2.3,'r')
flush(PE,'V01_COTAS_E_CHAMADAS',MC,TGK)

# ---- V04 : cota de diametro movida para fora ---------------------------
Z1=650.; Z2=1250.; Z3=2550.; ZTP=2700.; RI=545.; RCAL=500.; ZCR=2500.; ZD0=1650.
a0,b0,a1,b1,_,_ = SH['REG']['V04']
cx4=(a0+a1)/2.0; zb4=b0+(b1-9.0-b0-ZTP*ESC)/2.0
xL4=cx4-(RB+150.)*ESC-6.0
dimv(zb4+Z1*ESC, zb4+Z2*ESC, xL4, '600 CONE', 2.3)
dimv(zb4+Z2*ESC, zb4+Z3*ESC, xL4, '1300 COSTADO', 2.3)
dimv(zb4+Z2*ESC, zb4+ZD0*ESC, cx4-RDI*ESC-4.0, '400', 2.2)
dimv(zb4+ZD0*ESC, zb4+(ZD0+900.)*ESC, cx4-RD*ESC-4.0, '900', 2.2)
dimh(cx4-RI*ESC, cx4+RI*ESC, zb4-7.0, 'Ø1090 INTERNO', 2.3)
leader(cx4+RCAL*ESC, zb4+ZCR*ESC, [(cx4+50.,zb4+198.),(cx4+70.,zb4+198.)],'CALHA VERTEDORA Ø1000',2.1,'r')
leader(cx4+RD*ESC, zb4+2100.*ESC, [(cx4+54.,zb4+152.),(cx4+74.,zb4+152.)],'DEFLETOR Ø700',2.1,'r')
leader(cx4+RDI*ESC, zb4+1350.*ESC, [(cx4+54.,zb4+98.),(cx4+74.,zb4+98.)],'DEFLETOR Ø400',2.1,'r')
txt('NIVEL DE OPERACAO (A CONFIRMAR)', cx4-(RB+140.)*ESC, zb4+ZCR*ESC+1.6, 2.1,'l')
flush(PE,'V04_COTAS',MC,TGK)

FOLHA=(0.0,0.0,SH['PW'],SH['PH'])
fora=[]
for g in PE.get_groups():
    bb=g.get_bounding_box()
    mn=[bb.min_point[i]*25.4 for i in range(3)]; mx=[bb.max_point[i]*25.4 for i in range(3)]
    if mn[0]<-0.01 or mn[2]<-0.01 or mx[0]>SH['PW']+0.01 or mx[2]>SH['PH']+0.01:
        fora.append(g.get_name())
result={'bloco':'S6','fora_da_folha':fora,'grupos':len(PE.get_groups())}


# ===========================================================================
# BLOCO 18 - PRANCHA: NOTAS TECNICAS + DETALHE B COM TUBO COMPLETO
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
flush=D['flush']; dline=D['dline']; dpl=D['dpl']; ddash=D['ddash']; txt=D['txt']
dimh=D['dimh']; dimv=D['dimv']; balloon=D['balloon']; dfill=D['dfill']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); MTX=getmat(model,'Desenho_Texto',22,24,28)
MC=getmat(model,'Desenho_Cota',24,84,168); MB=getmat(model,'Desenho_Balao',190,60,40)
TGT=gettag(model,'24_PRANCHA_TABELAS'); TGD=gettag(model,'23_PRANCHA_DETALHES')
TGK=gettag(model,'22_PRANCHA_COTAS')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name() in
                   ('DET_B_GEOMETRIA','DET_B_COTAS','TAB_T5_NOTAS')])

# ---------- T5 NOTAS TECNICAS (reinseridas) ----------------------------
x0,z0,x1,z1,_,_ = SH['REG']['T5']
NOTAS=['1. TODAS AS DIMENSOES EM MILIMETROS, SALVO INDICACAO CONTRARIA.',
 '2. AS MEDIDAS MANUSCRITAS DO PROJETO PREVALECEM SOBRE AS COTAS',
 '    IMPRESSAS QUANDO IDENTIFICADAS COMO CORRECOES.',
 '3. DIMENSOES NAO CONFIRMADAS ESTAO MARCADAS "A CONFIRMAR".',
 '4. VOLUMES CALCULADOS COM DIMENSOES INTERNAS: Ø INT = Ø EXT - 2 x e.',
 '5. MODELO 3D PARAMETRICO 1:1 - ALTERAR PARAM ATUALIZA A GEOMETRIA',
 '    E RECALCULA AUTOMATICAMENTE TODOS OS VOLUMES.',
 '6. CURVAS DE 90° POR ARCO TOROIDAL REAL - NUNCA MITRADAS.',
 '7. FLANGES CONFORME ANSI B16.5 CLASSE 150.',
 '8. NIVEL OPERACIONAL NAO INFORMADO NO PDF; ADOTADA A CRISTA DA',
 '    CALHA VERTEDORA COMO HIPOTESE GEOMETRICA (A CONFIRMAR).',
 '9. Ø EXT. PE A PE = 2554 E COTA DERIVADA (L=1500, FIXACAO Z=1400).',
 '10. SOLDAS DE FILETE CONTINUAS, SALVO INDICACAO CONTRARIA.']
z=z1-15.0
for t in NOTAS:
    txt(t, x0+4.0, z, 1.95,'l'); z-=4.55
flush(PE,'TAB_T5_NOTAS',MTX,TGT)

# ---------- DETALHE B : tubo completo + corte de topo ------------------
bx0,bz0,bx1,bz1 = (SH['REG']['DB'][0]+4.0, SH['REG']['DB'][1]+4.0,
                   SH['REG']['DB'][2]-4.0, SH['REG']['DB'][3]-13.0)
K=0.5; OX=1017.0; OZ=-140.0; CXB=bx0+22.0; CZB=bz0+32.0
def B(a,b): return (CXB+(a-OX)*K, CZB+(b-OZ)*K)
ux=597.2/1500.0; uz=-1376.0/1500.0; nx=-uz; nz=ux
dpl([B(1017.,0.),B(1277.,0.),B(1277.,12.),B(1017.,12.)],0.7,True)
dpl([B(1052.,12.),B(1242.,12.),B(1242.,190.),B(1052.,190.)],0.55,True)
dpl([B(1052.,12.),B(1052.,130.),B(1085.,130.),B(1085.,12.)],0.32,True)
dpl([B(1242.,12.),B(1242.,130.),B(1209.,130.),B(1209.,12.)],0.32,True)
LT=330.0
for off in (-38.,38.):
    dpl([B(1147.2+nx*off, 24.+nz*off),
         B(1147.2+nx*off-ux*LT, 24.-uz*LT+nz*off)],0.65)
for off in (-35.,35.):
    dpl([B(1147.2+nx*off, 24.+nz*off),
         B(1147.2+nx*off-ux*LT, 24.-uz*LT+nz*off)],0.25)
dpl([B(1147.2+nx*(-38.), 24.+nz*(-38.)), B(1147.2+nx*38., 24.+nz*38.)],0.5)
dfill([B(1147.2+nx*(-38.),24.+nz*(-38.)), B(1147.2+nx*(-51.),24.+nz*(-51.)+22.),
       B(1147.2+nx*(-38.)-ux*40.,24.-uz*40.+nz*(-38.))],0.55)
dfill([B(1147.2+nx*38.,24.+nz*38.), B(1147.2+nx*51.,24.+nz*51.+22.),
       B(1147.2+nx*38.-ux*40.,24.-uz*40.+nz*38.)],0.55)
for sx in (-1.,1.):
    dpl([B(1147.2+sx*95.-8.,-120.),B(1147.2+sx*95.+8.,-120.),
         B(1147.2+sx*95.+8.,15.),B(1147.2+sx*95.-8.,15.)],0.45,True)
    dpl([B(1147.2+sx*95.-17.,12.),B(1147.2+sx*95.+17.,12.),
         B(1147.2+sx*95.+17.,15.),B(1147.2+sx*95.-17.,15.)],0.4,True)
    dpl([B(1147.2+sx*95.-14.,15.),B(1147.2+sx*95.+14.,15.),
         B(1147.2+sx*95.+14.,28.),B(1147.2+sx*95.-14.,28.)],0.45,True)
ddash(B(1017.,0.)[0]-5.0, B(0.,0.)[1], B(1277.,0.)[0]+5.0, B(0.,0.)[1], 0.4)
flush(PE,'DET_B_GEOMETRIA',ML,TGD)
dimh(B(1017.,0.)[0], B(1277.,0.)[0], B(0.,-132.)[1], '260', 2.0)
dimv(B(0.,0.)[1], B(0.,12.)[1], bx1-3.0, '12', 2.0, -1)
dimv(B(0.,12.)[1], B(0.,190.)[1], bx0+3.0, '178', 2.0)
dimh(B(1147.2-95.,0.)[0], B(1147.2+95.,0.)[0], B(0.,208.)[1], '190 ENTRE CHUMBADORES', 2.0)
txt('TUBO Ø76 APOIA NA CHAPA DE BASE  (Zmin = 7,9)', bx0, B(0.,-112.)[1], 1.9,'l')
flush(PE,'DET_B_COTAS',MC,TGK)

fora=[]
for g in PE.get_groups():
    bb=g.get_bounding_box()
    mn=[bb.min_point[i]*25.4 for i in range(3)]; mx=[bb.max_point[i]*25.4 for i in range(3)]
    if mn[0]<-0.01 or mn[2]<-0.01 or mx[0]>SH['PW']+0.01 or mx[2]>SH['PH']+0.01:
        fora.append((g.get_name(),[round(mn[0],1),round(mn[2],1),round(mx[0],1),round(mx[2],1)]))
gb=[g for g in PE.get_groups() if g.get_name()=='DET_B_GEOMETRIA'][0].get_bounding_box()
result={'bloco':'S7','fora_da_folha':fora,
        'DET_B':[round(gb.min_point[0]*25.4,1),round(gb.min_point[2]*25.4,1),
                 round(gb.max_point[0]*25.4,1),round(gb.max_point[2]*25.4,1)],
        'celula_DB':[SH['REG']['DB'][0],232.0,SH['REG']['DB'][2],457.0]}


# ===========================================================================
# BLOCO 19 - PRANCHA: AJUSTE FINAL DO DETALHE B E VERIFICACAO DE FOLHA
# ===========================================================================
D=session_state['D']; H=session_state['H']; SH=session_state['SHEET']
del D['BUF'][:]
flush=D['flush']; dpl=D['dpl']; ddash=D['ddash']; dfill=D['dfill']
getmat=H['getmat']; gettag=H['gettag']
ML=getmat(model,'Desenho_Linha',28,30,34); TGD=gettag(model,'23_PRANCHA_DETALHES')
PR=[g for g in model.get_entities().get_groups() if g.get_name()=='PRANCHA_A0_R01'][0]
PE=PR.get_entities()
PE.erase_entities([g for g in PE.get_groups() if g.get_name()=='DET_B_GEOMETRIA'])
bx0,bz0 = SH['REG']['DB'][0]+4.0, SH['REG']['DB'][1]+4.0
K=0.5; OX=1017.0; OZ=-140.0; CXB=bx0+22.0; CZB=bz0+32.0
def B(a,b): return (CXB+(a-OX)*K, CZB+(b-OZ)*K)
ux=597.2/1500.0; uz=-1376.0/1500.0; nx=-uz; nz=ux
dpl([B(1017.,0.),B(1277.,0.),B(1277.,12.),B(1017.,12.)],0.7,True)
dpl([B(1052.,12.),B(1242.,12.),B(1242.,190.),B(1052.,190.)],0.55,True)
dpl([B(1052.,12.),B(1052.,130.),B(1085.,130.),B(1085.,12.)],0.32,True)
dpl([B(1242.,12.),B(1242.,130.),B(1209.,130.),B(1209.,12.)],0.32,True)
LT=195.0
for (off,w) in ((-38.,0.65),(38.,0.65),(-35.,0.25),(35.,0.25)):
    dpl([B(1147.2+nx*off, 24.+nz*off),
         B(1147.2+nx*off-ux*LT, 24.-uz*LT+nz*off)], w)
dpl([B(1147.2+nx*(-38.),24.+nz*(-38.)), B(1147.2+nx*38.,24.+nz*38.)],0.5)
dpl([B(1147.2+nx*(-38.)-ux*LT,24.-uz*LT+nz*(-38.)),
     B(1147.2+nx*38.-ux*LT,24.-uz*LT+nz*38.)],0.3)
dfill([B(1147.2+nx*(-38.),24.+nz*(-38.)), B(1147.2+nx*(-52.),24.+nz*(-52.)+20.),
       B(1147.2+nx*(-38.)-ux*38.,24.-uz*38.+nz*(-38.))],0.55)
dfill([B(1147.2+nx*38.,24.+nz*38.), B(1147.2+nx*52.,24.+nz*52.+20.),
       B(1147.2+nx*38.-ux*38.,24.-uz*38.+nz*38.)],0.55)
for sx in (-1.,1.):
    dpl([B(1147.2+sx*95.-8.,-120.),B(1147.2+sx*95.+8.,-120.),
         B(1147.2+sx*95.+8.,15.),B(1147.2+sx*95.-8.,15.)],0.45,True)
    dpl([B(1147.2+sx*95.-17.,12.),B(1147.2+sx*95.+17.,12.),
         B(1147.2+sx*95.+17.,15.),B(1147.2+sx*95.-17.,15.)],0.4,True)
    dpl([B(1147.2+sx*95.-14.,15.),B(1147.2+sx*95.+14.,15.),
         B(1147.2+sx*95.+14.,28.),B(1147.2+sx*95.-14.,28.)],0.45,True)
ddash(B(1017.,0.)[0]-5.0, B(0.,0.)[1], B(1277.,0.)[0]+5.0, B(0.,0.)[1], 0.4)
flush(PE,'DET_B_GEOMETRIA',ML,TGD)
bb=[g for g in PE.get_groups() if g.get_name()=='DET_B_GEOMETRIA'][0].get_bounding_box()
v=[round(bb.min_point[0]*25.4,1),round(bb.min_point[2]*25.4,1),
   round(bb.max_point[0]*25.4,1),round(bb.max_point[2]*25.4,1)]
fora=[]
for g in PE.get_groups():
    b2=g.get_bounding_box()
    mn=[b2.min_point[i]*25.4 for i in range(3)]; mx=[b2.max_point[i]*25.4 for i in range(3)]
    if mn[0]<-0.01 or mn[2]<-0.01 or mx[0]>1189.01 or mx[2]>841.01:
        fora.append(g.get_name())
result={'bloco':'S8','DET_B':v,'celula':[211.5,232.0,403.0,457.0],
        'DET_B_dentro': v[0]>=211.5 and v[1]>=232.0 and v[2]<=403.0 and v[3]<=457.0,
        'fora_da_folha':fora}
