"""
Operations Domain Intelligence Agent.
Monitors order fulfillment SLAs, shipping delays, and logistics operational bottlenecks.
"""

from typing import List, Dict, Any
from src.schemas import Recommendation, AgentType, SystemState
from src.agents.base_agent import BaseDomainAgent


class OperationsAgent(BaseDomainAgent):
    """
    Monitors fulfillment bottlenecks, delivery SLAs, and logistics efficiency.
    """

    def __init__(self):
        super().__init__(agent_name="Operations Intelligence Agent", agent_type=AgentType.CUSTOMER)

    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []
        pending_orders = business_data.get("pending_order_delays", 0)

        if pending_orders >= 5:
            required_cash = 1500.0
            rec = self.create_recommendation(
                title=f"Expedite Logistics: {pending_orders} Orders Delayed Beyond SLA",
                description=f"{pending_orders} pending customer orders are experiencing courier delays. Recommend routing via expedited courier partner to prevent customer churn.",
                required_cash=required_cash,
                urgency_score=0.80,
                expected_roi_or_impact=0.75,
                risk_score=0.25,
                deadline_days=1.5,
                metadata={
                    "pending_orders": pending_orders
                }
            )
            recommendations.append(rec)

        return recommendations
