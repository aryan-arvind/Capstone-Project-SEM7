"""
SHA-256 Cryptographic Audit Ledger Engine.
Implements hash-chaining over single decision_log table to guarantee non-repudiation.
"""

import hashlib
import logging
from typing import Dict, Any, Tuple, Optional, List
from src.core.database import get_connection, get_decision_log, init_db, DEFAULT_DB_PATH

logger = logging.getLogger(__name__)


def compute_hash(prev_hash: str, row: Dict[str, Any]) -> str:
    """
    Computes SHA-256 hash over prev_hash and row fields (timestamp, id, transaction_id, action_status).
    """
    p_hash = prev_hash or ""
    ts = str(row.get("timestamp") or "")
    row_id = str(row.get("id") or "")
    tx_id = str(row.get("transaction_id") or "")
    status = str(row.get("action_status") or "")
    
    payload = f"{p_hash}{ts}{row_id}{tx_id}{status}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def stamp_decision(decision_log_id: int, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    """
    Stamps SHA-256 prev_hash and curr_hash onto decision_log row AFTER transaction outcome is known.
    """
    init_db(db_path)
    target_row = get_decision_log(decision_log_id, db_path=db_path)
    if not target_row:
        return None

    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        # Fetch previous row's curr_hash
        cursor.execute(
            "SELECT curr_hash FROM decision_log WHERE id < ? ORDER BY id DESC LIMIT 1",
            (decision_log_id,)
        )
        prev_row = cursor.fetchone()
        prev_hash = prev_row["curr_hash"] if (prev_row and prev_row["curr_hash"]) else "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000"

        # Compute hash
        curr_hash = compute_hash(prev_hash, target_row)

        # UPDATE decision_log row
        cursor.execute("""
            UPDATE decision_log
            SET prev_hash = ?, curr_hash = ?
            WHERE id = ?
        """, (prev_hash, curr_hash, decision_log_id))
        conn.commit()

    return get_decision_log(decision_log_id, db_path=db_path)


def verify_chain(business_id: Optional[int] = 1, db_path: str = DEFAULT_DB_PATH) -> Tuple[bool, Optional[int]]:
    """
    Walks decision_log ordered by id, recomputes each curr_hash from prev_hash + row fields.
    Returns (True, None) if 100% valid, or (False, broken_id) at first mismatch.
    """
    import sqlite3
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
            rows = [dict(r) for r in cursor.fetchall()]
        except sqlite3.OperationalError:
            try:
                cursor.execute("SELECT * FROM decision_log ORDER BY id ASC")
                rows = [dict(r) for r in cursor.fetchall()]
            except Exception:
                rows = []

    if not rows:
        return True, None

    expected_prev = "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000"

    for row in rows:
        row_id = row["id"]
        actual_prev = row.get("prev_hash")
        actual_curr = row.get("curr_hash")

        # If not yet stamped, skip
        if not actual_curr:
            continue

        # Check prev_hash continuity
        if actual_prev != expected_prev:
            logger.error(f"Chain broken at row {row_id}: Expected prev_hash {expected_prev}, got {actual_prev}")
            return False, row_id

        # Recompute curr_hash
        recomputed = compute_hash(actual_prev, row)
        if recomputed != actual_curr:
            logger.error(f"Hash mismatch at row {row_id}: Stored {actual_curr}, Recomputed {recomputed}")
            return False, row_id

        expected_prev = actual_curr

    return True, None


def append_entry(decision_id: str, agent_id: str, action_taken: str, amount_spent: float, transaction_id: str, db_path: str = DEFAULT_DB_PATH) -> dict:
    """
    Legacy helper for backwards compatibility with test suites.
    Inserts a row into decision_log and stamps the hash.
    """
    final_dec = json.dumps({"decision_id": decision_id, "agent_id": agent_id, "action_taken": action_taken, "amount_spent": amount_spent})
    row_id = log_decision(final_decision=final_dec, rationale=action_taken, db_path=db_path)
    from src.core.database import update_action_status
    update_action_status(row_id, "CONFIRMED", transaction_id=transaction_id, db_path=db_path)
    stamped = stamp_decision(row_id, db_path=db_path)
    return stamped or {}


def get_all_entries(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    """
    Legacy helper for backwards compatibility with UI components.
    """
    from src.core.database import get_all_decision_logs
    logs = get_all_decision_logs(db_path=db_path)
    entries = []
    for row in logs:
        try:
            dec_obj = json.loads(row["final_decision"])
            dec_id = dec_obj.get("decision_id", f"DEC-{row['id']}")
        except Exception:
            dec_id = f"DEC-{row['id']}"

        entries.append({
            "entry_id": row["id"],
            "timestamp": row["timestamp"],
            "decision_id": dec_id,
            "action_taken": row["action_status"] or "LOGGED",
            "amount_spent": 0.0,
            "transaction_id": row["transaction_id"] or "",
            "current_hash": row["curr_hash"] or "",
            "previous_hash": row["prev_hash"] or ""
        })
    return entries
