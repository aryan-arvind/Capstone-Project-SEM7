"""
Procurement Domain Intelligence Agent.
Analyzes supplier bulk discounts and raw material cost optimization opportunities.
"""

from typing import List, Dict, Any
from src.schemas import Recommendation, AgentType, SystemState
from src.agents.base_agent import BaseDomainAgent


class ProcurementAgent(BaseDomainAgent):
    """
    Evaluates supplier proposals, volume discounts, and raw material pricing.
    """

    def __init__(self):
        super().__init__(agent_name="Procurement Intelligence Agent", agent_type=AgentType.COMPLIANCE)

    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []
        procurement_deals = business_data.get("procurement_deals", [])

        for deal in procurement_deals:
            supplier_name = str(deal.get("supplier_name", "Primary Vendor"))
            discount_pct = float(deal.get("discount_pct", 0.0))
            required_cash = float(deal.get("deal_cost", 2000.0))
            raw_material = str(deal.get("raw_material", "Raw Materials"))

            if discount_pct >= 10.0:
                rec = self.create_recommendation(
                    title=f"Bulk Discount ({discount_pct:.0f}% Savings): {raw_material} from {supplier_name}",
                    description=f"{supplier_name} offers a {discount_pct:.0f}% bulk discount for advance procurement of {raw_material}. Saves ₹{required_cash * (discount_pct / 100.0):,.2f}.",
                    required_cash=required_cash,
                    urgency_score=0.65,
                    expected_roi_or_impact=0.80,
                    risk_score=0.25,
                    deadline_days=5.0,
                    metadata={
                        "supplier_name": supplier_name,
                        "discount_pct": discount_pct,
                        "savings_amount": required_cash * (discount_pct / 100.0)
                    }
                )
                recommendations.append(rec)

        return recommendations
