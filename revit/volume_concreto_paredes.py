# -*- coding: utf-8 -*-
"""
Levantamento de volume de concreto de TODAS as paredes do modelo Revit.

Responde: "quanto de concreto eu usaria se todas as paredes fossem de concreto?"

Funciona no Dynamo (no de Python) e no pyRevit. Nao altera nada no modelo -
so le e imprime o resultado, alem de gravar um CSV.

--------------------------------------------------------------------------
COMO USAR NO DYNAMO (mais simples, ja vem com o Revit)
  1. Revit > aba Gerenciar > Dynamo > New
  2. Arraste um no "Python Script" para a tela
  3. Duplo clique nele, apague o conteudo e cole ESTE arquivo inteiro
  4. Run. O resultado sai no no e o CSV vai para a Area de Trabalho.

COMO USAR NO pyRevit
  Salve como script.py dentro de um botao, ou cole no pyRevit Python Shell.
--------------------------------------------------------------------------
"""

# ==========================================================================
# CONFIGURACAO - mexa so aqui
# ==========================================================================

# Espessura das paredes de concreto, em METROS.
#   None  -> usa a espessura real de cada parede do modelo
#   0.15  -> considera todas as paredes com 15 cm (cenario "refiz tudo em concreto")
ESPESSURA_FIXA_M = None

# Ignorar paredes abaixo desta area (m2). Evita sujeira de modelagem.
AREA_MINIMA_M2 = 0.01

# Considerar tambem as paredes que nao sao estruturais? (alvenaria, drywall...)
# True  = todas as paredes viram concreto (e o que a pergunta pede)
# False = so as ja marcadas como estruturais
INCLUIR_NAO_ESTRUTURAIS = True

# Indices para orcamento
TAXA_ACO_KG_M3 = 80.0    # kg de aco por m3 de concreto (parede: 60-100)
PERDA_CONCRETO = 0.05    # 5% de perda
CONSUMO_FORMA = 2.0      # m2 de forma por m2 de parede (duas faces)

# Levantar tambem lajes, pilares, vigas e fundacoes ja modelados
INCLUIR_OUTROS_ELEMENTOS = True

# ==========================================================================
# Daqui para baixo nao precisa mexer
# ==========================================================================

import clr
import os
import codecs

clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import (
    FilteredElementCollector, Wall, WallKind, BuiltInParameter,
    BuiltInCategory, Options, ViewDetailLevel, Solid, GeometryInstance,
)

# Descobre o documento ativo, seja Dynamo ou pyRevit
doc = None
try:
    clr.AddReference('RevitServices')
    from RevitServices.Persistence import DocumentManager
    doc = DocumentManager.Instance.CurrentDBDocument
except Exception:
    pass
if doc is None:
    doc = __revit__.ActiveUIDocument.Document  # noqa: F821  (pyRevit)

FT_M = 0.3048
FT2_M2 = 0.09290304
FT3_M3 = 0.028316846592


def volume_por_geometria(el):
    """Soma o volume dos solidos do elemento, em pes cubicos."""
    opt = Options()
    opt.ComputeReferences = False
    opt.IncludeNonVisibleObjects = False
    opt.DetailLevel = ViewDetailLevel.Fine

    total = 0.0

    def varrer(geo):
        soma = 0.0
        if geo is None:
            return soma
        for g in geo:
            if isinstance(g, Solid):
                if g.Volume > 0:
                    soma += g.Volume
            elif isinstance(g, GeometryInstance):
                soma += varrer(g.GetInstanceGeometry())
        return soma

    try:
        total = varrer(el.get_Geometry(opt))
    except Exception:
        total = 0.0
    return total


def valor_param(el, bip):
    p = el.get_Parameter(bip)
    if p is None:
        return 0.0
    return p.AsDouble()


def nome_nivel(el):
    try:
        lvl = doc.GetElement(el.LevelId)
        if lvl is not None:
            return lvl.Name
    except Exception:
        pass
    return "(sem nivel)"


# --------------------------------------------------------------------------
# 1) PAREDES
# --------------------------------------------------------------------------

paredes = (FilteredElementCollector(doc)
           .OfClass(Wall)
           .WhereElementIsNotElementType()
           .ToElements())

linhas = []          # uma por parede
ignoradas = []       # motivo por que ficou de fora

