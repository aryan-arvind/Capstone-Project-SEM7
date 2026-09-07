"""
Database Management & Unified Schema Layer for Capstone Project.
Maintains a single source of truth in SQLite (decision_log table).
"""

import os
import json
import sqlite3
import logging
from typing import Dict, Any, List, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = os.path.join("data", "capstone.db")


@contextmanager
def get_connection(db_path: str = DEFAULT_DB_PATH):
    """Context manager for SQLite connection with explicit closure for Windows safety."""
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """
    Initializes decision_log table schema and runs idempotent migrations.
    Also creates Layer 0 Staging Tables for heterogeneous SME Data Digitalization.
    """
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS decision_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_id INTEGER DEFAULT 1,
                timestamp TEXT NOT NULL,
                final_decision TEXT NOT NULL,
                rationale TEXT NOT NULL,
                prev_hash TEXT,
                curr_hash TEXT,
                transaction_id TEXT,
                action_status TEXT DEFAULT 'PENDING'
            );
        """)
        
        # Idempotent Column Migrations for decision_log
        cursor.execute("PRAGMA table_info(decision_log)")
        existing_cols = [row["name"] for row in cursor.fetchall()]

        migration_cols = [
            ("business_id", "INTEGER DEFAULT 1"),
            ("timestamp", "TEXT DEFAULT ''"),
            ("final_decision", "TEXT DEFAULT ''"),
            ("rationale", "TEXT DEFAULT ''"),
            ("prev_hash", "TEXT"),
            ("curr_hash", "TEXT"),
            ("transaction_id", "TEXT"),
            ("action_status", "TEXT DEFAULT 'PENDING'")
        ]

        for col_name, col_type in migration_cols:
            if col_name not in existing_cols:
                cursor.execute(f"ALTER TABLE decision_log ADD COLUMN {col_name} {col_type};")

        # Layer 0 Staging Tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS import_batch (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_id INTEGER NOT NULL DEFAULT 1,
                source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'xlsx', 'manual', 'ocr', 'pdf')),
                original_filename TEXT,
                uploaded_at TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'PARTIALLY_CONFIRMED')),
                total_rows INTEGER NOT NULL,
                valid_rows INTEGER NOT NULL,
                error_rows INTEGER NOT NULL,
                column_mapping_json TEXT
            );
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS staged_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_batch_id INTEGER NOT NULL REFERENCES import_batch(id),
                row_number INTEGER NOT NULL,
                raw_row_json TEXT NOT NULL,
                parsed_record_json TEXT,
                validation_status TEXT NOT NULL CHECK (validation_status IN ('VALID', 'WARNING', 'ERROR', 'DUPLICATE')),
                validation_notes TEXT,
                dedup_hash TEXT,
                committed INTEGER NOT NULL DEFAULT 0
            );
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS column_mapping_template (
                business_id INTEGER PRIMARY KEY,
                mapping_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)

        conn.commit()


def log_decision(
    final_decision: str,
    rationale: str,
    business_id: int = 1,
    timestamp_str: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH
) -> int:
    """
    Inserts a newly arbitrated decision into decision_log. Returns decision_log_id (lastrowid).
    """
    init_db(db_path)
    import datetime
    ts = timestamp_str or datetime.datetime.now(datetime.timezone.utc).isoformat()

    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO decision_log (business_id, timestamp, final_decision, rationale, action_status)
            VALUES (?, ?, ?, ?, 'PENDING')
        """, (business_id, ts, final_decision, rationale))
        conn.commit()
        return cursor.lastrowid


def get_decision_log(decision_log_id: int, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    """
    Fetches a single decision_log record by ID.
    """
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM decision_log WHERE id = ?", (decision_log_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_action_status(
    decision_log_id: int,
    action_status: str,
    transaction_id: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH
) -> None:
    """
    Updates the action_status and transaction_id of a decision_log record.
    """
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        if transaction_id is not None:
            cursor.execute("""
                UPDATE decision_log
                SET action_status = ?, transaction_id = ?
                WHERE id = ?
            """, (action_status, transaction_id, decision_log_id))
        else:
            cursor.execute("""
                UPDATE decision_log
                SET action_status = ?
                WHERE id = ?
            """, (action_status, decision_log_id))
        conn.commit()


