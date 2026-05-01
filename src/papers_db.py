"""SQLite-backed paper metadata store. Build with scripts/build_papers_db.py."""

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
        # Read-only path; uvicorn handlers run in a threadpool, so disable check.
        _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
    return _CONN


def load_paper(paper_id: str) -> Optional[dict]:
    """Return the paper as a dict matching the data/raw/enriched/*.json shape."""
    row = get_conn().execute(
        "SELECT * FROM papers WHERE paper_id = ?", (paper_id,)
    ).fetchone()
    if row is None:
        return None
    d = dict(row)
    for col in ("authors_json", "categories_json", "sections_json", "figures_json"):
        d[col[:-5]] = json.loads(d.pop(col))
    return d


# Omit sections_json / figures_json: ~100x faster listings since the home page
# never renders them.
_SUMMARY_COLUMNS = "paper_id, title, abstract, date, url, authors_json"


def list_paper_summaries(
    paper_ids: Optional[list[str]] = None,
    limit: Optional[int] = None,
):
    """Stream lightweight paper summaries."""
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
