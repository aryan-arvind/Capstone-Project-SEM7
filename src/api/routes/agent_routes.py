"""
Agent API Routes.
Review 2 Milestone K.4 — Agent API:
Provides POST /api/agents/evaluate endpoint returning the full arbitrated decision.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.agents.inventory_agent import inventory_agent
from src.agents.finance_agent import finance_agent
from src.arbitration import arbitrate_2agent

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentEvaluateRequest(BaseModel):
    bank_cash: Optional[float] = Field(
        default=None,
        description="Optional override for bank cash (default from SQLite financial_reserves or 50,000.0)"
    )
    payroll_reserve: Optional[float] = Field(
        default=None,
        description="Optional override for payroll reserve (default from SQLite financial_reserves or 30,000.0)"
    )
    db_path: Optional[str] = Field(
        default=None,
        description="Optional custom path to SQLite database (default data/sme_digitalized_data.db)"
    )


class AgentEvaluateResponse(BaseModel):
    success: bool
    inventory: Dict[str, Any]
    finance: Dict[str, Any]
    arbitration: Dict[str, Any]
    timestamp: str


@router.post("/evaluate", response_model=AgentEvaluateResponse)
def evaluate_agents(payload: Optional[AgentEvaluateRequest] = None) -> Dict[str, Any]:
    """
    Review 2 Milestone K.4:
    Executes the 2-Agent Engine and Deterministic Arbitration:
      1. Inventory Agent queries SQLite `inventory_items` where current_stock < min_threshold.
      2. Finance Agent calculates Free Liquid Cash = Bank Cash - Payroll Reserve.
      3. 2-Agent Arbitrator enforces the capping rule (e.g., Inventory asks ₹50,000,
         Finance allows ₹20,000 -> Approved = ₹20,000).
    Returns the full arbitrated decision payload.
    """
    try:
        req = payload or AgentEvaluateRequest()

        # Sanitize Swagger default placeholders ("string" / 0)
        raw_db = req.db_path.strip() if req.db_path else ""
        resolved_db = raw_db if (raw_db and raw_db.lower() != "string") else None

        bank_cash = req.bank_cash if (req.bank_cash is not None and req.bank_cash > 0) else None
        payroll_reserve = req.payroll_reserve if (req.payroll_reserve is not None and req.payroll_reserve > 0) else None

        # Step 1: Run Inventory Agent reasoning
        inventory_result = inventory_agent.evaluate(db_path=resolved_db)

        # Step 2: Run Finance Agent reasoning
        finance_result = finance_agent.evaluate(
            bank_cash=bank_cash,
            payroll_reserve=payroll_reserve,
            db_path=resolved_db,
        )

        # Step 3: Run Deterministic 2-Agent Arbitration
        arbitration_result = arbitrate_2agent(inventory_result, finance_result)

        return {
            "success": True,
            "inventory": inventory_result,
            "finance": finance_result,
            "arbitration": arbitration_result,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent evaluation pipeline failed: {str(e)}"
        )


@router.get("/evaluate", response_model=AgentEvaluateResponse)
def evaluate_agents_get(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Convenience GET endpoint for browser queries and quick testing."""
    return evaluate_agents(AgentEvaluateRequest(db_path=db_path))


@router.get("/status")
def get_agents_status() -> Dict[str, Any]:
    """Status endpoint reporting health of 2-Agent coordination engine."""
    return {
        "status": "healthy",
        "engine": "2-Agent Engine + Deterministic Arbitration",
        "agents": ["InventoryAgent", "FinanceAgent"],
        "arbitrator": "TwoAgentArbitrator",
        "endpoints": [
            "POST /api/agents/evaluate",
            "GET /api/agents/evaluate",
            "GET /api/agents/status"
        ],
        "version": "1.0.0"
    }