def get_all_decision_logs(business_id: Optional[int] = 1, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """
    Returns all decision_log records ordered by id.
    """
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA table_info(decision_log)")
            cols = [r["name"] for r in cursor.fetchall()]
            if "business_id" in cols and business_id is not None:
                cursor.execute("SELECT * FROM decision_log WHERE business_id = ? ORDER BY id ASC", (business_id,))
            else:
                cursor.execute("SELECT * FROM decision_log ORDER BY id ASC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except sqlite3.OperationalError:
            try:
                cursor.execute("SELECT * FROM decision_log ORDER BY id ASC")
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            except Exception:
                return []


def create_import_batch(
    business_id: int,
    source_type: str,
    original_filename: str,
    total_rows: int,
    valid_rows: int,
    error_rows: int,
    column_mapping: Dict[str, Any],
    db_path: str = DEFAULT_DB_PATH
) -> int:
    """Creates a new import batch record in staging table import_batch."""
    init_db(db_path)
    import datetime
    ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO import_batch
            (business_id, source_type, original_filename, uploaded_at, status, total_rows, valid_rows, error_rows, column_mapping_json)
            VALUES (?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?)
        """, (business_id, source_type, original_filename, ts, total_rows, valid_rows, error_rows, json.dumps(column_mapping)))
        conn.commit()
        return cursor.lastrowid


def insert_staged_record(
    import_batch_id: int,
    row_number: int,
    raw_row: Dict[str, Any],
    parsed_record: Optional[Dict[str, Any]],
    validation_status: str,
    validation_notes: str,
    dedup_hash: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH
) -> int:
    """Inserts a raw + normalized row into staged_records for human review."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO staged_records
            (import_batch_id, row_number, raw_row_json, parsed_record_json, validation_status, validation_notes, dedup_hash, committed)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            import_batch_id, row_number,
            json.dumps(raw_row),
            json.dumps(parsed_record) if parsed_record else None,
            validation_status, validation_notes, dedup_hash
        ))
        conn.commit()
        return cursor.lastrowid


def get_staged_records(import_batch_id: int, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """Retrieves all staged records for a given import batch."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM staged_records WHERE import_batch_id = ? ORDER BY row_number ASC", (import_batch_id,))
        return [dict(r) for r in cursor.fetchall()]


def commit_staged_records(import_batch_id: int, record_ids_to_commit: List[int], db_path: str = DEFAULT_DB_PATH) -> int:
    """
    Commits approved staged records into live operational SQLite database tables (inventory_items / invoices).
    Marks staged_records as committed=1 and import_batch as CONFIRMED.
    """
    init_db(db_path)
    committed_count = 0
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        for rec_id in record_ids_to_commit:
            cursor.execute("SELECT * FROM staged_records WHERE id = ? AND import_batch_id = ?", (rec_id, import_batch_id))
            row = cursor.fetchone()
            if not row or row["committed"] == 1:
                continue
            
            parsed = json.loads(row["parsed_record_json"]) if row["parsed_record_json"] else None
            if parsed:
                # If inventory record shape
                if "item_name" in parsed or "current_stock" in parsed:
                    item_id = parsed.get("item_id", f"SKU-{rec_id}")
                    item_name = parsed.get("item_name", f"Staged-Item-{rec_id}")
                    stock = float(parsed.get("current_stock", 0.0))
                    min_thresh = float(parsed.get("min_threshold", 10.0))
                    reorder_qty = float(parsed.get("reorder_quantity", 50.0))
                    cost = float(parsed.get("unit_cost", 0.0))
                    cat = parsed.get("category", "General")
                    cursor.execute("""
                        INSERT OR REPLACE INTO inventory_items
                        (item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (item_id, item_name, stock, min_thresh, reorder_qty, cost, cat))
                elif "invoice_id" in parsed or "grand_total" in parsed:
                    inv_id = parsed.get("invoice_id", f"INV-{rec_id}")
                    supp = parsed.get("supplier_name", "Staged Supplier")
                    dt = parsed.get("date", "2026-09-07")
                    sub = float(parsed.get("subtotal", 0.0))
                    tax = float(parsed.get("tax_amount", 0.0))
                    grand = float(parsed.get("grand_total", sub + tax))
                    status = parsed.get("verification_status", "VALIDATED")
                    cursor.execute("""
                        INSERT OR REPLACE INTO invoices
                        (invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (inv_id, supp, dt, sub, tax, grand, status, json.dumps(parsed)))

            cursor.execute("UPDATE staged_records SET committed = 1 WHERE id = ?", (rec_id,))
            committed_count += 1

        cursor.execute("UPDATE import_batch SET status = 'CONFIRMED' WHERE id = ?", (import_batch_id,))
        conn.commit()
    return committed_count
