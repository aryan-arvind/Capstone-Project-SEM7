import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from src.core.arbitration import (
    ArbitrationEngine,
    conflict_check,
    priority_rank,
    decision_router,
    HARD_CASH_THRESHOLD,
    HARD_RESTOCK_CAP,
)
from src.schemas import (
    Recommendation,
    SystemState,
    ArbitrationResult,
    ActionCard,
    ExecutionTier,
    AgentType,
)


def arbitrate_2agent(inventory_output: Dict[str, Any], finance_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Review 2 Milestone K.3 — 2-Agent Arbitrator:
    Compares Inventory Agent demand vs Finance Agent budget and enforces the capping rule:
      Example:
        Inventory asks ₹50,000
        Finance allows ₹20,000
        Arbitrator outputs: Approved = ₹20,000
    """
    requested_spend = float(
        inventory_output.get("requested_amount")
        if inventory_output.get("requested_amount") is not None
        else inventory_output.get("total_reorder_cost", 0.0)
    )
    budget_ceiling = float(
        finance_output.get("max_spend_allowed")
        if finance_output.get("max_spend_allowed") is not None
        else finance_output.get("free_liquid_cash", 0.0)
    )
    critical_list = inventory_output.get("critical_items", [])
    if critical_list and len(critical_list) > 0:
        fallback_sku = critical_list[0].get("sku")
    else:
        fallback_sku = None

    recommended_sku = (
        inventory_output.get("sku")
        or inventory_output.get("recommended_sku")
        or fallback_sku
    )

    if requested_spend <= 0.0:
        approved_spend = 0.0
        curtailed_amount = 0.0
        is_capped = False
        status = "NO_ACTION"
        decision_code = "NO_ACTION"
        execution_tier = ExecutionTier.AUTO_EXECUTE.value
        decision_text = "No restock spend requested; zero capital allocation required."
        reason_text = "No inventory restock requested; stock levels are healthy."
        card_title = "No Restock Order Required"
        card_action = "No capital disbursement needed; stock levels are healthy"
    elif requested_spend <= budget_ceiling:
        approved_spend = requested_spend
        curtailed_amount = 0.0
        is_capped = False
        status = "APPROVED_FULL"
        decision_code = "APPROVE_FULL"
        execution_tier = ExecutionTier.AUTO_EXECUTE.value if requested_spend <= 0.5 * budget_ceiling else ExecutionTier.AUTO_LOG.value
        decision_text = f"Full restock demand of ₹{int(requested_spend):,} approved within available budget of ₹{int(budget_ceiling):,}."
        reason_text = "Inventory request is within the available finance budget."
        sku_label = recommended_sku or "Inventory Items"
        card_title = f"Arbitrated Restock Order ({sku_label})"
        card_action = f"Disburse ₹{int(approved_spend):,} towards {sku_label} purchase"
    else:
        # Capping rule enforced: requested spend curtailed to maximum spend allowed
        approved_spend = budget_ceiling
        curtailed_amount = round(requested_spend - budget_ceiling, 2)
        is_capped = True
        status = "CAPPED"
        decision_code = "APPROVE_CAPPED"
        execution_tier = ExecutionTier.ESCALATE.value
        decision_text = (
            f"Approved = ₹{int(approved_spend):,}. "
            f"Inventory demand of ₹{int(requested_spend):,} was capped to the Finance budget ceiling "
            f"of ₹{int(budget_ceiling):,} (curtailed by ₹{int(curtailed_amount):,})."
        )
        reason_text = "Inventory request exceeds available finance budget. Reorder has been capped at the permitted amount."
        sku_label = recommended_sku or "Inventory Items"
        card_title = f"Arbitrated Restock Order ({sku_label})"
        card_action = f"Disburse ₹{int(approved_spend):,} towards {sku_label} purchase"

    approved_text = f"Approved = ₹{int(approved_spend):,}"

    action_card = {
        "card_id": f"ACT-ARB-{uuid.uuid4().hex[:8].upper()}",
        "title": card_title,
        "recommended_action": card_action,
        "sku": recommended_sku or "N/A",
        "requested_amount": requested_spend,
        "approved_amount": approved_spend,
        "budget_ceiling": budget_ceiling,
        "budget_limit": budget_ceiling,
        "curtailed_amount": curtailed_amount,
        "is_capped": is_capped,
        "status": status,
        "execution_tier": execution_tier,
        "governance_rule": "Deterministic Liquidity-Gated Hard Ceiling",
        "rationale": decision_text,
        "currency": "INR",
        "timestamp": datetime.now().isoformat(),
    }

    # Record decision into SQLite decision_logs if database is available (Item 7)
    _record_decision_log(
        sku=recommended_sku,
        requested_amount=requested_spend,
        budget_limit=budget_ceiling,
        approved_amount=approved_spend,
        conflict_detected=is_capped,
        decision=decision_code,
        reason=reason_text,
    )

    return {
        "arbitrator": "two_agent_deterministic",
        "decision": decision_code,
        "status": status,
        "conflict_detected": is_capped,
        "is_capped": is_capped,
        "requested_amount": requested_spend,
        "requested_spend": requested_spend,
        "budget_limit": budget_ceiling,
        "budget_ceiling": budget_ceiling,
        "approved_amount": approved_spend,
        "approved_spend": approved_spend,
        "curtailed_amount": curtailed_amount,
        "approved_text": approved_text,
        "decision_text": decision_text,
        "reason": reason_text,
        "execution_tier": execution_tier,
        "inventory_recommendation": inventory_output,
        "finance_recommendation": finance_output,
        "action_card": action_card,
        "audit_summary": (
            f"Inventory requested ₹{int(requested_spend):,}, Finance permitted ₹{int(budget_ceiling):,}. "
            f"Capping rule enforced: {approved_text}."
        ),
        "timestamp": datetime.now().isoformat(),
    }


def _record_decision_log(
    sku: str,
    requested_amount: float,
    budget_limit: float,
    approved_amount: float,
    conflict_detected: bool,
    decision: str,
    reason: str,
) -> None:
    """Records arbitration decisions to decision_logs table without touching Soham's audit ledger."""
    try:
        import os
        import sqlite3
        db_candidates = [
            os.path.join("data", "sme_digitalized_data.db"),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "sme_digitalized_data.db")
        ]
        db_path = None
        for cand in db_candidates:
            if os.path.exists(cand):
                db_path = cand
                break
        if not db_path:
            return

        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS decision_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    sku TEXT,
                    requested_amount REAL NOT NULL,
                    budget_limit REAL NOT NULL,
                    approved_amount REAL NOT NULL,
                    conflict_detected INTEGER NOT NULL,
                    decision TEXT NOT NULL,
                    reason TEXT NOT NULL
                );
            """)
            cursor.execute("""
                INSERT INTO decision_logs 
                (timestamp, sku, requested_amount, budget_limit, approved_amount, conflict_detected, decision, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                datetime.now().isoformat(),
                sku,
                requested_amount,
                budget_limit,
                approved_amount,
                1 if conflict_detected else 0,
                decision,
                reason,
            ))
            conn.commit()
        finally:
            conn.close()
    except Exception:
        # Non-blocking logging: do not crash if database is temporarily busy
        pass


class TwoAgentArbitrator:
    """Class wrapper for 2-agent deterministic arbitration."""

    def arbitrate(self, inventory_output: Dict[str, Any], finance_output: Dict[str, Any]) -> Dict[str, Any]:
        return arbitrate_2agent(inventory_output, finance_output)


two_agent_arbitrator = TwoAgentArbitrator()

__all__ = [
    "ArbitrationEngine",
    "conflict_check",
    "priority_rank",
    "decision_router",
    "HARD_CASH_THRESHOLD",
    "HARD_RESTOCK_CAP",
    "Recommendation",
    "SystemState",
    "ArbitrationResult",
    "ActionCard",
    "ExecutionTier",
    "AgentType",
    "arbitrate_2agent",
    "TwoAgentArbitrator",
    "two_agent_arbitrator",
]
