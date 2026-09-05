"""
Unit & Integration Tests for Multimodal SME Data Digitalization & Verification Engine (src/ingestion/).
"""

import os
import sys
import tempfile
import unittest

# Ensure project root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.ingestion.column_resolver import ColumnResolver
from src.ingestion.schemas import VerificationStatus, DocumentType
from src.ingestion.digitalizer import SMEDigitalizerEngine


class TestSMEDigitalizer(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_sme_data.db")
        self.engine = SMEDigitalizerEngine(db_path=self.test_db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_column_resolver_synonyms(self):
        raw_headers = ["Item", "Qty", "Price Per Unit", "On Hand", "Vendor"]
        mapped = ColumnResolver.resolve_columns(raw_headers)

        self.assertEqual(mapped["Item"], "item_name")
        self.assertEqual(mapped["Qty"], "quantity")
        self.assertEqual(mapped["Price Per Unit"], "unit_price")
        self.assertEqual(mapped["On Hand"], "current_stock")
        self.assertEqual(mapped["Vendor"], "supplier_name")

    def test_inventory_csv_ingestion(self):
        csv_content = (
            "Item,Qty Available,Unit Cost,Reorder Point\n"
            "Widget Alpha,15,120.50,10\n"
            "Widget Beta,3,450.00,5\n"
        )
        csv_path = os.path.join(self.temp_dir.name, "raw_inventory.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(csv_content)

        items, summary = self.engine.ingest_inventory_file(csv_path)

        self.assertEqual(len(items), 2)
        self.assertEqual(summary.document_type, DocumentType.INVENTORY_LIST)
        self.assertEqual(summary.valid_records, 2)
        self.assertEqual(summary.verification_status, VerificationStatus.VALIDATED)
        self.assertEqual(items[0].item_name, "Widget Alpha")
        self.assertEqual(items[0].current_stock, 15.0)

    def test_text_invoice_parsing_and_arithmetic_validation(self):
        # Case A: Perfectly Valid Invoice
        valid_text = (
            "Invoice ID: INV-2026-99\n"
            "Supplier: Acme Industrial Corp\n"
            "Date: 2026-09-04\n"
            "Line Items:\n"
            "Raw Steel Plates | 10 | 500.00 | 5000.00\n"
            "Fastener Bolts | 20 | 25.00 | 500.00\n"
            "Subtotal: 5500.00\n"
            "Tax: 500.00\n"
            "Grand Total: 6000.00\n"
        )

        inv_a = self.engine.parse_text_invoice(valid_text)
        self.assertEqual(inv_a.invoice_id, "INV-2026-99")
        self.assertEqual(inv_a.supplier_name, "Acme Industrial Corp")
        self.assertEqual(inv_a.verification_status, VerificationStatus.VALIDATED)
        self.assertEqual(len(inv_a.discrepancies), 0)
        self.assertEqual(inv_a.grand_total, 6000.00)

        # Case B: Invoice with Arithmetic Discrepancy (10 x 500 = 5000, but stated total is 9999.00)
        tampered_text = (
            "Invoice ID: INV-2026-ERR\n"
            "Supplier: Bad Actor Corp\n"
            "Date: 2026-09-04\n"
            "Line Items:\n"
            "Raw Steel Plates | 10 | 500.00 | 9999.00\n"
            "Subtotal: 9999.00\n"
            "Tax: 0.00\n"
            "Grand Total: 9999.00\n"
        )

        inv_b = self.engine.parse_text_invoice(tampered_text)
        self.assertEqual(inv_b.verification_status, VerificationStatus.DISCREPANCY_FLAGGED)
        self.assertTrue(len(inv_b.discrepancies) > 0)
        self.assertIn("Stated total ₹9,999.00 != Calculated total ₹5,000.00", inv_b.discrepancies[0])

    def test_batch_file_ingestion(self):
        # Create CSV inventory file
        csv_path = os.path.join(self.temp_dir.name, "batch_inv.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("Item,Qty,Unit Price\nItem 1,10,100\n")

        # Create TXT invoice file
        txt_path = os.path.join(self.temp_dir.name, "batch_invoice.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(
                "Invoice ID: INV-BATCH-01\n"
                "Supplier: Batch Vendor\n"
                "Date: 2026-09-04\n"
                "Item X | 5 | 20.00 | 100.00\n"
                "Subtotal: 100.00\n"
                "Tax: 0.00\n"
                "Grand Total: 100.00\n"
            )

        res = self.engine.ingest_batch_files([csv_path, txt_path])

        self.assertEqual(res["total_files"], 2)
        self.assertEqual(res["processed_inventory_items"], 1)
        self.assertEqual(res["processed_invoices"], 1)
        self.assertEqual(res["status"], "SUCCESS")


if __name__ == "__main__":
    unittest.main()

