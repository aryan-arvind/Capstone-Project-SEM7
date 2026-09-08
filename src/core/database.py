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

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from src.core.audit import calculate_decision_hash

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
    rationale TEXT NOT NULL,
    execution_tier TEXT DEFAULT 'AUTO_EXECUTE',
    total_allocated_cost REAL DEFAULT 0.0,
    previous_hash TEXT,
    entry_hash TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    date TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    grand_total REAL NOT NULL,
    verification_status TEXT NOT NULL,
    raw_payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_date
    ON invoices(date);

CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON invoices(verification_status);

CREATE TABLE IF NOT EXISTS inventory_items (
    item_id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    current_stock REAL NOT NULL,
    min_threshold REAL NOT NULL,
    reorder_quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    category TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_category
    ON inventory_items(category);
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
        
        # Check and apply migrations for existing decision_log tables
        cur.execute("PRAGMA table_info(decision_log)")
        columns = [col[1] for col in cur.fetchall()]
        if "execution_tier" not in columns:
            cur.execute("ALTER TABLE decision_log ADD COLUMN execution_tier TEXT DEFAULT 'AUTO_EXECUTE'")
        if "total_allocated_cost" not in columns:
            cur.execute("ALTER TABLE decision_log ADD COLUMN total_allocated_cost REAL DEFAULT 0.0")
        if "previous_hash" not in columns:
            cur.execute("ALTER TABLE decision_log ADD COLUMN previous_hash TEXT")
        if "entry_hash" not in columns:
            cur.execute("ALTER TABLE decision_log ADD COLUMN entry_hash TEXT")

        # Seed baseline inventory items if empty
        cur.execute("SELECT COUNT(*) FROM inventory_items")
        if cur.fetchone()[0] == 0:
            cur.executemany("""
                INSERT INTO inventory_items (item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                ("SKU-001", "Industrial Bearing Model X", 5.0, 20.0, 50.0, 1000.0, "Mechanical"),
                ("SKU-002", "High-Temp Synthetic Lubricant", 60.0, 30.0, 40.0, 250.0, "Consumables"),
                ("SKU-003", "Hydraulic Seal Ring", 45.0, 40.0, 100.0, 120.0, "Mechanical"),
                ("SKU-1001", "4U Rack 500 D", 4.0, 10.0, 15.0, 2500.0, "Hardware"),
            ])

        # Seed sample verified invoices if empty
        cur.execute("SELECT COUNT(*) FROM invoices")
        if cur.fetchone()[0] == 0:
            sample_invoices = [
                (
                    "1410515599",
                    "Dell International Services India Pvt. Ltd.",
                    "2024-01-15",
                    150000.0,
                    27000.0,
                    177000.0,
                    "VALIDATED",
                    json.dumps({
                        "supplier_gstin": "29AABCD1234E1Z5",
                        "customer_gstin": "27AAACW1234P1Z1",
                        "po_number": "PO-2024-0891",
                        "payment_terms": "Net 30",
                        "item_name": "PowerEdge Server R750",
                        "quantity": 1.0,
                        "unit_price": 150000.0,
                        "tax_rate_pct": 18.0,
                        "document_text": "Dell invoice 1410515599 dated 2024-01-15 for PowerEdge Server R750",
                    })
                ),
                (
                    "INV-2024-002",
                    "Apex Industrial Supplies Ltd.",
                    "2024-01-20",
                    50000.0,
                    9000.0,
                    59000.0,
                    "VALIDATED",
                    json.dumps({
                        "supplier_gstin": "07AAACR4567B1Z2",
                        "customer_gstin": "27AAACW1234P1Z1",
                        "po_number": "PO-2024-0892",
                        "payment_terms": "Immediate",
                        "item_name": "Industrial Bearing Model X",
                        "quantity": 50.0,
                        "unit_price": 1000.0,
                        "tax_rate_pct": 18.0,
                        "document_text": "Apex Industrial Supplies Invoice INV-2024-002",
                    })
                ),
            ]
            cur.executemany("""
                INSERT INTO invoices (invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, sample_invoices)


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


def get_latest_decision_hash(business_id: int) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT entry_hash FROM decision_log WHERE business_id = ? ORDER BY id DESC LIMIT 1",
            (business_id,),
        )
        row = cur.fetchone()
        return row["entry_hash"] if row else None


def log_decision(
    business_id: int,
    query: str,
    inventory_recommendation: str,
    finance_recommendation: str,
    conflict_detected: bool,
    final_decision: str,
    rationale: str,
    execution_tier: str = "AUTO_EXECUTE",
    total_allocated_cost: float = 0.0,
) -> int:
    prev_hash = get_latest_decision_hash(business_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    entry_hash = calculate_decision_hash(
        previous_hash=prev_hash,
        timestamp=now_iso,
        business_id=business_id,
        total_allocated_cost=total_allocated_cost,
        decision_summary=rationale,
        execution_tier=execution_tier,
    )

    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO decision_log
                (business_id, timestamp, query, inventory_recommendation,
                 finance_recommendation, conflict_detected, final_decision, rationale,
                 execution_tier, total_allocated_cost, previous_hash, entry_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                business_id,
                now_iso,
                query,
                inventory_recommendation,
                finance_recommendation,
                int(conflict_detected),
                final_decision,
                rationale,
                execution_tier,
                total_allocated_cost,
                prev_hash,
                entry_hash,
            ),
        )
        return cur.lastrowid


def get_decision_history(business_id: int, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM decision_log
            WHERE business_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (business_id, limit),
        )
        return [dict(row) for row in cur.fetchall()]


def get_all_businesses() -> list[dict]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM business_profile ORDER BY id ASC")
        return [dict(row) for row in cur.fetchall()]

