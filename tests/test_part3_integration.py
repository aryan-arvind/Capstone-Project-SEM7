"""
Part 3 Integration, End-to-End Validation & Verification Suite for Kohli's Module:
- Section 2: Complete Module Verification (Inventory, Finance, Arbitration)
- Section 3: API Integration (POST /api/agents/evaluate endpoint)
- Section 6: Required Test Cases 1 through 5
- Section 7: Complete Data Flow Tracing
- Section 8: Decision Logging to SQLite decision_logs
"""

import os
import sys
import tempfile
import sqlite3
import unittest
from fastapi import HTTPException

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.agents.inventory_agent import InventoryAgent, inventory_agent
from src.agents.finance_agent import FinanceAgent, finance_agent
from src.arbitration import arbitrate_2agent
from src.api.routes.agent_routes import evaluate_agents, AgentEvaluateRequest


class TestPart3Validation(unittest.TestCase):

    def test_01_required_test1_budget_conflict(self):
        """TEST 1 — Budget Conflict: ₹50k requested vs ₹20k budget -> Approved ₹20k, Conflict: TRUE."""
        req = AgentEvaluateRequest(bank_cash=50000.0, payroll_reserve=30000.0)
        data = evaluate_agents(req)

        self.assertTrue(data["success"])
        inv = data["inventory"]
        fin = data["finance"]
        arb = data["arbitration"]

        # Inventory check
        self.assertEqual(inv["requested_amount"], 50000.0)
        self.assertEqual(inv["sku"], "SKU-001")

        # Finance check
        self.assertEqual(fin["free_liquid_cash"], 20000.0)
        self.assertEqual(fin["max_spend_allowed"], 20000.0)

        # Arbitration check (Test 1 requirements)
        self.assertTrue(arb["conflict_detected"], "Expected conflict=True")
        self.assertEqual(arb["requested_amount"], 50000.0)
        self.assertEqual(arb["budget_limit"], 20000.0)
        self.assertEqual(arb["approved_amount"], 20000.0)
        self.assertEqual(arb["decision"], "APPROVE_CAPPED")
        self.assertIn("capped", arb["reason"].lower())

    def test_02_required_test2_no_conflict(self):
        """TEST 2 — No Conflict: ₹15k requested vs ₹20k budget -> Approved ₹15k, Conflict: FALSE."""
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_path = temp_db.name
        temp_db.close()

        try:
            conn = sqlite3.connect(temp_path)
            try:
                conn.execute("""
                    CREATE TABLE inventory_items (
                        item_id TEXT PRIMARY KEY,
                        item_name TEXT,
                        current_stock REAL,
                        min_threshold REAL,
                        reorder_quantity REAL,
                        unit_cost REAL,
                        category TEXT
                    );
                """)
                # 15 units @ 1000 = ₹15,000
                conn.execute("""
                    INSERT INTO inventory_items VALUES ('SKU-001', 'Test Item', 5.0, 20.0, 15.0, 1000.0, 'Mechanical');
                """)
                conn.commit()
            finally:
                conn.close()

            req = AgentEvaluateRequest(
                bank_cash=50000.0,
                payroll_reserve=30000.0,
                db_path=temp_path
            )
            data = evaluate_agents(req)

            arb = data["arbitration"]
            self.assertFalse(arb["conflict_detected"], "Expected conflict=False")
            self.assertEqual(arb["requested_amount"], 15000.0)
            self.assertEqual(arb["budget_limit"], 20000.0)
            self.assertEqual(arb["approved_amount"], 15000.0)
            self.assertEqual(arb["decision"], "APPROVE_FULL")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_03_required_test3_exact_budget(self):
        """TEST 3 — Exact Budget: ₹20k requested vs ₹20k budget -> Approved ₹20k, Conflict: FALSE."""
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_path = temp_db.name
        temp_db.close()

        try:
            conn = sqlite3.connect(temp_path)
            try:
                conn.execute("""
                    CREATE TABLE inventory_items (
                        item_id TEXT PRIMARY KEY,
                        item_name TEXT,
                        current_stock REAL,
                        min_threshold REAL,
                        reorder_quantity REAL,
                        unit_cost REAL,
                        category TEXT
                    );
                """)
                # 20 units @ 1000 = ₹20,000
                conn.execute("""
                    INSERT INTO inventory_items VALUES ('SKU-001', 'Test Item', 5.0, 20.0, 20.0, 1000.0, 'Mechanical');
                """)
                conn.commit()
            finally:
                conn.close()

            req = AgentEvaluateRequest(
                bank_cash=50000.0,
                payroll_reserve=30000.0,
                db_path=temp_path
            )
            data = evaluate_agents(req)

            arb = data["arbitration"]
            self.assertFalse(arb["conflict_detected"], "Expected conflict=False")
            self.assertEqual(arb["requested_amount"], 20000.0)
            self.assertEqual(arb["budget_limit"], 20000.0)
            self.assertEqual(arb["approved_amount"], 20000.0)
            self.assertEqual(arb["decision"], "APPROVE_FULL")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_04_required_test4_no_low_stock(self):
        """TEST 4 — No Low-Stock Item: All stock >= threshold -> clear no-reorder result, no crash."""
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_path = temp_db.name
        temp_db.close()

        try:
            conn = sqlite3.connect(temp_path)
            try:
                conn.execute("""
                    CREATE TABLE inventory_items (
                        item_id TEXT PRIMARY KEY,
                        item_name TEXT,
                        current_stock REAL,
                        min_threshold REAL,
                        reorder_quantity REAL,
                        unit_cost REAL,
                        category TEXT
                    );
                """)
                # current_stock (50) >= min_threshold (20)
                conn.execute("""
                    INSERT INTO inventory_items VALUES ('SKU-001', 'Test Item', 50.0, 20.0, 20.0, 1000.0, 'Mechanical');
                """)
                conn.commit()
            finally:
                conn.close()

            req = AgentEvaluateRequest(
                bank_cash=50000.0,
                payroll_reserve=30000.0,
                db_path=temp_path
            )
            data = evaluate_agents(req)

            inv = data["inventory"]
            arb = data["arbitration"]

            # Inventory agent handles healthy state gracefully
            self.assertEqual(inv["status"], "OPTIMAL")
            self.assertEqual(inv["recommendation"], "none")
            self.assertEqual(inv["requested_amount"], 0.0)
            self.assertIn("healthy", inv["reason"].lower())

            # Arbitration handles zero demand gracefully
            self.assertEqual(arb["decision"], "NO_ACTION")
            self.assertEqual(arb["approved_amount"], 0.0)
            self.assertFalse(arb["conflict_detected"])
            self.assertIn("zero capital", arb["decision_text"].lower())
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_05_required_test5_api_failure_handling(self):
        """TEST 5 — API Failure Handling: Invalid database path returns useful HTTP 500 error rather than false success."""
        # Intentionally invalid sqlite file path in a non-existent subdirectory that cannot be opened as a database
        invalid_path = os.path.join("invalid_directory_does_not_exist_xyz", "nonexistent.db")

        with self.assertRaises(HTTPException) as ctx:
            evaluate_agents(AgentEvaluateRequest(db_path=invalid_path))

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertIn("Agent evaluation pipeline failed", ctx.exception.detail)

    def test_06_decision_logging_audit(self):
        """SECTION 8 — Decision Logging: Verifies non-destructive logging to SQLite decision_logs."""
        db_path = os.path.join("data", "sme_digitalized_data.db")
        self.assertTrue(os.path.exists(db_path), "Database data/sme_digitalized_data.db must exist.")

        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM decision_logs")
            count_before = cursor.fetchone()[0]
        finally:
            conn.close()

        # Trigger evaluation via API endpoint logic
        res = evaluate_agents(AgentEvaluateRequest())
        self.assertTrue(res["success"])

        # Check that decision was logged
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM decision_logs")
            count_after = cursor.fetchone()[0]
            self.assertGreater(count_after, count_before)

            cursor.execute("""
                SELECT sku, requested_amount, budget_limit, approved_amount, conflict_detected, decision 
                FROM decision_logs 
                ORDER BY id DESC LIMIT 1
            """)
            row = cursor.fetchone()
            self.assertEqual(row[0], "SKU-001")
            self.assertEqual(row[1], 50000.0)
            self.assertEqual(row[2], 20000.0)
            self.assertEqual(row[3], 20000.0)
            self.assertEqual(row[4], 1)
            self.assertEqual(row[5], "APPROVE_CAPPED")
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
