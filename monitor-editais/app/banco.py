"""Banco SQLite: um arquivo só, e o backup é copiar esse arquivo.

Duas decisões de esquema valem explicação:

* `marcacoes` é tabela separada de `editais`. O que uma pessoa marcou ("já
  conhecíamos este") nunca pode ser sobrescrito por uma nova coleta.
* `editais.primeira_coleta_id` não muda quando o edital reaparece. É o que
  permitirá, sem trabalho extra depois, responder "o que apareceu desde a
  semana passada".
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

from . import textos
from .cobertura import Contagem, Cobertura
from .pncp import Falha

ESQUEMA = """
CREATE TABLE IF NOT EXISTS coletas (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciada_em           TEXT NOT NULL,
    terminada_em          TEXT,
    uf                    TEXT NOT NULL,
    data_inicial          TEXT NOT NULL,
    data_final            TEXT NOT NULL,
    dias_por_janela       INTEGER NOT NULL,
    modalidades           TEXT NOT NULL,
    consultas_planejadas  INTEGER NOT NULL DEFAULT 0,
    consultas_concluidas  INTEGER NOT NULL DEFAULT 0,
    paginas_lidas         INTEGER NOT NULL DEFAULT 0,
    falhas                INTEGER NOT NULL DEFAULT 0,
    status                TEXT NOT NULL DEFAULT 'em_andamento'
);

CREATE TABLE IF NOT EXISTS falhas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    coleta_id      INTEGER NOT NULL REFERENCES coletas(id) ON DELETE CASCADE,
    modalidade     INTEGER NOT NULL,
    janela_inicio  TEXT NOT NULL,
    janela_fim     TEXT NOT NULL,
    pagina         INTEGER NOT NULL,
    motivo         TEXT NOT NULL,
    http           INTEGER,
    detalhe        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS editais (
    id_pncp             TEXT PRIMARY KEY,
    publicacao          TEXT NOT NULL DEFAULT '',
    abertura            TEXT NOT NULL DEFAULT '',
    encerramento        TEXT NOT NULL DEFAULT '',
    municipio           TEXT NOT NULL DEFAULT '',
    uf                  TEXT NOT NULL DEFAULT '',
    orgao               TEXT NOT NULL DEFAULT '',
    modalidade_codigo   INTEGER,
    modalidade_nome     TEXT NOT NULL DEFAULT '',
    objeto              TEXT NOT NULL DEFAULT '',
    valor               REAL,
    situacao            TEXT NOT NULL DEFAULT '',
    link                TEXT NOT NULL DEFAULT '',
    primeira_coleta_id  INTEGER,
    ultima_coleta_id    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_editais_coleta     ON editais(ultima_coleta_id);
CREATE INDEX IF NOT EXISTS idx_editais_municipio  ON editais(municipio);
CREATE INDEX IF NOT EXISTS idx_editais_publicacao ON editais(publicacao);

CREATE TABLE IF NOT EXISTS marcacoes (
    id_pncp         TEXT PRIMARY KEY,
    ja_conheciamos  INTEGER NOT NULL DEFAULT 0,
    situacao        TEXT NOT NULL DEFAULT '',
    nota            TEXT NOT NULL DEFAULT '',
    atualizado_em   TEXT NOT NULL
);
"""


def _agora() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def abrir(caminho: str | Path = "dados/monitor.sqlite3") -> sqlite3.Connection:
    caminho = Path(caminho)
    if str(caminho) != ":memory:":
        caminho.parent.mkdir(parents=True, exist_ok=True)
    conexao = sqlite3.connect(caminho)
    conexao.row_factory = sqlite3.Row
    conexao.execute("PRAGMA foreign_keys = ON")
    # Comparar município sem acento dentro do SQL: acento na configuração e
    # acento na API divergem, e a diferença devolve zero em silêncio.
    conexao.create_function("sem_acento", 1, textos.remover_acento, deterministic=True)
    conexao.executescript(ESQUEMA)
    return conexao


# ------------------------------------------------------------------- coletas


def iniciar_coleta(
    conexao: sqlite3.Connection,
    *,
    uf: str,
    data_inicial,
    data_final,
    dias_por_janela: int,
    modalidades: Sequence[int],
    consultas_planejadas: int,
) -> int:
    cursor = conexao.execute(
        """INSERT INTO coletas (iniciada_em, uf, data_inicial, data_final,
                                dias_por_janela, modalidades, consultas_planejadas)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (_agora(), uf, str(data_inicial), str(data_final), dias_por_janela,
         ",".join(str(m) for m in modalidades), consultas_planejadas),
    )
    conexao.commit()
    return int(cursor.lastrowid)


