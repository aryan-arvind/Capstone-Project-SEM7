"""
Tests for Data Digitalization & Ingestion Contract Compliance.
Verifies:
  1. Primary SQLite DB (data/ingestion_standalone.db) and Fallback DB (data/capstone.db) resolution
  2. Exact table schemas: `invoices` and `inventory_items` matching contract types
  3. `get_digitalized_business_context()` return structure and data types
  4. `raw_payload_json` parsing and `InvoiceLineItemPayload` dataclass
  5. `InvoiceRecord` and `InventoryItemRecord` schemas
  6. Downstream `InventoryAgent` and `FinanceAgent` digitalized evaluation
"""

import os
import json
import sqlite3
import unittest

from src.data_loader import (
    resolve_ingestion_db_path,
    init_ingestion_standalone_db,
    get_digitalized_business_context,
    get_digitalized_inventory,
    get_digitalized_invoices,
    parse_invoice_payload,
)
from src.schemas import (
    InvoiceRecord,
    InventoryItemRecord,
    InvoiceLineItemPayload,
)
from src.core.database import init_db, DB_PATH
from src.agents.inventory_agent import inventory_agent
from src.agents.finance_agent import finance_agent


class TestDataLoaderContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Ensure standalone and capstone DBs are initialized and seeded
        cls.standalone_path = init_ingestion_standalone_db()
        init_db()

    def test_01_primary_db_resolution(self):
        """Verifies primary DB resolves to data/ingestion_standalone.db."""
        resolved = resolve_ingestion_db_path()
        self.assertTrue(os.path.exists(resolved), f"Resolved DB path {resolved} does not exist")
        self.assertTrue(
            resolved.endswith("ingestion_standalone.db"),
            f"Expected primary DB ingestion_standalone.db, got {resolved}"
        )

    def test_02_fallback_db_resolution(self):
        """Verifies custom/fallback DB path resolution."""
        fallback = resolve_ingestion_db_path(DB_PATH)
        self.assertEqual(fallback, os.path.abspath(DB_PATH))

    def test_03_invoices_table_schema(self):
        """Verifies `invoices` table columns and types in ingestion_standalone.db."""
        conn = sqlite3.connect(self.standalone_path)
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(invoices)")
            cols = {row[1]: row[2].upper() for row in cursor.fetchall()}
        finally:
            conn.close()

        expected_cols = {
            "id": "INTEGER",
            "invoice_id": "TEXT",
            "supplier_name": "TEXT",
            "date": "TEXT",
            "subtotal": "REAL",
            "tax_amount": "REAL",
            "grand_total": "REAL",
            "verification_status": "TEXT",
            "raw_payload_json": "TEXT",
        }
        for col_name, expected_type in expected_cols.items():
            self.assertIn(col_name, cols, f"Missing column {col_name} in invoices table")
            self.assertEqual(cols[col_name], expected_type, f"Column {col_name} type mismatch")

    def test_04_inventory_items_table_schema(self):
        """Verifies `inventory_items` table columns and types in ingestion_standalone.db."""
        conn = sqlite3.connect(self.standalone_path)
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(inventory_items)")
            cols = {row[1]: row[2].upper() for row in cursor.fetchall()}
        finally:
            conn.close()

        expected_cols = {
            "item_id": "TEXT",
            "item_name": "TEXT",
            "current_stock": "REAL",
            "min_threshold": "REAL",
            "reorder_quantity": "REAL",
            "unit_cost": "REAL",
            "category": "TEXT",
        }
        for col_name, expected_type in expected_cols.items():
            self.assertIn(col_name, cols, f"Missing column {col_name} in inventory_items table")
            self.assertEqual(cols[col_name], expected_type, f"Column {col_name} type mismatch")

    def test_05_get_digitalized_business_context_structure(self):
        """Verifies get_digitalized_business_context() output contract."""
        context = get_digitalized_business_context()
        self.assertIn("inventory_items", context)
        self.assertIn("invoices", context)
        self.assertIn("db_source", context)
        self.assertIsInstance(context["inventory_items"], list)
        self.assertIsInstance(context["invoices"], list)
        self.assertGreater(len(context["inventory_items"]), 0)
        self.assertGreater(len(context["invoices"]), 0)

        # Check sample SKU SKU-1001 from contract
        item_ids = {it["item_id"]: it for it in context["inventory_items"]}
        self.assertIn("SKU-1001", item_ids)
        rack_item = item_ids["SKU-1001"]
        self.assertEqual(rack_item["item_name"], "4U Rack 500 D")
        self.assertEqual(rack_item["current_stock"], 4.0)
        self.assertEqual(rack_item["min_threshold"], 10.0)
        self.assertEqual(rack_item["reorder_quantity"], 15.0)
        self.assertEqual(rack_item["unit_cost"], 2500.0)
        self.assertEqual(rack_item["category"], "Hardware")

        # Check sample invoice from contract
        dell_inv = next((inv for inv in context["invoices"] if inv["invoice_id"] == "1410515599"), None)
        self.assertIsNotNone(dell_inv, "Sample invoice 1410515599 not found")
        self.assertEqual(dell_inv["supplier_name"], "Dell International Services India Pvt. Ltd.")
        self.assertEqual(dell_inv["date"], "2024-01-15")
        self.assertEqual(dell_inv["subtotal"], 150000.0)
        self.assertEqual(dell_inv["tax_amount"], 27000.0)
        self.assertEqual(dell_inv["grand_total"], 177000.0)
        self.assertEqual(dell_inv["verification_status"], "VALIDATED")

    def test_06_invoice_payload_json_parsing(self):
        """Verifies raw_payload_json extraction and InvoiceLineItemPayload conversion."""
        invoices = get_digitalized_invoices()
        dell_inv = next(inv for inv in invoices if inv["invoice_id"] == "1410515599")
        parsed = parse_invoice_payload(dell_inv["raw_payload_json"])

        self.assertIsInstance(parsed, dict)
        self.assertEqual(parsed.get("supplier_gstin"), "29AABCD1234E1Z5")
        self.assertEqual(parsed.get("customer_gstin"), "27AAACW1234P1Z1")
        self.assertEqual(parsed.get("po_number"), "PO-2024-0891")
        self.assertEqual(parsed.get("payment_terms"), "Net 30")
        self.assertEqual(parsed.get("item_name"), "PowerEdge Server R750")
        self.assertEqual(parsed.get("quantity"), 1.0)
        self.assertEqual(parsed.get("unit_price"), 150000.0)
        self.assertEqual(parsed.get("tax_rate_pct"), 18.0)

        # Dataclass parsing
        line_item = InvoiceLineItemPayload.from_dict(parsed)
        self.assertEqual(line_item.item_name, "PowerEdge Server R750")
        self.assertEqual(line_item.unit_price, 150000.0)
        self.assertIn("supplier_gstin", line_item.to_dict())

    def test_07_schema_dataclasses_interop(self):
        """Verifies InvoiceRecord and InventoryItemRecord dataclass methods."""
        items = get_digitalized_inventory()
        rack_raw = next(i for i in items if i["item_id"] == "SKU-1001")
        item_record = InventoryItemRecord.from_db_row(rack_raw)

        self.assertTrue(item_record.is_low_stock)  # 4 < 10
        self.assertEqual(item_record.reorder_cost, 15.0 * 2500.0)
        d = item_record.to_dict()
        self.assertEqual(d["reorder_cost"], 37500.0)

        invoices = get_digitalized_invoices()
        inv_raw = invoices[0]
        inv_record = InvoiceRecord.from_db_row(inv_raw)
        self.assertEqual(inv_record.verification_status, "VALIDATED")
        self.assertIsNotNone(inv_record.parsed_payload)
        self.assertEqual(inv_record.to_dict()["grand_total"], inv_raw["grand_total"])

    def test_08_downstream_inventory_agent_digitalized(self):
        """Verifies InventoryAgent.evaluate_digitalized() correctly identifies low stock items."""
        eval_result = inventory_agent.evaluate_digitalized()
        self.assertEqual(eval_result["status"], "ACTION_REQUIRED")
        self.assertGreaterEqual(eval_result["low_stock_count"], 1)

        skus = [item["sku"] for item in eval_result["critical_items"]]
        self.assertIn("SKU-1001", skus)
        self.assertIn("SKU-001", skus)

        # SKU-001 deficit is 15 (20 - 5), SKU-1001 deficit is 6 (10 - 4)
        # Check that total reorder cost matches sum of critical items
        expected_total = sum(item["reorder_cost"] for item in eval_result["critical_items"])
        self.assertEqual(eval_result["total_reorder_cost"], round(expected_total, 2))

    def test_09_downstream_finance_agent_digitalized(self):
        """Verifies FinanceAgent.evaluate_digitalized() incorporates verified invoices."""
        eval_result = finance_agent.evaluate_digitalized(bank_cash=60000.0, payroll_reserve=35000.0)
        self.assertEqual(eval_result["free_liquid_cash"], 25000.0)
        self.assertEqual(eval_result["status"], "APPROVED_BUDGET")
        self.assertGreater(eval_result["total_invoiced_commitments"], 0.0)
        self.assertGreater(eval_result["invoices_count"], 0)


if __name__ == "__main__":
    unittest.main()
