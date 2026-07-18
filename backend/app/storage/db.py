"""SQLite store: the small, structured state that must persist between the
monthly ML job and the real-time optimizer.

Three tables:
  * universe  -- one row per ETF with fund attributes (refreshed each run)
  * scores    -- dated snapshot of cut-probability + risk bucket per ETF
  * runs      -- metadata/metrics for each pipeline run (model monitoring)

The optimizer reads the latest `scores` snapshot; it never re-runs the model.
"""
from __future__ import annotations

import json
import math
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

from .. import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS universe (
    ticker        TEXT PRIMARY KEY,
    name          TEXT,
    category      TEXT,
    provider      TEXT,
    expense_ratio REAL,
    age_months    INTEGER,
    last_price    REAL,
    dist_yield    REAL,
    eligible      INTEGER,
    screen_reason TEXT
);

CREATE TABLE IF NOT EXISTS scores (
    run_date         TEXT,
    ticker           TEXT,
    prob_cut         REAL,
    risk_category    TEXT,
    payout_trend     REAL,
    payout_stability REAL,
    ever_cut         INTEGER,
    price_trend      REAL,
    dist_yield       REAL,
    PRIMARY KEY (run_date, ticker)
);

CREATE TABLE IF NOT EXISTS runs (
    run_date        TEXT PRIMARY KEY,
    n_etfs          INTEGER,
    n_eligible      INTEGER,
    model_auc       REAL,
    baseline_auc    REAL,
    rule_auc        REAL,
    risky_precision REAL,
    data_source     TEXT,
    notes           TEXT,
    created_at      TEXT
);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        # JSON blobs on the fixed-column legacy tables, added via guarded ALTER
        # so re-runs (and existing perch.db files) are no-ops.
        for table, column in (("runs", "metrics_json"), ("scores", "explain_json")):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
            except sqlite3.OperationalError:
                pass  # column already exists


def upsert_universe(rows: list[dict]) -> None:
    with connect() as conn:
        conn.executemany(
            """INSERT INTO universe
               (ticker, name, category, provider, expense_ratio, age_months,
                last_price, dist_yield, eligible, screen_reason)
               VALUES (:ticker, :name, :category, :provider, :expense_ratio,
                       :age_months, :last_price, :dist_yield, :eligible, :screen_reason)
               ON CONFLICT(ticker) DO UPDATE SET
                 name=excluded.name, category=excluded.category,
                 provider=excluded.provider, expense_ratio=excluded.expense_ratio,
                 age_months=excluded.age_months, last_price=excluded.last_price,
                 dist_yield=excluded.dist_yield, eligible=excluded.eligible,
                 screen_reason=excluded.screen_reason""",
            rows,
        )


def write_scores(run_date: str, rows: list[dict]) -> None:
    params = []
    for r in rows:
        explain = r.get("explain")
        params.append({
            "run_date": run_date,
            "ticker": r["ticker"],
            "prob_cut": r.get("prob_cut"),
            "risk_category": r.get("risk_category"),
            "payout_trend": r.get("payout_trend"),
            "payout_stability": r.get("payout_stability"),
            "ever_cut": r.get("ever_cut"),
            "price_trend": r.get("price_trend"),
            "dist_yield": r.get("dist_yield"),
            "explain_json": json.dumps(_json_safe(explain)) if explain is not None else None,
        })
    with connect() as conn:
        conn.execute("DELETE FROM scores WHERE run_date = ?", (run_date,))
        conn.executemany(
            """INSERT INTO scores
               (run_date, ticker, prob_cut, risk_category, payout_trend,
                payout_stability, ever_cut, price_trend, dist_yield, explain_json)
               VALUES (:run_date, :ticker, :prob_cut, :risk_category,
                       :payout_trend, :payout_stability, :ever_cut,
                       :price_trend, :dist_yield, :explain_json)""",
            params,
        )


def _json_safe(obj):
    """Recursively convert NaN/inf floats to None so the JSON blob is strict-parseable."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    return obj


def write_run(meta: dict) -> None:
    meta = {"created_at": datetime.utcnow().isoformat(timespec="seconds"), **meta}
    metrics = meta.pop("metrics", None)
    meta["metrics_json"] = json.dumps(_json_safe(metrics)) if metrics is not None else None
    with connect() as conn:
        conn.execute(
            """INSERT INTO runs
               (run_date, n_etfs, n_eligible, model_auc, baseline_auc, rule_auc,
                risky_precision, data_source, notes, created_at, metrics_json)
               VALUES (:run_date, :n_etfs, :n_eligible, :model_auc, :baseline_auc,
                       :rule_auc, :risky_precision, :data_source, :notes, :created_at,
                       :metrics_json)
               ON CONFLICT(run_date) DO UPDATE SET
                 n_etfs=excluded.n_etfs, n_eligible=excluded.n_eligible,
                 model_auc=excluded.model_auc, baseline_auc=excluded.baseline_auc,
                 rule_auc=excluded.rule_auc, risky_precision=excluded.risky_precision,
                 data_source=excluded.data_source, notes=excluded.notes,
                 created_at=excluded.created_at, metrics_json=excluded.metrics_json""",
            meta,
        )


def latest_run_date() -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT MAX(run_date) AS d FROM scores").fetchone()
        return row["d"] if row and row["d"] else None


def latest_scores() -> list[dict]:
    rd = latest_run_date()
    if rd is None:
        return []
    with connect() as conn:
        rows = conn.execute(
            """SELECT s.*, u.name, u.category, u.provider, u.last_price,
                      u.expense_ratio, u.age_months, u.eligible, u.screen_reason
               FROM scores s JOIN universe u ON u.ticker = s.ticker
               WHERE s.run_date = ?
               ORDER BY s.prob_cut DESC""",
            (rd,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        blob = d.pop("explain_json", None)
        d["explain"] = _parse_json(blob)
        out.append(d)
    return out


def _parse_json(blob):
    if not blob:
        return None
    try:
        return json.loads(blob)
    except (ValueError, TypeError):
        return None


def latest_run_info() -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM runs ORDER BY run_date DESC LIMIT 1"
        ).fetchone()
        if not row:
            return None
    info = dict(row)
    # Merge the parsed v2 decision metrics up into the top-level dict so callers
    # (e.g. /api/run-info) get them alongside the legacy columns.
    blob = info.pop("metrics_json", None)
    if blob:
        try:
            parsed = json.loads(blob)
            if isinstance(parsed, dict):
                info.update(parsed)
        except (ValueError, TypeError):
            pass
    return info
