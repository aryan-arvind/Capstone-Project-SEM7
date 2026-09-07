"""
Inventory Domain Intelligence Agent.
Monitors stock metrics, identifies stockout risks, and issues restock recommendations.
"""

from typing import List, Dict, Any
from src.schemas import Recommendation, AgentType, SystemState
from src.agents.base_agent import BaseDomainAgent


class InventoryAgent(BaseDomainAgent):
    """
    Monitors stock levels against minimum reorder thresholds.
    """

    def __init__(self):
        super().__init__(agent_name="Inventory Intelligence Agent", agent_type=AgentType.INVENTORY)

    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        recommendations: List[Recommendation] = []
        inventory_items = business_data.get("inventory_items", [])

        for item in inventory_items:
            stock = float(item.get("current_stock", 0.0))
            min_thresh = float(item.get("min_threshold", 10.0))
            reorder_qty = float(item.get("reorder_quantity", 50.0))
            unit_cost = float(item.get("unit_cost", 0.0))
            item_name = str(item.get("item_name", "Unknown Item"))
            item_id = str(item.get("item_id", "SKU-UNK"))

            # Trigger restock if current stock is at or below threshold
            if stock <= min_thresh:
                required_cash = reorder_qty * unit_cost
                stockout_deficit = min_thresh - stock
                urgency = min(0.95, 0.70 + (stockout_deficit / (min_thresh + 1.0)) * 0.25)
                
                rec = self.create_recommendation(
                    title=f"Emergency Restock: {item_name}",
                    description=f"Current stock ({stock} units) is below safety threshold ({min_thresh} units). Reorder {reorder_qty} units to prevent stockout.",
                    required_cash=required_cash,
                    urgency_score=urgency,
                    expected_roi_or_impact=0.90,
                    risk_score=0.20,
                    deadline_days=2.0,
                    metadata={
                        "item_id": item_id,
                        "item_name": item_name,
                        "current_stock": stock,
                        "reorder_quantity": reorder_qty,
                        "unit_cost": unit_cost
                    }
                )
                recommendations.append(rec)

        return recommendations
