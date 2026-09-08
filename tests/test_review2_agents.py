"""
Comprehensive Unit & Integration Test Suite for Review 2 (Kohli):
- K.1: Inventory Agent (SQLite inventory_items query, stock < threshold, reorder SKU-001 for ₹50,000)
- K.2: Finance Agent (Free Liquid Cash = Bank Cash - Payroll Reserve, max spend = ₹20,000)
- K.3: 2-Agent Arbitrator (Enforces capping rule: ₹50,000 demand capped to ₹20,000 ceiling -> Approved = ₹20,000)
- K.4: Agent API (POST /api/agents/evaluate full arbitrated decision)
- K.5: Decision Card payload structure verification
"""

import os
import sys
import tempfile
import sqlite3
import unittest

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.agents.inventory_agent import InventoryAgent, inventory_agent
from src.agents.finance_agent import FinanceAgent, finance_agent
from src.arbitration import arbitrate_2agent, TwoAgentArbitrator, two_agent_arbitrator
from src.api.routes.agent_routes import evaluate_agents, AgentEvaluateRequest


class TestReview2Agents(unittest.TestCase):

    def setUp(self):
        # Create a temporary SQLite database for isolated testing
        self.temp_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.temp_db_file.name
        self.temp_db_file.close()

        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE inventory_items (
                    item_id TEXT PRIMARY KEY,
                    item_name TEXT NOT NULL,
                    current_stock REAL NOT NULL,
                    min_threshold REAL NOT NULL,
                    reorder_quantity REAL NOT NULL,
                    unit_cost REAL NOT NULL,
                    category TEXT
                );
            """)
            cursor.execute("""
                CREATE TABLE financial_reserves (
                    business_id INTEGER PRIMARY KEY,
                    bank_cash REAL NOT NULL,
                    payroll_reserve REAL NOT NULL,
                    updated_at TEXT
                );
            """)
            # Seed SKU-001 with current_stock (5) < min_threshold (20), reorder 50 @ 1000 = 50,000
            cursor.executemany("""
                INSERT INTO inventory_items VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                ('SKU-001', 'Industrial Bearing Model X', 5.0, 20.0, 50.0, 1000.0, 'Mechanical'),
                ('SKU-002', 'High-Temp Lubricant', 60.0, 30.0, 40.0, 250.0, 'Consumables'),
                ('SKU-003', 'Hydraulic Seal Ring', 45.0, 40.0, 100.0, 120.0, 'Mechanical')
            ])
            # Seed Bank Cash = 50,000, Payroll Reserve = 30,000 -> Free Liquid Cash = 20,000
            cursor.execute("""
                INSERT INTO financial_reserves VALUES (?, ?, ?, datetime('now'))
            """, (1, 50000.0, 30000.0))
            conn.commit()
        finally:
            conn.close()

    def tearDown(self):
        if os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except Exception:
                pass

    # =========================================================================
    # K.1 — Inventory Agent Tests
    # =========================================================================
    def test_k1_inventory_agent_reorder_recommendation(self):
        """K.1: Identifies SKU-001 where stock < threshold and returns Reorder SKU-001 for ₹50,000."""
        agent = InventoryAgent()
        result = agent.evaluate(db_path=self.db_path)

        self.assertEqual(result["agent"], "inventory")
        self.assertEqual(result["status"], "ACTION_REQUIRED")
        self.assertEqual(result["low_stock_count"], 1)
        self.assertEqual(result["total_reorder_cost"], 50000.0)
        self.assertEqual(result["recommended_sku"], "SKU-001")
        self.assertIn("Reorder SKU-001 for ₹50,000", result["recommendation_text"])

        item = result["critical_items"][0]
        self.assertEqual(item["sku"], "SKU-001")
        self.assertEqual(item["current_stock"], 5.0)
        self.assertEqual(item["min_threshold"], 20.0)
        self.assertEqual(item["reorder_quantity"], 50.0)
        self.assertEqual(item["unit_cost"], 1000.0)
        self.assertEqual(item["reorder_cost"], 50000.0)

    def test_k1_inventory_agent_healthy_stock(self):
        """K.1 Edge Case: When all stock is above threshold, status is OPTIMAL with 0 reorder ask."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("UPDATE inventory_items SET current_stock = 50.0 WHERE item_id = 'SKU-001'")
            conn.commit()
        finally:
            conn.close()

        agent = InventoryAgent()
        result = agent.evaluate(db_path=self.db_path)
        self.assertEqual(result["status"], "OPTIMAL")
        self.assertEqual(result["total_reorder_cost"], 0.0)
        self.assertEqual(result["low_stock_count"], 0)

    # =========================================================================
    # K.2 — Finance Agent Tests
    # =========================================================================
    def test_k2_finance_agent_budget_ceiling(self):
        """K.2: Free Liquid Cash = Bank Cash (50k) - Payroll Reserve (30k) = Max spend allowed = ₹20,000."""
        agent = FinanceAgent()
        result = agent.evaluate(db_path=self.db_path)

        self.assertEqual(result["agent"], "finance")
        self.assertEqual(result["status"], "APPROVED_BUDGET")
        self.assertEqual(result["bank_cash"], 50000.0)
        self.assertEqual(result["payroll_reserve"], 30000.0)
        self.assertEqual(result["free_liquid_cash"], 20000.0)
        self.assertEqual(result["max_spend_allowed"], 20000.0)
        self.assertIn("Max spend allowed = ₹20,000", result["recommendation_text"])

    def test_k2_finance_agent_parameter_overrides(self):
        """K.2: Supports explicit override parameters for what-if scenarios."""
        agent = FinanceAgent()
        result = agent.evaluate(bank_cash=120000.0, payroll_reserve=40000.0, db_path=self.db_path)

        self.assertEqual(result["bank_cash"], 120000.0)
        self.assertEqual(result["payroll_reserve"], 40000.0)
        self.assertEqual(result["free_liquid_cash"], 80000.0)
        self.assertEqual(result["max_spend_allowed"], 80000.0)
        self.assertIn("Max spend allowed = ₹80,000", result["recommendation_text"])

    def test_k2_finance_agent_negative_liquidity(self):
        """K.2 Edge Case: When payroll reserve exceeds bank cash, max spend is bounded to 0."""
        agent = FinanceAgent()
        result = agent.evaluate(bank_cash=25000.0, payroll_reserve=30000.0, db_path=self.db_path)

        self.assertEqual(result["free_liquid_cash"], 0.0)
        self.assertEqual(result["max_spend_allowed"], 0.0)
        self.assertEqual(result["status"], "BUDGET_EXHAUSTED")

    # =========================================================================
    # K.3 — 2-Agent Arbitrator Tests
    # =========================================================================
    def test_k3_arbitration_capping_rule(self):
        """K.3: Inventory asks ₹50,000, Finance allows ₹20,000 -> Approved = ₹20,000."""
        inv_out = inventory_agent.evaluate(db_path=self.db_path)
        fin_out = finance_agent.evaluate(db_path=self.db_path)

        arb_out = arbitrate_2agent(inv_out, fin_out)

        self.assertEqual(arb_out["requested_spend"], 50000.0)
        self.assertEqual(arb_out["budget_ceiling"], 20000.0)
        self.assertEqual(arb_out["approved_spend"], 20000.0)
        self.assertTrue(arb_out["is_capped"])
        self.assertEqual(arb_out["status"], "CAPPED")
        self.assertEqual(arb_out["approved_text"], "Approved = ₹20,000")
        self.assertEqual(arb_out["curtailed_amount"], 30000.0)
        self.assertIn("Approved = ₹20,000", arb_out["decision_text"])
        self.assertIn("ACT-ARB", arb_out["action_card"]["card_id"])
        self.assertEqual(arb_out["action_card"]["approved_amount"], 20000.0)

    def test_k3_arbitration_within_budget(self):
        """K.3: When inventory ask is within budget ceiling, full spend is approved without capping."""
        inv_out = {"total_reorder_cost": 15000.0, "critical_items": [{"sku": "SKU-001"}]}
        fin_out = {"max_spend_allowed": 20000.0}

        arb_out = arbitrate_2agent(inv_out, fin_out)
        self.assertEqual(arb_out["approved_spend"], 15000.0)
        self.assertFalse(arb_out["is_capped"])
        self.assertEqual(arb_out["status"], "APPROVED_FULL")

    # =========================================================================
    # Section 19: Required Test Cases from Official Prompt
    # =========================================================================
    def test_section19_test1_capped_reorder(self):
        """Test 1 — Capped Reorder: Inventory: ₹50,000, Finance: ₹20,000 -> Approved: ₹20,000, Conflict: TRUE."""
        inv_out = {"requested_amount": 50000.0, "total_reorder_cost": 50000.0, "sku": "SKU-001"}
        fin_out = {"max_spend_allowed": 20000.0, "free_liquid_cash": 20000.0}

        arb_out = arbitrate_2agent(inv_out, fin_out)

        self.assertEqual(arb_out["approved_amount"], 20000.0)
        self.assertEqual(arb_out["approved_spend"], 20000.0)
        self.assertTrue(arb_out["conflict_detected"])
        self.assertEqual(arb_out["decision"], "APPROVE_CAPPED")
        self.assertEqual(arb_out["requested_amount"], 50000.0)
        self.assertEqual(arb_out["budget_limit"], 20000.0)

    def test_section19_test2_full_approval(self):
        """Test 2 — Full Approval: Inventory: ₹15,000, Finance: ₹20,000 -> Approved: ₹15,000, Conflict: FALSE."""
        inv_out = {"requested_amount": 15000.0, "total_reorder_cost": 15000.0, "sku": "SKU-001"}
        fin_out = {"max_spend_allowed": 20000.0, "free_liquid_cash": 20000.0}

        arb_out = arbitrate_2agent(inv_out, fin_out)

        self.assertEqual(arb_out["approved_amount"], 15000.0)
        self.assertEqual(arb_out["approved_spend"], 15000.0)
        self.assertFalse(arb_out["conflict_detected"])
        self.assertEqual(arb_out["decision"], "APPROVE_FULL")
        self.assertEqual(arb_out["requested_amount"], 15000.0)
        self.assertEqual(arb_out["budget_limit"], 20000.0)

    def test_section19_test3_exact_budget(self):
        """Test 3 — Exact Budget: Inventory: ₹20,000, Finance: ₹20,000 -> Approved: ₹20,000, Conflict: FALSE."""
        inv_out = {"requested_amount": 20000.0, "total_reorder_cost": 20000.0, "sku": "SKU-001"}
        fin_out = {"max_spend_allowed": 20000.0, "free_liquid_cash": 20000.0}

        arb_out = arbitrate_2agent(inv_out, fin_out)

        self.assertEqual(arb_out["approved_amount"], 20000.0)
        self.assertEqual(arb_out["approved_spend"], 20000.0)
        self.assertFalse(arb_out["conflict_detected"])
        self.assertEqual(arb_out["decision"], "APPROVE_FULL")
        self.assertEqual(arb_out["requested_amount"], 20000.0)
        self.assertEqual(arb_out["budget_limit"], 20000.0)

    def test_section19_test4_no_low_stock(self):
        """Test 4 — No Low Stock: When all stock >= threshold, returns appropriate no-reorder result and does not crash."""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("UPDATE inventory_items SET current_stock = 100.0 WHERE item_id = 'SKU-001'")
            conn.commit()
        finally:
            conn.close()

        agent = InventoryAgent()
        inv_out = agent.evaluate(db_path=self.db_path)
        self.assertEqual(inv_out["status"], "OPTIMAL")
        self.assertEqual(inv_out["requested_amount"], 0.0)
        self.assertEqual(inv_out["recommendation"], "none")
        self.assertEqual(inv_out["low_stock_count"], 0)

        # Arbitrate with no low stock
        fin_out = finance_agent.evaluate(db_path=self.db_path)
        arb_out = arbitrate_2agent(inv_out, fin_out)
        self.assertEqual(arb_out["approved_amount"], 0.0)
        self.assertFalse(arb_out["conflict_detected"])
        self.assertEqual(arb_out["decision"], "NO_ACTION")

    # =========================================================================
    # K.4 — Agent API Route Tests
    # =========================================================================
    def test_k4_api_evaluate_endpoint(self):
        """K.4: POST /api/agents/evaluate returns full arbitrated decision object."""
        req = AgentEvaluateRequest(db_path=self.db_path)
        res = evaluate_agents(req)

        self.assertTrue(res["success"])
        self.assertIn("inventory", res)
        self.assertIn("finance", res)
        self.assertIn("arbitration", res)

        self.assertEqual(res["inventory"]["total_reorder_cost"], 50000.0)
        self.assertEqual(res["finance"]["max_spend_allowed"], 20000.0)
        self.assertEqual(res["arbitration"]["approved_spend"], 20000.0)
        self.assertTrue(res["arbitration"]["is_capped"])
        self.assertEqual(res["arbitration"]["approved_text"], "Approved = ₹20,000")


if __name__ == "__main__":
    unittest.main(verbosity=2)