for w in paredes:
    try:
        # O container da parede empilhada nao tem geometria propria:
        # as partes dela vem separadas no coletor. Contar os dois duplicaria.
        if w.IsStackedWall:
            continue

        wt = w.WallType
        if wt is not None and wt.Kind == WallKind.Curtain:
            ignoradas.append((w.Id.IntegerValue, "parede cortina - sem espessura solida"))
            continue

        # Area ja vem descontando portas, janelas e demais aberturas
        area_m2 = valor_param(w, BuiltInParameter.HOST_AREA_COMPUTED) * FT2_M2
        if area_m2 < AREA_MINIMA_M2:
            ignoradas.append((w.Id.IntegerValue, "area desprezivel"))
            continue

        estrutural = False
        p_est = w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)
        if p_est is not None:
            estrutural = p_est.AsInteger() == 1
        if not INCLUIR_NAO_ESTRUTURAIS and not estrutural:
            ignoradas.append((w.Id.IntegerValue, "nao estrutural (filtro ligado)"))
            continue

        if ESPESSURA_FIXA_M is not None:
            esp_m = float(ESPESSURA_FIXA_M)
        else:
            esp_m = w.Width * FT_M

        if esp_m <= 0:
            ignoradas.append((w.Id.IntegerValue, "espessura zero"))
            continue

        linhas.append({
            "id": w.Id.IntegerValue,
            "nivel": nome_nivel(w),
            "tipo": wt.Name if wt is not None else "(sem tipo)",
            "estrutural": "sim" if estrutural else "nao",
            "area_m2": area_m2,
            "esp_m": esp_m,
            "vol_m3": area_m2 * esp_m,
        })
    except Exception as erro:
        ignoradas.append((w.Id.IntegerValue, "erro: %s" % erro))

vol_paredes = sum(l["vol_m3"] for l in linhas)
area_paredes = sum(l["area_m2"] for l in linhas)


def agrupar(chave):
    saida = {}
    for l in linhas:
        k = l[chave]
        if k not in saida:
            saida[k] = {"qtd": 0, "area_m2": 0.0, "vol_m3": 0.0}
        saida[k]["qtd"] += 1
        saida[k]["area_m2"] += l["area_m2"]
        saida[k]["vol_m3"] += l["vol_m3"]
    return saida


por_nivel = agrupar("nivel")
por_tipo = agrupar("tipo")

# --------------------------------------------------------------------------
# 2) OUTROS ELEMENTOS DE CONCRETO JA MODELADOS
# --------------------------------------------------------------------------

outros = {}
if INCLUIR_OUTROS_ELEMENTOS:
    categorias = [
        ("Lajes / pisos", BuiltInCategory.OST_Floors),
        ("Pilares estruturais", BuiltInCategory.OST_StructuralColumns),
        ("Vigas / estrutura", BuiltInCategory.OST_StructuralFraming),
        ("Fundacoes", BuiltInCategory.OST_StructuralFoundation),
        ("Escadas", BuiltInCategory.OST_Stairs),
        ("Telhados", BuiltInCategory.OST_Roofs),
    ]
    for rotulo, cat in categorias:
        els = (FilteredElementCollector(doc)
               .OfCategory(cat)
               .WhereElementIsNotElementType()
               .ToElements())
        vol_ft3 = 0.0
        qtd = 0
        for el in els:
            v = valor_param(el, BuiltInParameter.HOST_VOLUME_COMPUTED)
            if v <= 0:
                p = el.LookupParameter("Volume") or el.LookupParameter("Volume ")
                if p is not None:
                    try:
                        v = p.AsDouble()
                    except Exception:
                        v = 0.0
            if v <= 0:
                v = volume_por_geometria(el)
            if v > 0:
                vol_ft3 += v
                qtd += 1
        if qtd:
            outros[rotulo] = {"qtd": qtd, "vol_m3": vol_ft3 * FT3_M3}

vol_outros = sum(v["vol_m3"] for v in outros.values())

# --------------------------------------------------------------------------
# 3) RELATORIO
# --------------------------------------------------------------------------

L = []
w_ = L.append

w_("=" * 66)
w_("VOLUME DE CONCRETO - PAREDES")
w_("=" * 66)
if ESPESSURA_FIXA_M is not None:
    w_("Criterio: TODAS as paredes com %.0f cm de espessura" % (ESPESSURA_FIXA_M * 100))
