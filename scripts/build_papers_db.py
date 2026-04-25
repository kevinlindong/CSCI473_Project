"""
build_papers_db.py — Build data/papers.db from data/raw/enriched/*.json.

Idempotent: drops and recreates the `papers` table on every run. Wrap inserts
in a single transaction (~10× faster than autocommit at 10k papers).

Schema kept in sync with what src/papers_db.py::load_paper() expects.

Usage:
    python scripts/build_papers_db.py
"""

import json
import logging
import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)


SCHEMA = """
CREATE TABLE papers (
  paper_id          TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  abstract          TEXT NOT NULL,
  date              TEXT NOT NULL,
  url               TEXT NOT NULL,
  primary_category  TEXT NOT NULL,
  authors_json      TEXT NOT NULL,
  categories_json   TEXT NOT NULL,
  sections_json     TEXT NOT NULL,
  figures_json      TEXT NOT NULL
);
CREATE INDEX idx_papers_primary_category ON papers(primary_category);
"""


def _row_from_json(p: dict) -> tuple:
    return (
        p["paper_id"],
        p.get("title", ""),
        p.get("abstract", ""),
        p.get("date", ""),
        p.get("url", "") or f"https://arxiv.org/abs/{p['paper_id']}",
        p.get("primary_category", ""),
        json.dumps(p.get("authors", [])),
        json.dumps(p.get("categories", [])),
        json.dumps(p.get("sections", [])),
        json.dumps(p.get("figures", [])),
    )


def main():
    db_path = os.path.join(config.DATA_DIR, "papers.db")
    if not os.path.isdir(config.RAW_DIR):
        raise SystemExit(f"{config.RAW_DIR} missing — run scripts/fetch_papers.py first")

    files = sorted(f for f in os.listdir(config.RAW_DIR) if f.endswith(".json"))
    if not files:
        raise SystemExit(f"{config.RAW_DIR} empty — nothing to ingest")

    logger.info("Building %s from %d papers in %s", db_path, len(files), config.RAW_DIR)

    if os.path.exists(db_path):
        os.remove(db_path)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    rows = []
    for fn in files:
        with open(os.path.join(config.RAW_DIR, fn)) as fh:
            rows.append(_row_from_json(json.load(fh)))

    conn.executemany(
        "INSERT INTO papers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    conn.commit()

    n = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
    size_mb = os.path.getsize(db_path) / 1024 / 1024
    logger.info("Wrote %d rows to %s (%.1f MB)", n, db_path, size_mb)
    conn.close()


if __name__ == "__main__":
    main()
