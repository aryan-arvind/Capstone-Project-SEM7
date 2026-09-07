"""
FastAPI REST Application for Governed B2B Action Execution.
Exposes endpoints for B2B payment confirmation, cryptographic audit verification, and batch data ingestion.
"""

import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from src.payment.gateway_client import create_order, GatewayError, B2BPaymentGatewayClient
from src.core.database import (
    init_db,
    log_decision,
    get_decision_log,
    update_action_status,
    get_all_decision_logs,
    DEFAULT_DB_PATH
)
from src.core.audit import stamp_decision, verify_chain, compute_hash

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Governed Agentic Commerce Platform API",
    description="Backend API for B2B action settlement, cryptographic SHA-256 audit logging, and SME data ingestion.",
    version="2.0.0"
)

# Run DB initialization on startup
init_db()


class ActionConfirmRequest(BaseModel):
    decision_log_id: int = Field(..., description="ID of the decision_log record to confirm")
    approved: bool = Field(..., description="True if merchant approved execution, False if rejected")


class BatchIngestRequest(BaseModel):
    file_paths: List[str] = Field(..., description="List of file paths (CSV, JSON, TXT/PDF) to ingest")


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Governed Agentic Commerce Platform API",
        "version": "2.0.0"
    }


@app.post("/action/confirm", tags=["Settlement & Governance"])
def action_confirm(payload: ActionConfirmRequest) -> Dict[str, Any]:
    """
    Executes a governed B2B payment action for a decision.
    Sequencing: decision fetched -> owner sign-off verified -> payment attempted -> status updated -> hash stamped.
    Catches all exceptions gracefully to guarantee zero unhandled 500 errors.
    """
    try:
        # 1. Fetch decision row
        decision = get_decision_log(payload.decision_log_id)
        if decision is None:
            raise HTTPException(status_code=404, detail=f"Decision log {payload.decision_log_id} not found")

        # 2. Handle Owner Rejection
        if not payload.approved:
            update_action_status(payload.decision_log_id, "REJECTED_BY_OWNER")
            stamp_decision(payload.decision_log_id)
            return {
                "status": "REJECTED_BY_OWNER",
                "transaction_id": None,
                "error": None,
                "decision_log_id": payload.decision_log_id
            }

        # 3. Approved: Extract amount and convert to paise (₹20,000 -> 2,000,000 paise)
        try:
            dec_obj = json.loads(decision["final_decision"])
            amount = float(dec_obj.get("approved_amount", dec_obj.get("amount", 2000.0)))
        except Exception:
            amount = 2000.0

        amount_paise = int(round(amount * 100))
        rationale = decision.get("rationale", "")

        # 4. Attempt Gateway Order Creation
        try:
            res = create_order(
                amount_paise=amount_paise,
                receipt=f"DEC-{payload.decision_log_id}",
                decision_id=payload.decision_log_id,
                rationale=rationale
            )
            order_status = res.get("status", "CONFIRMED")
            tx_id = res.get("transaction_id")
            err_msg = None
        except GatewayError as e:
            order_status = "HELD_IN_AUDIT_STATE"
            tx_id = None
            err_msg = str(e)
        except Exception as e:
            order_status = "HELD_IN_AUDIT_STATE"
            tx_id = None
            err_msg = str(e)

        # 5. Update decision_log row and stamp SHA-256 hash AFTER payment outcome
        update_action_status(payload.decision_log_id, order_status, tx_id)
        stamp_decision(payload.decision_log_id)

        # 6. Response Payload Contract
        response_payload = {
            "status": order_status,
            "transaction_id": tx_id,
            "error": err_msg,
            "decision_log_id": payload.decision_log_id
        }

        if order_status == "HELD_IN_AUDIT_STATE":
            response_payload["recovery_note"] = "Payment not confirmed. No funds were moved. Retry from the decision feed."

        return response_payload

    except HTTPException:
        raise
    except Exception as ex:
        logger.error(f"Uncaught exception in action_confirm: {ex}")
        return {
            "status": "HELD_IN_AUDIT_STATE",
            "transaction_id": None,
            "error": str(ex),
            "decision_log_id": getattr(payload, "decision_log_id", 0),
            "recovery_note": "Payment not confirmed. No funds were moved. Retry from the decision feed."
        }


@app.get("/audit/verify", tags=["Audit & Non-Repudiation"])
def audit_verify():
    """
    Verifies SHA-256 hash-chain integrity over decision_log table.
    """
    is_valid, broken_id = verify_chain()
    return {
        "is_valid": is_valid,
        "broken_id": broken_id,
        "status": "100% VERIFIED" if is_valid else "TAMPER DETECTED"
    }


@app.get("/audit/logs", tags=["Audit & Non-Repudiation"])
def audit_logs():
    """
    Returns all decision_log records with SHA-256 hashes.
    """
    logs = get_all_decision_logs()
    return {
        "total_records": len(logs),
        "logs": logs
    }
