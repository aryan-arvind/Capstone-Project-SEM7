"""
Multi-Agent Decision Orchestrator.

Master coordinator bridging:
  1. Business Context & Data Store (SQLite)
  2. Specialized Domain Agents (Inventory, Finance)
  3. Deterministic Arbitration Engine (MCDM & Solvency Guardrails)
  4. Cryptographic SHA-256 Audit Trail
  5. Action Card Generation for Governed Execution
"""

from __future__ import annotations

import json
from typing import Dict, Any, List, Optional

from src.agents.finance_agent import FinanceAgent
from src.agents.inventory_agent import InventoryAgent
from src.agents.ops_agent import OpsCustomerAgent
from src.core import database as db
from src.core.arbitration import ArbitrationEngine
from src.core.audit import verify_hash_chain
from src.schemas import (
    Recommendation,
    SystemState,
    ArbitrationResult,
    ActionCard,
    ExecutionTier,
)


class MultiAgentOrchestrator:
    """
    Coordinates data retrieval, multi-agent evaluation across exactly 3 domain agents
    (Finance, Inventory, Ops/Customer), conflict arbitration, cryptographic audit logging,
    and action card generation.
    """

    def __init__(
        self,
        inventory_agent: Optional[InventoryAgent] = None,
        finance_agent: Optional[FinanceAgent] = None,
        ops_agent: Optional[OpsCustomerAgent] = None,
        arbitration_engine: Optional[ArbitrationEngine] = None,
    ):
        self.inventory_agent = inventory_agent or InventoryAgent()
        self.finance_agent = finance_agent or FinanceAgent()
        self.ops_agent = ops_agent or OpsCustomerAgent()
        self.arbitration_engine = arbitration_engine or ArbitrationEngine()

    def run_cycle(
        self,
        business_id: int,
        query: str = "operational decision review",
        external_recommendations: Optional[List[Recommendation]] = None,
    ) -> Dict[str, Any]:
        """
        Runs one full decision intelligence cycle for the given business.
        """
        # 1. Fetch business profile
        business = db.get_business(business_id)
        if not business:
            raise ValueError(f"Business #{business_id} does not exist. Please onboard first.")

        # 2. Domain Agent reasoning across all 3 agents
        finance_raw = self.finance_agent.analyze(business_id)
        inventory_raw = self.inventory_agent.analyze(business_id)
        ops_raw = self.ops_agent.analyze(business_id)

        # 3. Standardized Schema extraction
        system_state = self.finance_agent.get_system_state(business_id)
        recommendations: List[Recommendation] = self.inventory_agent.generate_recommendations(business_id)

        # Include Ops / Customer Agent recommendation for full 3-agent coordination
        if any(w in query.lower() for w in ["customer", "order", "vip", "ops", "review", "coordination", "conflict", "routine", "all"]):
            recommendations.extend(self.ops_agent.generate_recommendations(business_id))

        # Allow injecting external recommendations (e.g. Compliance GST liability, Growth ads)
        if external_recommendations:
            recommendations.extend(external_recommendations)

        # 4. Conflict Check
        total_requested = sum(r.required_cash for r in recommendations)
        conflict_detected = total_requested > system_state.liquid_buffer or (
            system_state.available_cash < 40000.0 and total_requested > 20000.0
        )

        # 5. Deterministic Conflict Arbitration
        arbitration_result: ArbitrationResult = self.arbitration_engine.arbitrate(
            recommendations=recommendations,
            state=system_state
        )

        # 6. Cryptographic Audit Logging
        decision_log_id = db.log_decision(
            business_id=business_id,
            query=query,
            inventory_recommendation=json.dumps(inventory_raw),
            finance_recommendation=json.dumps(finance_raw),
            conflict_detected=conflict_detected,
            final_decision=json.dumps(arbitration_result.to_dict()),
            rationale=arbitration_result.decision_rationale,
            execution_tier=arbitration_result.execution_tier.value,
            total_allocated_cost=arbitration_result.total_cash_allocated,
        )

        # Retrieve the newly generated entry's hash
        latest_hash = db.get_latest_decision_hash(business_id)

        return {
            "business_id": business_id,
            "business_name": business["business_name"],
            "query": query,
            "conflict_detected": conflict_detected,
            "execution_tier": arbitration_result.execution_tier.value,
            "arbitration_result": arbitration_result.to_dict(),
            "finance_summary": finance_raw,
            "inventory_summary": inventory_raw,
            "ops_summary": ops_raw,
            "action_cards": [c.to_dict() for c in arbitration_result.action_cards],
            "audit_trail": {
                "decision_log_id": decision_log_id,
                "entry_hash": latest_hash,
            },
        }

    def verify_business_audit_trail(self, business_id: int) -> Dict[str, Any]:
        """
        Verifies the cryptographic integrity of the entire decision chain for a business.
        """
        history = db.get_decision_history(business_id, limit=500)
        return verify_hash_chain(history)


# Singleton convenience instance
orchestrator = MultiAgentOrchestrator()
