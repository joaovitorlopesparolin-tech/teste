"""Fluxo de Indexação (modo escrita): diretriz bruta -> nó de conhecimento .md."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable

from mas import frontmatter
from mas.conhecimento import Registro
from mas.modelos import (
    BLOQUEIO_ORCAMENTARIO,
    JANELA_DUPLICIDADE_PADRAO,
    PENDENCIA_TECNICA,
    Regra,
    TRAVA_DUPLICIDADE,
    como_data,
)
from mas.textos import normalizar, sentencas, slug
from mas.unidades import AMBIGUAS, SINONIMOS, canonica

#: Termos que puxam cada sentença para um dos três tipos de regra.
PESOS: dict[str, dict[str, int]] = {
    BLOQUEIO_ORCAMENTARIO: {
        "orcament": 3, "verba": 3, "teto": 3, "saldo": 3, "r$": 3, "sobrepreco": 3,
        "custo": 2, "preco": 2, "valor": 2, "limite de valor": 3, "orcado": 2,
        "cotacao": 2, "cotacoes": 2, "aditivo": 2, "gasto": 2, "maximo homologado": 2,
        "financeir": 2, "reajuste": 2, "acima": 1,
    },
    TRAVA_DUPLICIDADE: {
        "duplicid": 4, "duplicad": 4, "reincid": 3, "ja faturad": 4, "ja comprad": 4,
        "novo pedido": 3, "nova solicitacao": 3, "nova compra": 3, "nova requisicao": 3,
        "novo carregamento": 3, "repetid": 3, "recompra": 3, "mesmo insumo": 3,
        "mesmo centro de custo": 3, "ultimo faturamento": 3, "intervalo inferior": 3,
        "segunda compra": 3, "reiterad": 2, "intervalo": 1, "dias": 1, "menos de": 1,
    },
    PENDENCIA_TECNICA: {
        "revit": 4, "eberick": 4, "quantitativ": 4, "compatibiliz": 4, "autocad": 4,
        "navisworks": 4, "projeto": 3, "projetist": 3, "modelo": 3, "extracao": 3,
        "memorial": 3, "especificac": 3, "laudo": 3, "ensaio": 3, "fck": 3,
        "prancha": 3, "detalhament": 3, "unidade": 3, "cadastr": 3, "nbr": 3,
        "certificad": 3, "armazenagem": 3, "estocagem": 3, "validade": 3,
        "fabricacao": 3, "consumo": 3, "empilha": 3, "responsavel tecnico": 3,
        "aprovacao tecnica": 3, "art": 2, "rrt": 2, "engenheir": 2, "traco": 2,
        "norma": 2, "estrutural": 2, "sienge": 2, "convert": 2, "qualidade": 2,
        "liberacao": 2, "medicao": 2,
    },
}

_ROTULOS = {
    "insumo": (r"insumo", r"material", r"item", r"produto"),
    "unidade_sienge": (r"unidade\s+sienge", r"unidade\s+de\s+medida", r"unidade", r"un"),
    "centro_de_custo": (r"centro\s+de\s+custo", r"centro\s+custo", r"cc"),
    "data_vigencia": (r"data\s+de\s+vig[eê]ncia", r"vig[eê]ncia", r"vigente\s+a\s+partir\s+de", r"a\s+partir\s+de"),
}

_TERMOS_ESTRUTURAIS = (
    "concreto", "concretagem", "aco", "armadura", "vergalhao", "ca 50", "ca 60",
    "laje", "viga", "pilar", "trelica", "estrutura metalica", "protensao",
    "cordoalha", "estaca", "sapata", "perfil metalico", "ferragem",
)

_CONTEXTO_UNIDADE = ("unidade", "solicit", "pedido", "requisic", "lanc", "convert", "aceit", "cadastr", "faturad")

_WIKILINK_SPLIT = re.compile(r"(\[\[[^\]]*\]\])")
_PROJETO_LIVRE = re.compile(
    r"\b(Projeto|Obra|Empreendimento|Residencial|Condom[ií]nio)\s+((?:[A-ZÀ-Ú][\wÀ-ÿ'-]*\s?){1,3})"
)
_DIAS = re.compile(r"(\d{1,3})\s*(?:\(\s*\w+\s*\))?\s*dias", re.IGNORECASE)
_DINHEIRO = re.compile(
    r"(teto|limite|m[aá]ximo|m[aá]xima|acima\s+de|superior\s+a)[^.;\n]{0,60}?R\$\s*([\d.,]+)", re.IGNORECASE
)
_PERCENTUAL = re.compile(r"toler[aâ]ncia[^.;\n]{0,40}?([\d.,]+)\s*%", re.IGNORECASE)
_UNIDADES_TEXTO = "|".join(
    sorted((re.escape(g) for grafias in SINONIMOS.values() for g in grafias), key=len, reverse=True)
)
_POR_UNIDADE = re.compile(rf"\bpor\s+(?:{_UNIDADES_TEXTO})\b", re.IGNORECASE)


class DadosInsuficientes(ValueError):
    """A diretriz não traz os campos obrigatórios do frontmatter."""

    def __init__(self, faltando: list[str]) -> None:
        self.faltando = faltando
        super().__init__(
            "campos obrigatórios ausentes na diretriz: "
            + ", ".join(faltando)
            + ". Informe-os explicitamente antes de indexar."
        )


@dataclass
class NoIndexado:
    """Resultado do fluxo de indexação, pronto para ser gravado em disco."""

    nome_arquivo: str
    conteudo: str
    meta: dict[str, Any]
    regras: list[Regra] = field(default_factory=list)
    projetos: list[str] = field(default_factory=list)
    softwares: list[str] = field(default_factory=list)

    def salvar(self, diretorio: str | Path, sobrescrever: bool = False) -> Path:
        destino = Path(diretorio)
        destino.mkdir(parents=True, exist_ok=True)
        caminho = destino / self.nome_arquivo
        if caminho.exists() and not sobrescrever:
            raise FileExistsError(f"nó já existe: {caminho} (use sobrescrever=True)")
        caminho.write_text(self.conteudo, encoding="utf-8")
        return caminho


def classificar(sentenca: str) -> tuple[str, bool]:
    """Classifica uma regra em um dos três tipos; ``True`` = exige revisão humana."""
    alvo = normalizar(sentenca)
    if "r$" in sentenca.lower():
        alvo += " r$"
    placar = {
        tipo: sum(peso for termo, peso in termos.items() if termo in alvo)
        for tipo, termos in PESOS.items()
    }
    melhor = max(placar.values())
    if melhor == 0:
        return PENDENCIA_TECNICA, True
    vencedores = [tipo for tipo, pontos in placar.items() if pontos == melhor]
    if len(vencedores) > 1:
        # Empate: duplicidade e orçamento são travas duras; a técnica é o fallback.
        for tipo in (TRAVA_DUPLICIDADE, BLOQUEIO_ORCAMENTARIO, PENDENCIA_TECNICA):
            if tipo in vencedores:
                return tipo, True
    return vencedores[0], False


def interligar(texto: str, registro: Registro | None = None) -> tuple[str, list[str], list[str]]:
    """Envolve projetos e softwares em wikilinks, preservando links existentes."""
    registro = registro or Registro()

    def linkar_registro(trecho: str) -> str:
        for termo in registro.termos:
            padrao = re.compile(rf"(?<![\w\[]){re.escape(termo)}(?![\w\]])", re.IGNORECASE)
            trecho = padrao.sub(f"[[{termo}]]", trecho)
        return trecho

    def linkar_projetos(trecho: str) -> str:
        def envolver(casamento: re.Match[str]) -> str:
            nome = casamento.group(2)
            sufixo = nome[len(nome.rstrip()) :]  # preserva o espaço final consumido
            return f"[[{casamento.group(1)} {nome.strip()}]]{sufixo}"

        return _PROJETO_LIVRE.sub(envolver, trecho)

    ligado = _fora_dos_links(_fora_dos_links(texto, linkar_projetos), linkar_registro)

    from mas.conhecimento import wikilinks  # import tardio: evita ciclo na carga

    projetos: list[str] = []
    softwares: list[str] = []
    for alvo in wikilinks(ligado):
        if registro.classificar(alvo) == "software":
            softwares.append(alvo)
        else:
            projetos.append(alvo)
    return ligado, projetos, softwares


def extrair_campos(texto: str) -> dict[str, str]:
    """Lê pares ``Rótulo: valor`` no cabeçalho da diretriz bruta."""
    return _ler_rotulos(texto)[0]


def indexar(
    texto: str,
    *,
    insumo: str | None = None,
    unidade_sienge: str | None = None,
    centro_de_custo: str | None = None,
    data_vigencia: str | date | None = None,
    registro: Registro | None = None,
    extras: dict[str, Any] | None = None,
) -> NoIndexado:
    """Converte a diretriz bruta em nó de conhecimento Markdown."""
    if not texto or not texto.strip():
        raise DadosInsuficientes(["diretriz"])

    registro = registro or Registro()
    achados, linhas_rotulo = _ler_rotulos(texto)
    campos = {
        "insumo": insumo or achados.get("insumo"),
        "unidade_sienge": unidade_sienge or achados.get("unidade_sienge"),
        "centro_de_custo": centro_de_custo or achados.get("centro_de_custo"),
        "data_vigencia": data_vigencia or achados.get("data_vigencia"),
    }
    faltando = [campo for campo, valor in campos.items() if not valor]
    if faltando:
        raise DadosInsuficientes(faltando)

    vigencia = como_data(campos["data_vigencia"], "data_vigencia")
    unidade = canonica(campos["unidade_sienge"]) or str(campos["unidade_sienge"]).strip()
    diretriz = _sem_rotulos(texto, linhas_rotulo)

    corpo_ligado, projetos, softwares = interligar(diretriz, registro)
    regras = _extrair_regras(diretriz, corpo_ligado)

    meta: dict[str, Any] = {
        "insumo": campos["insumo"],
        "unidade_sienge": unidade,
        "centro_de_custo": campos["centro_de_custo"],
        "data_vigencia": vigencia,
        "estrutural": _eh_estrutural(str(campos["insumo"]), diretriz),
        "janela_duplicidade_dias": _janela(diretriz),
    }
    tolerancia = _tolerancia(diretriz)
    if tolerancia is not None:
        meta["tolerancia_quantitativo_percentual"] = tolerancia
    bloqueadas = _unidades_bloqueadas(diretriz, unidade)
    if bloqueadas:
        meta["unidades_bloqueadas"] = bloqueadas
    meta.update(_limites_financeiros(diretriz))
    if projetos:
        meta["projetos"] = projetos
    if softwares:
        meta["softwares"] = softwares
    if extras:
        meta.update(extras)

    conteudo = frontmatter.serializar(
        meta, _corpo(str(campos["insumo"]), corpo_ligado, regras, projetos, softwares)
    )
    return NoIndexado(
        nome_arquivo=f"{slug(str(campos['insumo']))}.md",
        conteudo=conteudo,
        meta=meta,
        regras=regras,
        projetos=projetos,
        softwares=softwares,
    )


def _fora_dos_links(texto: str, transformar: Callable[[str], str]) -> str:
    """Aplica ``transformar`` apenas fora dos wikilinks já existentes."""
    partes = _WIKILINK_SPLIT.split(texto)
    for i in range(0, len(partes), 2):
        partes[i] = transformar(partes[i])
    return "".join(partes)


def _ler_rotulos(texto: str) -> tuple[dict[str, str], set[str]]:
    achados: dict[str, str] = {}
    consumidas: set[str] = set()
    for campo, rotulos in _ROTULOS.items():
        for rotulo in rotulos:
            casamento = re.search(rf"(?im)^[ \t]*{rotulo}[ \t]*[:\-–][ \t]*(?P<valor>.+?)[ \t]*$", texto)
            if casamento:
                achados[campo] = casamento.group("valor").strip().rstrip(".;")
                consumidas.add(casamento.group(0).strip())
                break
    return achados, consumidas


def _sem_rotulos(texto: str, linhas_rotulo: set[str]) -> str:
    """Remove o cabeçalho ``Rótulo: valor`` — já representado no frontmatter."""
    restante = [linha for linha in texto.splitlines() if linha.strip() not in linhas_rotulo]
    return "\n".join(restante).strip()


def _extrair_regras(texto_bruto: str, texto_ligado: str) -> list[Regra]:
    ligadas = {normalizar(s): s for s in sentencas(texto_ligado)}
    regras: list[Regra] = []
    vistas: set[str] = set()
    for sentenca in sentencas(texto_bruto):
        chave = normalizar(sentenca)
        if not chave or chave in vistas:
            continue
        vistas.add(chave)
        tipo, revisar = classificar(sentenca)
        regras.append(Regra(tipo=tipo, descricao=ligadas.get(chave, sentenca), revisar=revisar))
    return regras


def _corpo(insumo: str, diretriz: str, regras: list[Regra], projetos: list[str], softwares: list[str]) -> str:
    linhas = [f"# {insumo}", "", "## Diretriz original", ""]
    linhas += [f"> {linha}" if linha.strip() else ">" for linha in diretriz.splitlines()]
    linhas += ["", "## Regras", ""]
    linhas += [regra.como_linha() for regra in regras] or ["- *(nenhuma regra extraída)*"]
    linhas += ["", "## Interligações", ""]
    linhas.append("- Projetos: " + (", ".join(f"[[{p}]]" for p in projetos) if projetos else "—"))
    linhas.append("- Softwares: " + (", ".join(f"[[{s}]]" for s in softwares) if softwares else "—"))
    return "\n".join(linhas)


def _contem(termo: str, alvo_normalizado: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(termo)}(?![a-z0-9])", alvo_normalizado) is not None


def _eh_estrutural(insumo: str, texto: str) -> bool:
    alvo = normalizar(f"{insumo} {texto}")
    return any(_contem(termo, alvo) for termo in _TERMOS_ESTRUTURAIS)


def _janela(texto: str) -> int:
    for casamento in _DIAS.finditer(texto):
        trecho = normalizar(texto[max(0, casamento.start() - 120) : casamento.end()])
        if any(
            t in trecho
            for t in ("duplicid", "duplicad", "novo", "nova", "intervalo", "reincid", "faturad", "repetid", "recompra", "menos de", "dentro de")
        ):
            return int(casamento.group(1))
    return JANELA_DUPLICIDADE_PADRAO


def _tolerancia(texto: str) -> float | None:
    casamento = _PERCENTUAL.search(texto)
    if not casamento:
        return None
    return _valor_numerico(casamento.group(1))


def _unidades_bloqueadas(texto: str, unidade_valida: str) -> list[str]:
    """Unidades de campo citadas em sentenças que falam de unidade/lançamento."""
    bloqueadas: set[str] = set()
    for sentenca in sentencas(texto):
        alvo = normalizar(sentenca)
        if not any(ctx in alvo for ctx in _CONTEXTO_UNIDADE):
            continue
        for termo in AMBIGUAS:
            if _contem(termo, alvo) and normalizar(termo) != normalizar(unidade_valida):
                bloqueadas.add(termo)
    return sorted(bloqueadas)


def _limites_financeiros(texto: str) -> dict[str, float]:
    limites: dict[str, float] = {}
    for casamento in _DINHEIRO.finditer(texto):
        valor = _valor_numerico(casamento.group(2))
        inicio = max(0, casamento.start() - 80)
        contexto = normalizar(texto[inicio : casamento.end()])
        sufixo = texto[casamento.end() : casamento.end() + 30]
        unitario = "unitari" in contexto or _POR_UNIDADE.search(sufixo) is not None
        limites.setdefault("preco_unitario_maximo" if unitario else "teto_orcamentario", valor)
    return limites


def _valor_numerico(bruto: str) -> float:
    texto = bruto.strip().rstrip(".,")
    if "," in texto:
        return float(texto.replace(".", "").replace(",", "."))
    # Sem vírgula decimal: '250.000' é milhar, '480' e '3.5' são valores diretos.
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", texto):
        return float(texto.replace(".", ""))
    return float(texto)
