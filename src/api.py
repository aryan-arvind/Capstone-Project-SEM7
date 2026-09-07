"""
FastAPI routes for the data/agents/arbitration slice of the capstone.

  POST /onboard      - registers a new business and seeds 30 days of
                        synthetic sales/stock/expense history so the domain
                        agents have data to reason over immediately.
  POST /agent-query   - runs InventoryAgent + FinanceAgent for a business,
                        reconciles them through the arbitration engine, logs
                        the decision, and returns it.

Other teammates' routes (e.g. /action/confirm) mount onto the same `app`
from their own modules; this file only owns the two routes above.
"""

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.agents.finance_agent import FinanceAgent
from src.agents.inventory_agent import InventoryAgent
from src.core import database as db
from src.core.arbitration import decision_router
from src.seed_data import generate_seed_data

app = FastAPI(title="Capstone MVP - Data & Arbitration Engine")

# Allows the frontend (Kohli's React dev server, typically on a different
# port than this API) to call these routes during local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

inventory_agent = InventoryAgent()
finance_agent = FinanceAgent()


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


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


@app.post("/agent-query")
def agent_query(payload: AgentQueryRequest) -> dict:
    business = db.get_business(payload.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail=f"No business found with id {payload.business_id}")

    inventory_rec = inventory_agent.analyze(payload.business_id)
    finance_rec = finance_agent.analyze(payload.business_id)
    decision = decision_router(inventory_rec, finance_rec)

    db.log_decision(
        business_id=payload.business_id,
        query=payload.query,
        inventory_recommendation=json.dumps(inventory_rec),
        finance_recommendation=json.dumps(finance_rec),
        conflict_detected=decision["conflict"]["conflict"],
        final_decision=json.dumps(decision),
        rationale=decision["rationale"],
    )

    return {
        "query": payload.query,
        "inventory_recommendation": inventory_rec,
        "finance_recommendation": finance_rec,
        "decision": decision,
    }
