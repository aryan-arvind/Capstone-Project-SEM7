"""
Finance Domain Intelligence Agent.
Monitors working capital liquidity, payroll obligations, and financial risk limits.
"""

from typing import List, Dict, Any
from src.schemas import Recommendation, AgentType, SystemState
from src.agents.base_agent import BaseDomainAgent


class FinanceAgent(BaseDomainAgent):
    """
    Monitors liquid working capital, cash reserves, and financial safety boundaries.
    """

    def __init__(self):
        super().__init__(agent_name="Finance Intelligence Agent", agent_type=AgentType.FINANCE)

    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []
        payroll_reserve = float(business_data.get("upcoming_payroll_reserve", 2000.0))
        available_liquidity = state.available_cash

        # Issue safety guardrail if liquid cash is below mandatory working capital threshold
        if available_liquidity < payroll_reserve * 1.5:
            rec = self.create_recommendation(
                title="Working Capital Protection Guardrail",
                description=f"Liquid cash (₹{available_liquidity:,.2f}) is close to mandatory payroll reserve (₹{payroll_reserve:,.2f}). Recommend gating high-amount non-essential spending.",
                required_cash=0.0,
                urgency_score=0.90,
                expected_roi_or_impact=0.85,
                risk_score=0.10,
                deadline_days=1.0,
                metadata={
                    "payroll_reserve": payroll_reserve,
                    "available_liquidity": available_liquidity
                }
            )
            recommendations.append(rec)

        return recommendations
