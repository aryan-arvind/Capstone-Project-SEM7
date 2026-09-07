"""
SQLite schema and access layer for the Capstone MVP.

Owns three tables:
  - business_profile : one row per onboarded business
  - operational_data  : unified sales / restock / expense ledger (30-day history)
  - decision_log      : audit trail of every arbitration decision

Domain agents (inventory_agent.py, finance_agent.py) must only touch the
database through `run_readonly_query`, which enforces SELECT-only access so
agents can never mutate state — they read, the arbitration engine decides,
and the API layer is the only writer.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "capstone.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS business_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    cash_balance REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operational_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES business_profile(id),
    record_date TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN ('sale', 'restock', 'expense')),
    sku TEXT,
    product_name TEXT,
    quantity INTEGER,
    unit_cost REAL,
    unit_price REAL,
    amount REAL NOT NULL,
    stock_on_hand INTEGER,
    reorder_level INTEGER,
    category TEXT
);

CREATE INDEX IF NOT EXISTS idx_operational_business_date
    ON operational_data(business_id, record_date);

CREATE INDEX IF NOT EXISTS idx_operational_business_sku
    ON operational_data(business_id, sku);

CREATE TABLE IF NOT EXISTS decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES business_profile(id),
    timestamp TEXT NOT NULL,
    query TEXT,
    inventory_recommendation TEXT,
    finance_recommendation TEXT,
    conflict_detected INTEGER NOT NULL,
    final_decision TEXT NOT NULL,
    rationale TEXT NOT NULL
);
"""


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_cursor(commit: bool = False):
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_cursor(commit=True) as cur:
        cur.executescript(SCHEMA)


def run_readonly_query(query: str, params: tuple = ()) -> list[dict]:
    """The only DB entry point domain agents are allowed to use.

    Rejects anything that isn't a single SELECT statement so agents can be
    trusted with arbitrary, model-generated SQL without risking writes.
    """
    stripped = query.strip().rstrip(";").strip()
    if not stripped.lower().startswith("select"):
        raise ValueError("run_readonly_query only accepts SELECT statements")
    if ";" in stripped:
        raise ValueError("run_readonly_query does not allow multiple statements")

    with get_cursor() as cur:
        cur.execute(stripped, params)
        rows = cur.fetchall()
        return [dict(row) for row in rows]


def create_business(business_name: str, business_type: str, owner_name: str, cash_balance: float) -> int:
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO business_profile (business_name, business_type, owner_name, cash_balance, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (business_name, business_type, owner_name, cash_balance, datetime.now(timezone.utc).isoformat()),
        )
        return cur.lastrowid


def get_business(business_id: int) -> dict | None:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM business_profile WHERE id = ?", (business_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def update_cash_balance(business_id: int, new_balance: float) -> None:
    with get_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE business_profile SET cash_balance = ? WHERE id = ?",
            (new_balance, business_id),
        )


def insert_operational_record(record: dict) -> None:
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO operational_data
                (business_id, record_date, record_type, sku, product_name,
                 quantity, unit_cost, unit_price, amount, stock_on_hand,
                 reorder_level, category)
            VALUES (:business_id, :record_date, :record_type, :sku, :product_name,
                    :quantity, :unit_cost, :unit_price, :amount, :stock_on_hand,
                    :reorder_level, :category)
            """,
            record,
        )


def insert_operational_records_bulk(records: list[dict]) -> None:
    if not records:
        return
    with get_cursor(commit=True) as cur:
        cur.executemany(
            """
            INSERT INTO operational_data
                (business_id, record_date, record_type, sku, product_name,
                 quantity, unit_cost, unit_price, amount, stock_on_hand,
                 reorder_level, category)
            VALUES (:business_id, :record_date, :record_type, :sku, :product_name,
                    :quantity, :unit_cost, :unit_price, :amount, :stock_on_hand,
                    :reorder_level, :category)
            """,
            records,
        )


def log_decision(
    business_id: int,
    query: str,
    inventory_recommendation: str,
    finance_recommendation: str,
    conflict_detected: bool,
    final_decision: str,
    rationale: str,
) -> int:
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO decision_log
                (business_id, timestamp, query, inventory_recommendation,
                 finance_recommendation, conflict_detected, final_decision, rationale)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                business_id,
                datetime.now(timezone.utc).isoformat(),
                query,
                inventory_recommendation,
                finance_recommendation,
                int(conflict_detected),
                final_decision,
                rationale,
            ),
        )
        return cur.lastrowid
