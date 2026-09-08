"""
Cryptographic SHA-256 Audit Trail for Governed Decision Coordination.

Implements tamper-evident hash chaining for every arbitrated decision:
  Hash_k = SHA-256(Hash_{k-1} || Timestamp_k || BusinessID_k || TotalAllocated_k || DecisionPayload_k)

Provides cryptographic verification to ensure the decision log has not been altered.
"""

import hashlib
import json
from typing import Optional, Dict, Any, List


GENESIS_HASH = "0" * 64


def calculate_decision_hash(
    previous_hash: Optional[str],
    timestamp: str,
    business_id: int,
    total_allocated_cost: float,
    decision_summary: str,
    execution_tier: str
) -> str:
    """Computes SHA-256 hash for a decision entry, chained to the previous entry."""
    prev = previous_hash or GENESIS_HASH
    payload = (
        f"{prev}|{timestamp}|{business_id}|{total_allocated_cost:.2f}|"
        f"{execution_tier}|{decision_summary}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verify_hash_chain(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Verifies the cryptographic integrity of a sequence of decision log entries.
    Returns:
        {
            "is_valid": bool,
            "total_entries": int,
            "broken_at_id": Optional[int],
            "message": str
        }
    """
    if not entries:
        return {
            "is_valid": True,
            "total_entries": 0,
            "broken_at_id": None,
            "message": "Audit log is empty. Chain is trivially valid."
        }

    for idx, entry in enumerate(entries):
        expected_prev = GENESIS_HASH if idx == 0 else entries[idx - 1].get("entry_hash")
        actual_prev = entry.get("previous_hash") or GENESIS_HASH

        if actual_prev != expected_prev:
            return {
                "is_valid": False,
                "total_entries": len(entries),
                "broken_at_id": entry.get("id"),
                "message": f"Broken chain link at entry #{entry.get('id')}: previous_hash mismatch."
            }

        recalculated = calculate_decision_hash(
            previous_hash=expected_prev,
            timestamp=entry.get("timestamp", ""),
            business_id=entry.get("business_id", 0),
            total_allocated_cost=float(entry.get("total_allocated_cost", 0.0) or 0.0),
            decision_summary=entry.get("rationale", ""),
            execution_tier=entry.get("execution_tier", "AUTO_EXECUTE")
        )

        if entry.get("entry_hash") and recalculated != entry.get("entry_hash"):
            return {
                "is_valid": False,
                "total_entries": len(entries),
                "broken_at_id": entry.get("id"),
                "message": f"Tampering detected at entry #{entry.get('id')}: hash recalculation mismatch."
            }

    return {
        "is_valid": True,
        "total_entries": len(entries),
        "broken_at_id": None,
        "message": f"Cryptographic integrity verified across {len(entries)} chained log entries."
    }
