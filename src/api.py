"""
FastAPI routes for Multi-Agent Decision Coordination & Governed Agentic Commerce.

Routes:
  POST /onboard           - Registers a new business and seeds 30 days of history.
  GET  /business/{id}     - Retrieves business profile and current cash balance.
  POST /agent-query       - Triggers multi-agent reasoning, deterministic arbitration,
                            cryptographic audit logging, and Action Card generation.
  GET  /audit-trail/{id}  - Retrieves decision log history and verifies SHA-256 chain integrity.
  POST /action/confirm    - 1-click governed action execution with graceful failure simulation.
"""

from __future__ import annotations

import os
import uuid
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.core import database as db
from src.orchestrator import orchestrator
from src.seed_data import generate_seed_data

app = FastAPI(
    title="Multi-Agent Decision Intelligence & Governed Arbitration Platform",
    description="MSME Decision Support System with Deterministic Conflict Arbitration and Governed Execution.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Enable package namespace for routes
__path__ = [os.path.join(os.path.dirname(__file__), "api")]

from src.api.routes.agent_routes import router as agent_router
app.include_router(agent_router)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


@app.get("/", response_class=FileResponse)
def serve_ui():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Antigravity MSME Engine API is Live. Visit /docs for Swagger."}


class OnboardRequest(BaseModel):
    business_name: str = Field(..., min_length=1)
    business_type: str = Field(..., min_length=1)
    owner_name: str = Field(..., min_length=1)
    starting_cash: float = Field(..., gt=0)


class OnboardResponse(BaseModel):
    business_id: int
    business_name: str
    starting_cash: float
    final_cash_balance: float
    message: str


class AgentQueryRequest(BaseModel):
    business_id: int
    query: str = Field(default="restock review", min_length=1)


class ActionConfirmRequest(BaseModel):
    business_id: int
    card_id: str
    amount: float
    simulate_failure: bool = False


@app.post("/onboard", response_model=OnboardResponse)
def onboard(payload: OnboardRequest) -> OnboardResponse:
    business_id = db.create_business(
        business_name=payload.business_name,
        business_type=payload.business_type,
        owner_name=payload.owner_name,
        cash_balance=payload.starting_cash,
    )

    final_cash = generate_seed_data(business_id, starting_cash=payload.starting_cash)
    db.update_cash_balance(business_id, final_cash)

    return OnboardResponse(
        business_id=business_id,
        business_name=payload.business_name,
        starting_cash=payload.starting_cash,
        final_cash_balance=final_cash,
        message="Business onboarded and 30 days of history seeded.",
    )


@app.get("/businesses")
def list_businesses() -> list[dict]:
    return db.get_all_businesses()


@app.get("/business/{business_id}")
def get_business_details(business_id: int) -> dict:
    biz = db.get_business(business_id)
    if not biz:
        raise HTTPException(status_code=404, detail=f"No business found with id {business_id}")

    finance_stats = orchestrator.finance_agent.analyze(business_id)
    return {
        "business": biz,
        "finance_summary": finance_stats,
    }


@app.get("/inventory/{business_id}")
def get_inventory_details(business_id: int) -> dict:
    biz = db.get_business(business_id)
    if not biz:
        raise HTTPException(status_code=404, detail=f"No business found with id {business_id}")
    return orchestrator.inventory_agent.get_inventory_status(business_id)



@app.post("/agent-query")
def agent_query(payload: AgentQueryRequest) -> dict:
    business = db.get_business(payload.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail=f"No business found with id {payload.business_id}")

    # Detect conflict / stress-test scenarios to inject cross-agent recommendations (e.g. Compliance GST, Festival Surge)
    external_recs = []
    q_lower = payload.query.lower()
    if any(k in q_lower for k in ["conflict", "gst", "statutory", "festival", "surge"]):
        from src.schemas import Recommendation, AgentType
        if any(k in q_lower for k in ["gst", "statutory", "conflict"]):
            external_recs.append(
                Recommendation(
                    recommendation_id="REC_CMP_GST_01",
                    agent_type=AgentType.COMPLIANCE,
                    title="Pay Statutory GST Liability (Due in 3 Days)",
                    description="Pay GST tax liability to avoid statutory 18% p.a. interest penalties and input credit freeze.",
                    required_cash=20000.0,
                    urgency_score=0.95,
                    expected_roi_or_impact=0.85,
                    risk_score=0.10,
                    deadline_days=3.0,
                    metadata={"category": "tax", "type": "GST_3B"}
                )
            )
        if any(k in q_lower for k in ["festival", "surge", "conflict"]):
            external_recs.append(
                Recommendation(
                    recommendation_id="REC_INV_SURGE_01",
                    agent_type=AgentType.INVENTORY,
                    title="Festival Season Fast-Moving Bulk Restock (Batch #A42)",
                    description="Pre-emptive inventory purchase for upcoming festival demand surge.",
                    required_cash=45000.0,
                    urgency_score=0.88,
                    expected_roi_or_impact=0.92,
                    risk_score=0.25,
                    deadline_days=5.0,
                    metadata={"category": "inventory", "surge": True}
                )
            )

    result = orchestrator.run_cycle(
        business_id=payload.business_id,
        query=payload.query,
        external_recommendations=external_recs if external_recs else None,
    )

    # Return response compatible with both frontend and legacy consumers
    return {
        "query": payload.query,
        "business_id": payload.business_id,
        "business_name": result["business_name"],
        "conflict_detected": result["conflict_detected"],
        "execution_tier": result["execution_tier"],
        "inventory_recommendation": result["inventory_summary"],
        "finance_recommendation": result["finance_summary"],
        "decision": {
            "conflict": {
                "conflict": result["conflict_detected"],
                "requested_cost": result["arbitration_result"]["total_cash_allocated"],
                "available_cash": result["finance_summary"]["available_cash"],
            },
            "approved_items": result["arbitration_result"]["approved_recommendations"],
            "deferred_items": result["arbitration_result"]["rejected_recommendations"],
            "total_approved_cost": result["arbitration_result"]["total_cash_allocated"],
            "remaining_budget": result["arbitration_result"]["remaining_cash"],
            "rationale": result["arbitration_result"]["decision_rationale"],
            "action_cards": result["action_cards"],
        },
        "action_cards": result["action_cards"],
        "audit_trail": result["audit_trail"],
    }


@app.get("/audit-trail/{business_id}")
def get_audit_trail(business_id: int) -> dict:
    biz = db.get_business(business_id)
    if not biz:
        raise HTTPException(status_code=404, detail=f"No business found with id {business_id}")

    history = db.get_decision_history(business_id, limit=100)
    verification = orchestrator.verify_business_audit_trail(business_id)

    return {
        "business_id": business_id,
        "chain_verification": verification,
        "decision_count": len(history),
        "history": history,
    }


@app.post("/action/confirm")
def confirm_action(payload: ActionConfirmRequest) -> dict:
    biz = db.get_business(payload.business_id)
    if not biz:
        raise HTTPException(status_code=404, detail=f"No business found with id {payload.business_id}")

    # Simulated payment failure toggle for viva demonstration
    if payload.simulate_failure:
        db.log_decision(
            business_id=payload.business_id,
            query=f"CONFIRM_ACTION:{payload.card_id}",
            inventory_recommendation="{}",
            finance_recommendation="{}",
            conflict_detected=True,
            final_decision="HELD_IN_AUDIT_STATE",
            rationale=f"Payment execution for card {payload.card_id} failed simulated gateway check. Held safely in audit log.",
            execution_tier="ESCALATE",
            total_allocated_cost=0.0,
        )
        return {
            "status": "HELD_IN_AUDIT_STATE",
            "message": "Payment API network timeout simulation triggered. Action safely held without fund deduction.",
            "card_id": payload.card_id,
            "deducted_amount": 0.0,
            "current_cash_balance": biz["cash_balance"],
        }

    current_cash = float(biz["cash_balance"])
    if payload.amount > current_cash:
        raise HTTPException(status_code=400, detail="Insufficient funds in business account to execute action.")

    new_cash = round(current_cash - payload.amount, 2)
    db.update_cash_balance(payload.business_id, new_cash)

    payment_ref = f"pay_test_{uuid.uuid4().hex[:12]}"
    db.log_decision(
        business_id=payload.business_id,
        query=f"CONFIRM_ACTION:{payload.card_id}",
        inventory_recommendation="{}",
        finance_recommendation="{}",
        conflict_detected=False,
        final_decision="ACTION_EXECUTED",
        rationale=f"User approved ActionCard {payload.card_id}. INR {payload.amount:,.2f} disbursed via test gateway ({payment_ref}).",
        execution_tier="AUTO_EXECUTE",
        total_allocated_cost=payload.amount,
    )

    return {
        "status": "EXECUTED",
        "card_id": payload.card_id,
        "amount_disbursed": payload.amount,
        "previous_cash_balance": current_cash,
        "new_cash_balance": new_cash,
        "payment_reference": payment_ref,
        "message": f"Action successfully executed. Payment reference: {payment_ref}",
    }
