"""
FastAPI REST Application for Governed Agentic Commerce.
Exposes endpoints for B2B payment settlement, cryptographic audit verification, and batch data ingestion.
"""

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from src.payment.gateway_client import B2BPaymentGatewayClient, PaymentGatewayError
from src.core.audit import append_entry, verify_chain, get_all_entries, DEFAULT_DB_PATH
from src.ingestion.digitalizer import SMEDigitalizerEngine

app = FastAPI(
    title="Governed Agentic Commerce API",
    description="Backend API for B2B action settlement, cryptographic audit logging, and SME data ingestion.",
    version="1.0.0"
)

# Initialize Payment Gateway Client & Ingestion Engine
payment_client = B2BPaymentGatewayClient(test_mode=True)
ingestion_engine = SMEDigitalizerEngine()


class ActionConfirmRequest(BaseModel):
    decision_id: str = Field(..., description="Unique decision ID from arbitration engine")
    amount: float = Field(..., gt=0, description="Settlement amount in INR")
    supplier_id: str = Field(..., description="Target supplier or merchant ID")
    ai_rationale: str = Field(..., description="Explainable AI reasoning text for order metadata")
    currency: str = Field(default="INR", description="Currency code")
    simulate_failure: bool = Field(default=False, description="Toggle to test API fallback handling")
    db_path: Optional[str] = Field(default=None, description="Custom database path for audit logging")


class BatchIngestRequest(BaseModel):
    file_paths: List[str] = Field(..., description="List of file paths (CSV, JSON, TXT/PDF) to ingest")


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Governed Agentic Commerce API",
        "version": "1.0.0"
    }


@app.post("/action/confirm", tags=["Settlement & Governance"])
def confirm_action(req: ActionConfirmRequest):
    """
    Settles a governed B2B payment action.
    - If payment succeeds: Records entry in audit log with status 'SETTLED'.
    - If payment fails: Traps exception, records entry in audit log with status 'HELD_IN_AUDIT_STATE', and returns graceful payload.
    """
    db_path = req.db_path or DEFAULT_DB_PATH

    try:
        # 1. Attempt Payment Settlement
        order_data = payment_client.create_order(
            amount_in_rupees=req.amount,
            decision_id=req.decision_id,
            supplier_id=req.supplier_id,
            ai_rationale=req.ai_rationale,
            currency=req.currency,
            simulate_failure=req.simulate_failure
        )

        # 2. Record Successful Settlement in SHA-256 Audit Log
        audit_entry = append_entry(
            decision_id=req.decision_id,
            transaction_id=order_data["transaction_id"],
            status="SETTLED",
            db_path=db_path
        )

        return {
            "status": "SETTLED",
            "message": "Payment settled successfully with embedded AI metadata.",
            "order": order_data,
            "audit_entry": audit_entry
        }

    except PaymentGatewayError as pge:
        # 3. Fallback Handler: Catch payment failure & hold decision state safely
        audit_entry = append_entry(
            decision_id=req.decision_id,
            transaction_id=None,
            status="HELD_IN_AUDIT_STATE",
            db_path=db_path
        )

        return {
            "status": "HELD_IN_AUDIT_STATE",
            "reason": str(pge),
            "decision_id": req.decision_id,
            "message": "Payment API Gateway failure trapped. Action held in audit state for review.",
            "audit_entry": audit_entry
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected Error during settlement: {str(e)}"
        )


@app.post("/ingest/batch", tags=["Data Digitalization"])
def batch_ingest_files(req: BatchIngestRequest):
    """Ingests and normalizes a batch of SME files into SQLite dataset."""
    result = ingestion_engine.ingest_batch_files(req.file_paths)
    return result


@app.get("/audit/logs", tags=["Audit Ledger"])
def fetch_audit_logs(db_path: Optional[str] = None):
    """Retrieves all cryptographic audit log entries."""
    target_db = db_path or DEFAULT_DB_PATH
    entries = get_all_entries(db_path=target_db)
    return {
        "count": len(entries),
        "entries": entries
    }


@app.get("/audit/verify", tags=["Audit Ledger"])
def verify_audit_chain(db_path: Optional[str] = None):
    """Verifies the integrity of the SHA-256 hash chain."""
    target_db = db_path or DEFAULT_DB_PATH
    is_valid, failed_index = verify_chain(db_path=target_db)
    return {
        "is_valid": is_valid,
        "failed_index": failed_index,
        "message": "Audit chain intact." if is_valid else f"Tampering detected at row index {failed_index}!"
    }
