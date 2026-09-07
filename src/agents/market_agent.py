"""
Market Intelligence Agent.
Tracks market demand surges, competitor pricing, and seasonal sales signals.
"""

from typing import List, Dict, Any
from src.schemas import Recommendation, AgentType, SystemState
from src.agents.base_agent import BaseDomainAgent


class MarketAgent(BaseDomainAgent):
    """
    Monitors market demand surges and growth opportunities.
    """

    def __init__(self):
        super().__init__(agent_name="Market Intelligence Agent", agent_type=AgentType.GROWTH)

    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []
        market_signals = business_data.get("market_signals", {})
        demand_surge_pct = float(market_signals.get("demand_surge_pct", 0.0))
        target_product = market_signals.get("target_product", "Peak Sale Season Category")

        if demand_surge_pct >= 25.0:
            required_cash = float(market_signals.get("recommended_budget", 3000.0))
            rec = self.create_recommendation(
                title=f"Capitalize on {demand_surge_pct:.0f}% Market Demand Surge for {target_product}",
                description=f"Market intelligence detected a {demand_surge_pct:.0f}% spike in consumer demand. Recommend acquiring extra inventory to capture peak season margins.",
                required_cash=required_cash,
                urgency_score=0.85,
                expected_roi_or_impact=0.95,
                risk_score=0.35,
                deadline_days=3.0,
                metadata={
                    "demand_surge_pct": demand_surge_pct,
                    "target_product": target_product
                }
            )
            recommendations.append(rec)

        return recommendations
