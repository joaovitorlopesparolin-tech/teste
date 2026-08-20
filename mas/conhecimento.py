"""Base de conhecimento em Markdown: leitura dos nós e registro de wikilinks."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Iterator

from mas import frontmatter
from mas.frontmatter import CAMPOS_OBRIGATORIOS, FrontmatterInvalido
from mas.modelos import (
    JANELA_DUPLICIDADE_PADRAO,
    NoConhecimento,
    Regra,
    TIPOS_REGRA,
    como_data,
    como_numero,
)
from mas.textos import normalizar, normalizar_centro_de_custo

ARQUIVO_REGISTRO = "_registro.yml"

#: Softwares reconhecidos por padrão para interligação automática de nós.
SOFTWARES_PADRAO: tuple[str, ...] = (
    "Revit",
    "Eberick",
    "AutoCAD",
    "Navisworks",
    "SketchUp",
    "TQS",
    "QiBuilder",
    "AltoQi",
    "Sienge",
    "Robot",
    "Civil 3D",
    "BIM 360",
    "Solibri",
)

_WIKILINK = re.compile(r"\[\[([^\[\]|]+)(?:\|[^\[\]]+)?\]\]")
_REGRA_LINHA = re.compile(r"^\s*[-*]\s*\*\*(?P<tipo>[^:*]+):?\*\*:?\s*(?P<descricao>.+?)\s*$")


class NoInvalido(ValueError):
    """Nó de conhecimento sem os campos exigidos pelo módulo de indexação."""


class Registro:
    """Projetos e softwares conhecidos, usados para interligar os nós."""

    def __init__(self, projetos: Iterable[str] = (), softwares: Iterable[str] = ()) -> None:
        self.projetos = list(dict.fromkeys(projetos))
        self.softwares = list(dict.fromkeys([*SOFTWARES_PADRAO, *softwares]))

    @classmethod
    def carregar(cls, diretorio: str | Path) -> "Registro":
        caminho = Path(diretorio) / ARQUIVO_REGISTRO
        if not caminho.is_file():
            return cls()
        dados = _ler_yaml(caminho.read_text(encoding="utf-8"))
        return cls(projetos=dados.get("projetos") or [], softwares=dados.get("softwares") or [])

    def classificar(self, termo: str) -> str:
        alvo = normalizar(termo)
        if any(normalizar(s) == alvo for s in self.softwares):
            return "software"
        if any(normalizar(p) == alvo for p in self.projetos):
            return "projeto"
        return "projeto" if alvo.startswith(("projeto ", "obra ", "empreendimento ")) else "outro"

    @property
    def termos(self) -> list[str]:
        """Termos ordenados do mais longo para o mais curto (evita link parcial)."""
        return sorted({*self.projetos, *self.softwares}, key=len, reverse=True)


def wikilinks(texto: str) -> list[str]:
    return list(dict.fromkeys(alvo.strip() for alvo in _WIKILINK.findall(texto)))


def carregar_no(caminho: str | Path, registro: Registro | None = None) -> NoConhecimento:
    """Lê um arquivo ``.md`` e devolve o nó de conhecimento correspondente."""
    caminho = Path(caminho)
    texto = caminho.read_text(encoding="utf-8")
    try:
        meta, corpo = frontmatter.carregar(texto)
    except FrontmatterInvalido as erro:
        raise NoInvalido(f"{caminho.name}: {erro}") from erro

    faltando = [campo for campo in CAMPOS_OBRIGATORIOS if not meta.get(campo)]
    if faltando:
        raise NoInvalido(f"{caminho.name}: frontmatter sem os campos {', '.join(faltando)}")

    registro = registro or Registro()
    links = wikilinks(corpo) + wikilinks(" ".join(str(v) for v in meta.values()))
    projetos = list(meta.get("projetos") or [])
    softwares = list(meta.get("softwares") or [])
    for termo in links:
        classe = registro.classificar(termo)
        if classe == "software" and termo not in softwares:
            softwares.append(termo)
        elif classe == "projeto" and termo not in projetos:
            projetos.append(termo)

    return NoConhecimento(
        insumo=str(meta["insumo"]),
        unidade_sienge=str(meta["unidade_sienge"]),
        centro_de_custo=str(meta["centro_de_custo"]),
        data_vigencia=como_data(meta["data_vigencia"], "data_vigencia"),
        regras=_regras_do_corpo(corpo),
        aliases=[str(a) for a in (meta.get("aliases") or [])],
        projetos=projetos,
        softwares=softwares,
        estrutural=bool(meta.get("estrutural", False)),
        janela_duplicidade_dias=int(
            como_numero(meta.get("janela_duplicidade_dias", JANELA_DUPLICIDADE_PADRAO), "janela_duplicidade_dias")
        ),
        tolerancia_quantitativo_percentual=como_numero(
            meta.get("tolerancia_quantitativo_percentual", 0), "tolerancia_quantitativo_percentual"
        ),
        unidades_bloqueadas=[str(u) for u in (meta.get("unidades_bloqueadas") or [])],
        preco_unitario_maximo=_opcional_numero(meta.get("preco_unitario_maximo"), "preco_unitario_maximo"),
        teto_orcamentario=_opcional_numero(meta.get("teto_orcamentario"), "teto_orcamentario"),
        corpo=corpo,
        caminho=caminho,
    )


class BaseConhecimento:
    """Índice dos nós ``.md`` de um diretório."""

    def __init__(self, diretorio: str | Path) -> None:
        self.diretorio = Path(diretorio)
        if not self.diretorio.is_dir():
            raise NotADirectoryError(f"base de conhecimento inexistente: {self.diretorio}")
        self.registro = Registro.carregar(self.diretorio)
        self.nos: list[NoConhecimento] = []
        self.erros: list[str] = []
        for caminho in sorted(self.diretorio.rglob("*.md")):
            if caminho.name.startswith("_"):
                continue
            try:
                self.nos.append(carregar_no(caminho, self.registro))
            except (NoInvalido, ValueError) as erro:
                self.erros.append(str(erro))

    def __iter__(self) -> Iterator[NoConhecimento]:
        return iter(self.nos)

    def __len__(self) -> int:
        return len(self.nos)

    def buscar(
        self,
        insumo: str,
        centro_de_custo: str | None = None,
        data_referencia: date | None = None,
    ) -> NoConhecimento | None:
        """Nó vigente mais específico para o insumo (e centro de custo, se houver).

        Prioriza o nó com centro de custo igual ao da solicitação e, entre os
        vigentes, o de ``data_vigencia`` mais recente.
        """
        candidatos = [no for no in self.nos if no.casa_insumo(insumo)]
        if not candidatos:
            return None
        if data_referencia is not None:
            vigentes = [no for no in candidatos if no.data_vigencia <= data_referencia]
            candidatos = vigentes or candidatos
        chave_cc = normalizar_centro_de_custo(centro_de_custo) if centro_de_custo else None

        def prioridade(no: NoConhecimento) -> tuple[int, date, int]:
            mesmo_cc = 1 if chave_cc and no.chave_centro_de_custo == chave_cc else 0
            especificidade = max(len(c) for c in no.chaves_insumo if normalizar(insumo).startswith(c) or c.startswith(normalizar(insumo)))
            return (mesmo_cc, no.data_vigencia, especificidade)

        return max(candidatos, key=prioridade)


def _regras_do_corpo(corpo: str) -> list[Regra]:
    regras: list[Regra] = []
    for linha in corpo.splitlines():
        casamento = _REGRA_LINHA.match(linha)
        if not casamento:
            continue
        tipo_bruto = casamento.group("tipo").strip()
        tipo = next((t for t in TIPOS_REGRA if normalizar(t) == normalizar(tipo_bruto)), None)
        if tipo is None:
            continue
        descricao = casamento.group("descricao").strip()
        revisar = "revisar" in descricao.lower() and descricao.endswith("*")
        descricao = re.sub(r"\s*\*\(classificação automática — revisar\)\*\s*$", "", descricao)
        regras.append(Regra(tipo=tipo, descricao=descricao, revisar=revisar))
    return regras


def _opcional_numero(valor: Any, campo: str) -> float | None:
    return None if valor in (None, "") else como_numero(valor, campo)


def _ler_yaml(texto: str) -> dict[str, Any]:
    try:
        import yaml
    except ModuleNotFoundError:  # pragma: no cover - fallback sem PyYAML
        return frontmatter._parse_simples(texto)
    dados = yaml.safe_load(texto) or {}
    return dados if isinstance(dados, dict) else {}
