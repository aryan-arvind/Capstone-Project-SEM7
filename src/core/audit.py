"""
Cryptographic Audit Engine for Governed Agentic Commerce.
Implements SQLite-backed SHA-256 hash-chaining for immutable decision logging.
"""

import sqlite3
import hashlib
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Tuple, Dict, Any, Optional, List

DEFAULT_DB_PATH = os.path.join("data", "audit_log.db")


@contextmanager
def get_connection(db_path: str = DEFAULT_DB_PATH):
    """
    Context manager for SQLite connection that guarantees connection closure.
    """
    if db_path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """
    Initializes the decision_log table schema if it does not exist.
    """
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS decision_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                decision_id TEXT NOT NULL,
                transaction_id TEXT,
                timestamp TEXT NOT NULL,
                prev_hash TEXT NOT NULL,
                curr_hash TEXT NOT NULL,
                status TEXT NOT NULL
            );
        """)
        conn.commit()


def calculate_hash(prev_hash: str, timestamp: str, decision_id: str, transaction_id: Optional[str]) -> str:
    """
    Computes SHA-256 digest: SHA256(prev_hash + timestamp + decision_id + transaction_id)
    """
    tx_str = transaction_id if transaction_id is not None else ""
    raw_payload = f"{prev_hash}{timestamp}{decision_id}{tx_str}"
    return hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()


def append_entry(
    decision_id: str,
    transaction_id: Optional[str],
    status: str,
    db_path: str = DEFAULT_DB_PATH
) -> Dict[str, Any]:
    """
    Appends a new decision record to the audit log with SHA-256 hash-chaining.
    
    1. Reads curr_hash of the most recent row (or "GENESIS" if table empty) as prev_hash.
    2. Computes curr_hash = SHA256(prev_hash + timestamp + decision_id + transaction_id).
    3. Inserts the new row and returns the inserted row as a dict.
    """
    init_db(db_path)
    
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        
        # 1. Fetch most recent row's curr_hash
        cursor.execute("SELECT curr_hash FROM decision_log ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        
        prev_hash = row["curr_hash"] if row else "GENESIS"
        
        # 2. Generate ISO UTC timestamp and calculate SHA-256 hash
        timestamp = datetime.now(timezone.utc).isoformat()
        curr_hash = calculate_hash(prev_hash, timestamp, decision_id, transaction_id)
        
        # 3. Insert new row
        cursor.execute(
            """
            INSERT INTO decision_log (decision_id, transaction_id, timestamp, prev_hash, curr_hash, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (decision_id, transaction_id, timestamp, prev_hash, curr_hash, status)
        )
        conn.commit()
        
        new_id = cursor.lastrowid
        
        # Return inserted row as dict
        cursor.execute("SELECT * FROM decision_log WHERE id = ?", (new_id,))
        inserted_row = cursor.fetchone()
        return dict(inserted_row)


def verify_chain(db_path: str = DEFAULT_DB_PATH) -> Tuple[bool, Optional[int]]:
    """
    Verifies the integrity of the audit log hash chain.
    
    Walks all rows in order, recomputing each curr_hash from its stored prev_hash + timestamp + decision_id + transaction_id.
    - Returns (True, None) if every row matches.
    - Returns (False, row_index) at the first row where recomputed hash != stored curr_hash or link is broken.
    """
    init_db(db_path)
    
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM decision_log ORDER BY id ASC")
        rows = cursor.fetchall()
        
        if not rows:
            return True, None
            
        previous_curr_hash = "GENESIS"
        
        for idx, row in enumerate(rows):
            # Check 1: Verify prev_hash link matches previous row's curr_hash
            if row["prev_hash"] != previous_curr_hash:
                return False, idx
                
            # Check 2: Recompute curr_hash from stored fields
            recomputed = calculate_hash(
                row["prev_hash"],
                row["timestamp"],
                row["decision_id"],
                row["transaction_id"]
            )
            
            if recomputed != row["curr_hash"]:
                return False, idx
                
            previous_curr_hash = row["curr_hash"]
            
        return True, None


def get_all_entries(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """
    Utility function to retrieve all audit entries as a list of dicts.
    """
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM decision_log ORDER BY id ASC")
        return [dict(row) for row in cursor.fetchall()]

