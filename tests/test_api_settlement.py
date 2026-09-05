"""
Integration tests for FastAPI endpoints (src/api/main.py).
Verifies B2B action settlement, API failure fallback handling, and cryptographic audit endpoints.
"""

import os
import sys
import tempfile
import unittest
from fastapi.testclient import TestClient

# Ensure project root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.api.main import app


class TestAPISettlement(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_api_audit.db")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_successful_action_confirm(self):
        payload = {
            "decision_id": "DEC-API-101",
            "amount": 2500.0,
            "supplier_id": "SUPP-999",
            "ai_rationale": "High stockout risk detected for Item A. Order approved under cash budget.",
            "currency": "INR",
            "simulate_failure": False,
            "db_path": self.test_db_path
        }

        response = self.client.post("/action/confirm", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "SETTLED")
        self.assertIn("order", data)
        self.assertEqual(data["audit_entry"]["status"], "SETTLED")
        self.assertEqual(data["audit_entry"]["decision_id"], "DEC-API-101")
        self.assertIsNotNone(data["audit_entry"]["curr_hash"])

    def test_failed_action_confirm_fallback(self):
        payload = {
            "decision_id": "DEC-API-102",
            "amount": 4000.0,
            "supplier_id": "SUPP-888",
            "ai_rationale": "Bulk purchase recommendation.",
            "currency": "INR",
            "simulate_failure": True,  # Trigger simulated gateway failure
            "db_path": self.test_db_path
        }

        response = self.client.post("/action/confirm", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "HELD_IN_AUDIT_STATE")
        self.assertIn("Gateway Timeout", data["reason"])
        self.assertEqual(data["audit_entry"]["status"], "HELD_IN_AUDIT_STATE")
        self.assertIsNone(data["audit_entry"]["transaction_id"])

    def test_audit_verify_endpoint(self):
        # Insert a record first
        payload = {
            "decision_id": "DEC-API-103",
            "amount": 1000.0,
            "supplier_id": "SUPP-777",
            "ai_rationale": "Routine restock.",
            "db_path": self.test_db_path
        }
        self.client.post("/action/confirm", json=payload)

        # Verify audit chain
        response = self.client.get(f"/audit/verify?db_path={self.test_db_path}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_valid"])
        self.assertIsNone(data["failed_index"])


if __name__ == "__main__":
    unittest.main()
