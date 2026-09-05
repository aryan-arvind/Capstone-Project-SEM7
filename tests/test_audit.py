"""
Unit tests for Cryptographic Audit Engine (src/core/audit.py).
Verifies valid chain verification and tampering detection via SHA-256 hash checking.
"""

import os
import sys
import tempfile
import unittest

# Ensure project root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.core.audit import append_entry, verify_chain, get_connection


class TestAuditEngine(unittest.TestCase):

    def setUp(self):
        # Create a temporary directory for an isolated test database
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_audit.db")

    def tearDown(self):
        # Clean up temporary directory
        self.temp_dir.cleanup()

    def test_audit_logging_and_tamper_detection(self):
        # 1. Insert 3 entries via append_entry
        entry1 = append_entry("DEC-001", "TXN-1001", "APPROVED", db_path=self.test_db_path)
        entry2 = append_entry("DEC-002", "TXN-1002", "HELD_IN_AUDIT_STATE", db_path=self.test_db_path)
        entry3 = append_entry("DEC-003", "TXN-1003", "SETTLED", db_path=self.test_db_path)

        self.assertIsNotNone(entry1["curr_hash"])
        self.assertEqual(entry1["prev_hash"], "GENESIS")
        self.assertEqual(entry2["prev_hash"], entry1["curr_hash"])
        self.assertEqual(entry3["prev_hash"], entry2["curr_hash"])

        # 2. Assert verify_chain() returns (True, None)
        valid, failed_index = verify_chain(db_path=self.test_db_path)
        self.assertTrue(valid)
        self.assertIsNone(failed_index)

        # 3. Directly UPDATE row 2's transaction_id in DB (simulating tampering)
        # Note: row 2 in 1-based SQL primary key corresponds to 0-indexed row 1 in python iteration.
        with get_connection(self.test_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE decision_log SET transaction_id = 'TAMPERED_TXN' WHERE id = 2")
            conn.commit()

        # 4. Assert verify_chain() now returns (False, 1)
        valid_after_tamper, tamper_index = verify_chain(db_path=self.test_db_path)
        self.assertFalse(valid_after_tamper)
        self.assertEqual(tamper_index, 1)


if __name__ == "__main__":
    unittest.main()

