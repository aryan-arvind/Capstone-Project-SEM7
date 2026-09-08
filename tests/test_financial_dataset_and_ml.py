"""
Unit & Integration tests for the Financial Sample dataset, Data Cleaning,
Machine Learning Demand Forecasting, and ML-backed Domain Agent predictions.
"""

import os
import unittest
import pandas as pd

from src.data_cleaning import load_clean_financial_sample, clean_currency_value
from src.ml_models import forecaster, inventory_risk_model
from src.seed_data import seed_from_financial_dataset, CATALOG
from src.core import database as db
from src.agents.inventory_agent import inventory_agent
from src.agents.finance_agent import finance_agent


class TestFinancialDatasetAndML(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.df = load_clean_financial_sample()

    def test_01_data_cleaning_and_parsing(self):
        """Verifies currency cleaning, date parsing, and row count."""
        self.assertGreaterEqual(len(self.df), 100)
        expected_products = {"Carretera", "Montana", "Paseo", "Velo", "VTT", "Amarilla"}
        actual_products = set(self.df["Product"].unique())
        self.assertTrue(expected_products.issubset(actual_products))

        # Check currency parsing utility directly
        self.assertEqual(clean_currency_value("$1,618.50"), 1618.50)
        self.assertEqual(clean_currency_value("$-"), 0.0)
        self.assertEqual(clean_currency_value("$(4,533.75)"), -4533.75)

        # Check numeric types in cleaned dataframe
        self.assertTrue(pd.api.types.is_numeric_dtype(self.df["Sales"]))
        self.assertTrue(pd.api.types.is_numeric_dtype(self.df["Profit"]))
        self.assertTrue(pd.api.types.is_numeric_dtype(self.df["COGS"]))

    def test_02_demand_forecaster_training_and_prediction(self):
        """Verifies ML model training, R2 performance, and prediction inference."""
        metrics = forecaster.train(self.df)
        self.assertIn("r2", metrics)
        self.assertGreater(metrics["r2"], 0.70, f"R2 score too low: {metrics['r2']}")

        pred_units = forecaster.predict_units(
            product="Paseo",
            segment="Small Business",
            country="United States of America",
            discount_band="Medium",
            manufacturing_price=10.0,
            sale_price=20.0,
        )
        self.assertGreater(pred_units, 0.0)
        self.assertIsInstance(pred_units, float)

    def test_03_inventory_risk_model_statistical_policies(self):
        """Verifies statistical safety stock, dynamic min threshold, and EOQ."""
        policy = inventory_risk_model.get_product_policy("Velo")
        self.assertEqual(policy["product"], "Velo")
        self.assertGreater(policy["safety_stock"], 0.0)
        self.assertGreater(policy["min_threshold"], policy["safety_stock"])
        self.assertGreater(policy["reorder_quantity"], 0.0)
        self.assertEqual(policy["unit_cost"], 120.0)

    def test_04_seed_from_financial_dataset(self):
        """Verifies seeding business operational data from the real financial dataset."""
        biz_id = db.create_business(
            business_name="ML Verified Commercial Enterprise",
            business_type="Wholesale",
            owner_name="Test Enterprise Lead",
            cash_balance=50000.0,
        )
        final_cash = seed_from_financial_dataset(biz_id)
        self.assertGreater(final_cash, 50000.0)

        records = db.run_readonly_query(
            "SELECT COUNT(*) as count FROM operational_data WHERE business_id = ?",
            (biz_id,)
        )
        self.assertGreater(records[0]["count"], 20)

    def test_05_inventory_agent_ml_prediction(self):
        """Verifies InventoryAgent.predict_reorder_ml() integration."""
        rec = inventory_agent.predict_reorder_ml(product_name="Paseo", current_stock=50.0)
        self.assertEqual(rec["product_name"], "Paseo")
        self.assertGreater(rec["predicted_monthly_demand"], 0.0)
        self.assertTrue(rec["is_low_stock"])  # 50 < ~1085 threshold
        self.assertGreater(rec["recommended_reorder_qty"], 0.0)
        self.assertGreater(rec["estimated_reorder_cost"], 0.0)

    def test_06_finance_agent_ml_revenue_projection(self):
        """Verifies FinanceAgent.predict_revenue_ml() integration."""
        proj = finance_agent.predict_revenue_ml(product_name="Carretera")
        self.assertEqual(proj["product_name"], "Carretera")
        self.assertGreater(proj["projected_sales"], 0.0)
        self.assertGreater(proj["projected_profit"], 0.0)
        self.assertGreater(proj["margin_pct"], 0.0)


if __name__ == "__main__":
    unittest.main()
