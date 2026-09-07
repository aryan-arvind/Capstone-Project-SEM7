"""
Unit tests for Domain Intelligence Agents (src/agents/).
Verifies recommendation generation across Inventory, Market, Procurement, Finance, and Operations agents.
"""

import os
import sys
import unittest

# Ensure project root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.schemas import SystemState, AgentType
from src.agents.inventory_agent import InventoryAgent
from src.agents.market_agent import MarketAgent
from src.agents.procurement_agent import ProcurementAgent
from src.agents.finance_agent import FinanceAgent
from src.agents.operations_agent import OperationsAgent


class TestDomainAgents(unittest.TestCase):

    def setUp(self):
        self.state = SystemState(available_cash=8000.0, time_window_days=7.0)
        self.business_data = {
            "inventory_items": [
                {
                    "item_id": "SKU-001",
                    "item_name": "Raw Industrial Bolts",
                    "current_stock": 4.0,  # Below threshold 10
                    "min_threshold": 10.0,
                    "reorder_quantity": 50.0,
                    "unit_cost": 20.0
                }
            ],
            "upcoming_payroll_reserve": 2000.0,
            "market_signals": {
                "demand_surge_pct": 40.0,
                "target_product": "High-Grade Fasteners",
                "recommended_budget": 2500.0
            },
            "procurement_deals": [
                {
                    "supplier_name": "Acme Steel Corp",
                    "raw_material": "Steel Alloy Bars",
                    "discount_pct": 15.0,
                    "deal_cost": 2000.0
                }
            ],
            "pending_order_delays": 7
        }

    def test_inventory_agent(self):
        agent = InventoryAgent()
        recs = agent.evaluate(self.state, self.business_data)
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0].agent_type, AgentType.INVENTORY)
        self.assertEqual(recs[0].required_cash, 1000.0)  # 50 * 20
        self.assertGreaterEqual(recs[0].urgency_score, 0.80)

    def test_market_agent(self):
        agent = MarketAgent()
        recs = agent.evaluate(self.state, self.business_data)
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0].required_cash, 2500.0)
        self.assertEqual(recs[0].expected_roi_or_impact, 0.95)

    def test_procurement_agent(self):
        agent = ProcurementAgent()
        recs = agent.evaluate(self.state, self.business_data)
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0].required_cash, 2000.0)
        self.assertEqual(recs[0].metadata["discount_pct"], 15.0)

    def test_operations_agent(self):
        agent = OperationsAgent()
        recs = agent.evaluate(self.state, self.business_data)
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0].required_cash, 1500.0)

    def test_all_agents_evaluation_flow(self):
        agents = [
            InventoryAgent(),
            MarketAgent(),
            ProcurementAgent(),
            FinanceAgent(),
            OperationsAgent()
        ]
        all_recs = []
        for agent in agents:
            all_recs.extend(agent.evaluate(self.state, self.business_data))

        self.assertGreaterEqual(len(all_recs), 4)


if __name__ == "__main__":
    unittest.main()
