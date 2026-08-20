"""Check de Padrão: unidades do Sienge, sinônimos aceitos e unidades ambíguas."""

from __future__ import annotations

from mas.textos import normalizar

#: Unidade canônica -> grafias aceitas no Sienge e nas requisições.
SINONIMOS: dict[str, tuple[str, ...]] = {
    "m³": ("m3", "m³", "metro cubico", "metros cubicos", "mc", "m cubico"),
    "m²": ("m2", "m²", "metro quadrado", "metros quadrados"),
    "m": ("m", "ml", "metro", "metros", "metro linear", "metros lineares"),
    "kg": ("kg", "quilo", "quilos", "quilograma", "quilogramas"),
    "t": ("t", "ton", "tonelada", "toneladas"),
    "un": ("un", "und", "unid", "unidade", "unidades", "pc", "pca", "peca", "pecas"),
    "sc": ("sc", "saco", "sacos", "saca", "sacas"),
    "L": ("l", "lt", "litro", "litros"),
    "cj": ("cj", "conj", "conjunto", "conjuntos"),
    "vb": ("vb", "verba"),
    "h": ("h", "hr", "hora", "horas"),
    "mês": ("mes", "meses", "mensal"),
    "%": ("%", "percentual", "porcento"),
}

#: Unidades de campo/obra que não existem como unidade de medida do Sienge.
#: Pedir "caminhão" de concreto usinado esconde o volume real faturado.
AMBIGUAS: dict[str, str] = {
    "caminhao": "carga de veículo, não volume",
    "caminhao betoneira": "carga de veículo, não volume",
    "betoneira": "carga de equipamento, não volume",
    "carreta": "carga de veículo, não massa",
    "carrada": "carga de veículo, sem quantidade definida",
    "viagem": "frete, não quantidade de material",
    "carga": "carga de veículo, sem quantidade definida",
    "carrinho": "recipiente de obra, sem volume padronizado",
    "balde": "recipiente de obra, sem volume padronizado",
    "lata": "recipiente de obra, sem volume padronizado",
    "padiola": "recipiente de obra, sem volume padronizado",
    "monte": "estimativa visual, sem medição",
    "pilha": "estimativa visual, sem medição",
    "rolo": "embalagem variável, sem metragem definida",
    "fardo": "embalagem variável, sem quantidade definida",
    "pacote": "embalagem variável, sem quantidade definida",
    "caixa": "embalagem variável, sem quantidade definida",
    "pallet": "embalagem variável, sem quantidade definida",
    "palete": "embalagem variável, sem quantidade definida",
    "barra": "quantidade em peças, não massa",
    "barras": "quantidade em peças, não massa",
    "diversos": "sem unidade de medida",
    "varios": "sem unidade de medida",
}

#: Conversões dimensionais seguras (independem do material).
_FATORES: dict[tuple[str, str], float] = {
    ("t", "kg"): 1000.0,
    ("kg", "t"): 0.001,
    ("m³", "L"): 1000.0,
    ("L", "m³"): 0.001,
}

_INDICE = {normalizar(grafia): canonica for canonica, grafias in SINONIMOS.items() for grafia in grafias}


def canonica(unidade: str | None) -> str | None:
    """Unidade canônica do Sienge, ou ``None`` se a grafia não for reconhecida."""
    if unidade is None:
        return None
    return _INDICE.get(normalizar(unidade))


def eh_ambigua(unidade: str | None) -> bool:
    if unidade is None:
        return False
    return normalizar(unidade) in AMBIGUAS


def motivo_ambiguidade(unidade: str) -> str:
    return AMBIGUAS.get(normalizar(unidade), "unidade não padronizada no Sienge")


def equivalentes(a: str | None, b: str | None) -> bool:
    ca, cb = canonica(a), canonica(b)
    if ca is None or cb is None:
        return normalizar(a or "") == normalizar(b or "")
    return ca == cb


def conversivel(de: str | None, para: str | None) -> bool:
    ca, cb = canonica(de), canonica(para)
    return ca is not None and cb is not None and (ca == cb or (ca, cb) in _FATORES)


def converter(quantidade: float, de: str, para: str) -> float:
    """Converte entre unidades dimensionalmente equivalentes (t/kg, m³/L)."""
    ca, cb = canonica(de), canonica(para)
    if ca is None or cb is None:
        raise ValueError(f"unidade não reconhecida: {de!r} -> {para!r}")
    if ca == cb:
        return float(quantidade)
    try:
        return float(quantidade) * _FATORES[(ca, cb)]
    except KeyError:
        raise ValueError(f"conversão não suportada: {ca} -> {cb}") from None