def registrar_falha(conexao: sqlite3.Connection, coleta_id: int, falha: Falha) -> None:
    conexao.execute(
        """INSERT INTO falhas (coleta_id, modalidade, janela_inicio, janela_fim,
                               pagina, motivo, http, detalhe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (coleta_id, falha.modalidade, str(falha.inicio), str(falha.fim),
         falha.pagina, falha.motivo, falha.http, falha.detalhe),
    )


def anotar_progresso(
    conexao: sqlite3.Connection, coleta_id: int, *, concluidas: int,
    paginas: int, falhas: int
) -> None:
    conexao.execute(
        """UPDATE coletas SET consultas_concluidas = ?, paginas_lidas = ?, falhas = ?
           WHERE id = ?""",
        (concluidas, paginas, falhas, coleta_id),
    )
    conexao.commit()


def finalizar_coleta(conexao: sqlite3.Connection, coleta_id: int, cobertura: Cobertura) -> None:
    conexao.execute(
        """UPDATE coletas SET terminada_em = ?, consultas_concluidas = ?,
                              falhas = ?, status = ? WHERE id = ?""",
        (_agora(), cobertura.concluidas, cobertura.falhas, cobertura.status, coleta_id),
    )
    conexao.commit()


def cobertura_da_coleta(conexao: sqlite3.Connection, coleta_id: int) -> Cobertura:
    linha = conexao.execute(
        "SELECT consultas_planejadas, consultas_concluidas, falhas FROM coletas WHERE id = ?",
        (coleta_id,),
    ).fetchone()
    if linha is None:
        raise KeyError(f"coleta {coleta_id} não existe")
    return Cobertura(
        planejadas=linha["consultas_planejadas"],
        concluidas=linha["consultas_concluidas"],
        falhas=linha["falhas"],
    )


def falhas_da_coleta(conexao: sqlite3.Connection, coleta_id: int) -> list[sqlite3.Row]:
    return list(conexao.execute(
        "SELECT * FROM falhas WHERE coleta_id = ? ORDER BY id", (coleta_id,)
    ))


# ------------------------------------------------------------------- editais


def guardar_editais(
    conexao: sqlite3.Connection, coleta_id: int, linhas: Iterable[dict]
) -> int:
    guardados = 0
    for linha in linhas:
        if not linha.get("id_pncp"):
            continue
        conexao.execute(
            """INSERT INTO editais (id_pncp, publicacao, abertura, encerramento,
                                    municipio, uf, orgao, modalidade_codigo,
                                    modalidade_nome, objeto, valor, situacao, link,
                                    primeira_coleta_id, ultima_coleta_id)
               VALUES (:id_pncp, :publicacao, :abertura, :encerramento, :municipio,
                       :uf, :orgao, :modalidade_codigo, :modalidade_nome, :objeto,
                       :valor, :situacao, :link, :coleta, :coleta)
               ON CONFLICT(id_pncp) DO UPDATE SET
                    publicacao       = excluded.publicacao,
                    abertura         = excluded.abertura,
                    encerramento     = excluded.encerramento,
                    municipio        = excluded.municipio,
                    uf               = excluded.uf,
                    orgao            = excluded.orgao,
                    modalidade_codigo= excluded.modalidade_codigo,
                    modalidade_nome  = excluded.modalidade_nome,
                    objeto           = excluded.objeto,
                    valor            = excluded.valor,
                    situacao         = excluded.situacao,
                    link             = excluded.link,
                    ultima_coleta_id = excluded.ultima_coleta_id""",
            {**linha, "coleta": coleta_id},
        )
        guardados += 1
    conexao.commit()
    return guardados


def editais_da_coleta(conexao: sqlite3.Connection, coleta_id: int) -> list[sqlite3.Row]:
    return list(conexao.execute(
        "SELECT * FROM editais WHERE ultima_coleta_id = ? ORDER BY publicacao DESC",
        (coleta_id,),
    ))


def contar_editais(
    conexao: sqlite3.Connection, coleta_id: int, *, municipios: Sequence[str] | None = None
) -> Contagem:
    """Total de editais da coleta, já carregando a cobertura dela."""
    consulta = "SELECT COUNT(*) FROM editais WHERE ultima_coleta_id = ?"
    parametros: list = [coleta_id]
    if municipios:
        alvos = [textos.remover_acento(m) for m in municipios]
        marcadores = ",".join("?" * len(alvos))
        consulta += f" AND sem_acento(municipio) IN ({marcadores})"
        parametros.extend(alvos)
    valor = conexao.execute(consulta, parametros).fetchone()[0]
    return Contagem(int(valor), cobertura_da_coleta(conexao, coleta_id).completa)


def municipios_mais_frequentes(
    conexao: sqlite3.Connection, coleta_id: int, limite: int = 15
) -> list[tuple[str, int]]:
    """Quando o filtro de região devolve zero, mostrar o que a API trouxe é o que
    permite calibrar em vez de adivinhar."""
    linhas = conexao.execute(
        """SELECT municipio, COUNT(*) AS quantos FROM editais
           WHERE ultima_coleta_id = ? GROUP BY municipio
           ORDER BY quantos DESC LIMIT ?""",
        (coleta_id, limite),
    )
    return [(linha["municipio"], linha["quantos"]) for linha in linhas]


# ------------------------------------------------------------------ marcações


def marcar(
    conexao: sqlite3.Connection, id_pncp: str, *, ja_conheciamos: bool | None = None,
    situacao: str | None = None, nota: str | None = None
) -> None:
    atual = conexao.execute(
        "SELECT * FROM marcacoes WHERE id_pncp = ?", (id_pncp,)
    ).fetchone()
    conexao.execute(
        """INSERT INTO marcacoes (id_pncp, ja_conheciamos, situacao, nota, atualizado_em)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id_pncp) DO UPDATE SET
                ja_conheciamos = excluded.ja_conheciamos,
                situacao       = excluded.situacao,
                nota           = excluded.nota,
                atualizado_em  = excluded.atualizado_em""",
        (
            id_pncp,
            int(ja_conheciamos if ja_conheciamos is not None
                else (atual["ja_conheciamos"] if atual else 0)),
            situacao if situacao is not None else (atual["situacao"] if atual else ""),
            nota if nota is not None else (atual["nota"] if atual else ""),
            _agora(),
        ),
    )
    conexao.commit()


def marcacao(conexao: sqlite3.Connection, id_pncp: str) -> sqlite3.Row | None:
    return conexao.execute(
        "SELECT * FROM marcacoes WHERE id_pncp = ?", (id_pncp,)
    ).fetchone()
