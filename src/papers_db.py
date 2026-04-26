"""
papers_db.py — SQLite-backed runtime store for paper metadata.

Replaces the per-file reads of data/raw/enriched/{paper_id}.json that app.py
used to do via _load_paper(). One sqlite3 connection per process, opened
lazily on first lookup. Read-only by design: check_same_thread=False is safe
because we never write from app.py (uvicorn runs handlers in a threadpool).

Build the database once with: python scripts/build_papers_db.py
"""

import json
import os
import sqlite3
from typing import Optional

import config


_CONN: Optional[sqlite3.Connection] = None
DB_PATH = os.path.join(config.DATA_DIR, "papers.db")


def get_conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        if not os.path.exists(DB_PATH):
            raise FileNotFoundError(
                f"{DB_PATH} missing. Run: python scripts/build_papers_db.py"
            )
        _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
    return _CONN


def load_paper(paper_id: str) -> Optional[dict]:
    """Return a paper as a dict in the same shape consumers expect from
    data/raw/enriched/*.json. None if the paper_id isn't present.
    """
    row = get_conn().execute(
        "SELECT * FROM papers WHERE paper_id = ?", (paper_id,)
    ).fetchone()
    if row is None:
        return None
    d = dict(row)
    for col in ("authors_json", "categories_json", "sections_json", "figures_json"):
        d[col[:-5]] = json.loads(d.pop(col))
    return d


# Columns surfaced by /api/papers — deliberately omits the heavy
# sections_json / figures_json so listings don't pay to deserialize text
# they don't render. ~100× faster than 10k _load_paper() round-trips for
# the no-filter listing on the home page.
_SUMMARY_COLUMNS = "paper_id, title, abstract, date, url, authors_json"


def list_paper_summaries(
    paper_ids: Optional[list[str]] = None,
    limit: Optional[int] = None,
):
    """Stream lightweight paper summaries in one SQL query.

    If `paper_ids` is None, returns all papers (optionally limited).
    If provided, filters to that set (preserves SQLite's natural row order
    in the result; caller can re-order if needed).
    """
    sql = f"SELECT {_SUMMARY_COLUMNS} FROM papers"
    params: tuple = ()
    if paper_ids is not None:
        if not paper_ids:
            return
        placeholders = ",".join("?" * len(paper_ids))
        sql += f" WHERE paper_id IN ({placeholders})"
        params = tuple(paper_ids)
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    cur = get_conn().execute(sql, params)
    for row in cur:
        d = dict(row)
        d["authors"] = json.loads(d.pop("authors_json"))
        yield d
