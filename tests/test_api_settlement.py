"""
Integration tests for FastAPI endpoints (src/api/main.py).
Verifies B2B action settlement, owner rejection, gateway failure fallback, and cryptographic audit endpoints.
"""

import os
import sys
import tempfile
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.api.main import app
from src.core.database import log_decision, DEFAULT_DB_PATH


class TestAPISettlement(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_successful_action_confirm(self):
        # 1. Log decision in DB
        row_id = log_decision('{"approved_amount": 2500.0}', "High stockout risk detected.")
        payload = {
            "decision_log_id": row_id,
            "approved": True
        }

        response = self.client.post("/action/confirm", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "CONFIRMED")
        self.assertIsNotNone(data["transaction_id"])
        self.assertIsNone(data["error"])
        self.assertEqual(data["decision_log_id"], row_id)

    def test_owner_rejection_action_confirm(self):
        row_id = log_decision('{"approved_amount": 3500.0}', "Optional marketing spend.")
        payload = {
            "decision_log_id": row_id,
            "approved": False
        }

        response = self.client.post("/action/confirm", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "REJECTED_BY_OWNER")
        self.assertIsNone(data["transaction_id"])
        self.assertEqual(data["decision_log_id"], row_id)

    def test_failed_action_confirm_fallback(self):
        row_id = log_decision('{"approved_amount": 4000.0}', "Bulk purchase recommendation.")
        payload = {
            "decision_log_id": row_id,
            "approved": True
        }

        # Trigger simulated gateway failure via env variable
        os.environ["DEMO_FORCE_GATEWAY_FAILURE"] = "1"
        try:
            response = self.client.post("/action/confirm", json=payload)
            self.assertEqual(response.status_code, 200)
            data = response.json()

            self.assertEqual(data["status"], "HELD_IN_AUDIT_STATE")
            self.assertIn("Simulated gateway timeout", data["error"])
            self.assertIsNone(data["transaction_id"])
            self.assertIn("recovery_note", data)
        finally:
            os.environ.pop("DEMO_FORCE_GATEWAY_FAILURE", None)

    def test_audit_verify_endpoint(self):
        response = self.client.get("/audit/verify")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_valid"])


if __name__ == "__main__":
    unittest.main()
