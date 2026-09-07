"""
Unit tests for SHA-256 Cryptographic Audit Ledger Engine (src/core/audit.py & src/core/database.py).
Verifies single-table decision_log schema, hash-chaining, and tamper detection.
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.core.database import init_db, log_decision, update_action_status, get_connection
from src.core.audit import compute_hash, stamp_decision, verify_chain


class TestAuditEngine(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_audit.db")
        init_db(self.test_db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_audit_logging_and_tamper_detection(self):
        # 1. Log 3 decisions
        id1 = log_decision('{"amount": 1000.0}', "Test 1", db_path=self.test_db_path)
        update_action_status(id1, "CONFIRMED", "tx_1001", db_path=self.test_db_path)
        stamped1 = stamp_decision(id1, db_path=self.test_db_path)

        id2 = log_decision('{"amount": 2000.0}', "Test 2", db_path=self.test_db_path)
        update_action_status(id2, "HELD_IN_AUDIT_STATE", None, db_path=self.test_db_path)
        stamped2 = stamp_decision(id2, db_path=self.test_db_path)

        id3 = log_decision('{"amount": 3000.0}', "Test 3", db_path=self.test_db_path)
        update_action_status(id3, "CONFIRMED", "tx_1003", db_path=self.test_db_path)
        stamped3 = stamp_decision(id3, db_path=self.test_db_path)

        self.assertIsNotNone(stamped1["curr_hash"])
        self.assertEqual(stamped1["prev_hash"], "GENESIS_BLOCK_00000000000000000000000000000000000000000000000000000000")
        self.assertEqual(stamped2["prev_hash"], stamped1["curr_hash"])
        self.assertEqual(stamped3["prev_hash"], stamped2["curr_hash"])

        # 2. Verify chain
        valid, failed_id = verify_chain(db_path=self.test_db_path)
        self.assertTrue(valid)
        self.assertIsNone(failed_id)

        # 3. Simulate database tampering on row 2
        with get_connection(self.test_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE decision_log SET action_status = 'TAMPERED_STATUS' WHERE id = ?", (id2,))
            conn.commit()

        # 4. Verify tamper detection
        valid_after_tamper, tamper_id = verify_chain(db_path=self.test_db_path)
        self.assertFalse(valid_after_tamper)
        self.assertEqual(tamper_id, id2)


if __name__ == "__main__":
    unittest.main()