else:
    w_("Criterio: espessura real de cada parede do modelo")
w_("Paredes contabilizadas : %d" % len(linhas))
w_("Paredes ignoradas      : %d" % len(ignoradas))
w_("")
w_("Area liquida de parede : %10.2f m2   (aberturas ja descontadas)" % area_paredes)
w_("VOLUME DE CONCRETO     : %10.2f m3" % vol_paredes)
w_("  + perda de %.0f%%       : %10.2f m3   <- comprar" % (PERDA_CONCRETO * 100,
                                                          vol_paredes * (1 + PERDA_CONCRETO)))
w_("Area de forma          : %10.2f m2   (%.1f x a area de parede)" % (
    area_paredes * CONSUMO_FORMA, CONSUMO_FORMA))
w_("Aco estimado           : %10.0f kg   (taxa de %.0f kg/m3)" % (
    vol_paredes * TAXA_ACO_KG_M3, TAXA_ACO_KG_M3))

w_("")
w_("-" * 66)
w_("POR NIVEL")
w_("-" * 66)
w_("%-28s %5s %12s %12s" % ("Nivel", "Qtd", "Area (m2)", "Volume (m3)"))
for k in sorted(por_nivel.keys()):
    d = por_nivel[k]
    w_("%-28s %5d %12.2f %12.2f" % (k[:28], d["qtd"], d["area_m2"], d["vol_m3"]))

w_("")
w_("-" * 66)
w_("POR TIPO DE PAREDE")
w_("-" * 66)
w_("%-28s %5s %12s %12s" % ("Tipo", "Qtd", "Area (m2)", "Volume (m3)"))
for k in sorted(por_tipo.keys(), key=lambda x: -por_tipo[x]["vol_m3"]):
    d = por_tipo[k]
    w_("%-28s %5d %12.2f %12.2f" % (k[:28], d["qtd"], d["area_m2"], d["vol_m3"]))

if outros:
    w_("")
    w_("-" * 66)
    w_("CONCRETO JA MODELADO EM OUTROS ELEMENTOS")
    w_("-" * 66)
    w_("%-28s %5s %12s" % ("Categoria", "Qtd", "Volume (m3)"))
    for k in sorted(outros.keys(), key=lambda x: -outros[x]["vol_m3"]):
        d = outros[k]
        w_("%-28s %5d %12.2f" % (k[:28], d["qtd"], d["vol_m3"]))
    w_("")
    w_("%-28s %5s %12.2f" % ("SUBTOTAL outros", "", vol_outros))
    w_("%-28s %5s %12.2f" % ("TOTAL GERAL", "", vol_paredes + vol_outros))

if ignoradas:
    w_("")
    w_("-" * 66)
    w_("IGNORADAS (confira se alguma deveria entrar)")
    w_("-" * 66)
    for el_id, motivo in ignoradas[:40]:
        w_("  ID %-10s %s" % (el_id, motivo))
    if len(ignoradas) > 40:
        w_("  ... e mais %d" % (len(ignoradas) - 40))

relatorio = "\n".join(L)

# --------------------------------------------------------------------------
# 4) CSV parede a parede, para conferir no Excel
# --------------------------------------------------------------------------

caminho_csv = ""
try:
    pasta = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(pasta):
        pasta = os.path.expanduser("~")
    caminho_csv = os.path.join(pasta, "volume_concreto_paredes.csv")
    with codecs.open(caminho_csv, "w", "utf-8-sig") as f:
        f.write("ID;Nivel;Tipo;Estrutural;Area (m2);Espessura (m);Volume (m3)\n")
        for l in linhas:
            f.write("%d;%s;%s;%s;%s;%s;%s\n" % (
                l["id"], l["nivel"], l["tipo"], l["estrutural"],
                ("%.4f" % l["area_m2"]).replace(".", ","),
                ("%.4f" % l["esp_m"]).replace(".", ","),
                ("%.4f" % l["vol_m3"]).replace(".", ","),
            ))
    relatorio += "\n\nCSV gravado em: %s" % caminho_csv
except Exception as erro:
    relatorio += "\n\nNao consegui gravar o CSV: %s" % erro

print(relatorio)

# Saida do no do Dynamo
try:
    OUT = relatorio
except Exception:
    pass
