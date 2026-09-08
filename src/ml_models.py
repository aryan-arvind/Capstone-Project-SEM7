"""
Machine Learning models for Demand Forecasting, Sales Prediction,
and Statistical Inventory Risk Optimization using the Financial Sample dataset.
"""

import os
import math
from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

from src.data_cleaning import load_clean_financial_sample

MODEL_CACHE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "demand_forecast_model.joblib"
)


class DemandForecaster:
    """Trained regression pipeline forecasting future units sold and expected revenue."""

    def __init__(self):
        self.pipeline: Optional[Pipeline] = None
        self.metrics: Dict[str, float] = {}
        self.feature_columns = [
            "Product", "Segment", "Country", "Discount Band",
            "Manufacturing Price", "Sale Price", "Month Number"
        ]

    def train(self, df: Optional[pd.DataFrame] = None) -> Dict[str, float]:
        if df is None:
            df = load_clean_financial_sample()

        X = df[self.feature_columns]
        y = df["Units Sold"]

        categorical_features = ["Product", "Segment", "Country", "Discount Band"]
        numeric_features = ["Manufacturing Price", "Sale Price", "Month Number"]

        preprocessor = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
                ("num", "passthrough", numeric_features),
            ]
        )

        self.pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("regressor", RandomForestRegressor(n_estimators=100, random_state=42)),
            ]
        )

        self.pipeline.fit(X, y)
        preds = self.pipeline.predict(X)
        self.metrics = {
            "r2": round(float(r2_score(y, preds)), 4),
            "mae": round(float(mean_absolute_error(y, preds)), 2),
            "samples": len(df),
        }

        # Persist model
        os.makedirs(os.path.dirname(MODEL_CACHE_PATH), exist_ok=True)
        joblib.dump({"pipeline": self.pipeline, "metrics": self.metrics}, MODEL_CACHE_PATH)
        return self.metrics

    def ensure_trained(self) -> None:
        if self.pipeline is None:
            if os.path.exists(MODEL_CACHE_PATH):
                try:
                    data = joblib.load(MODEL_CACHE_PATH)
                    self.pipeline = data["pipeline"]
                    self.metrics = data["metrics"]
                    return
                except Exception:
                    pass
            self.train()

    def predict_units(
        self,
        product: str,
        segment: str = "Small Business",
        country: str = "United States of America",
        discount_band: str = "Medium",
        manufacturing_price: float = 10.0,
        sale_price: float = 20.0,
        month_number: int = 6,
    ) -> float:
        self.ensure_trained()
        sample = pd.DataFrame([{
            "Product": product,
            "Segment": segment,
            "Country": country,
            "Discount Band": discount_band,
            "Manufacturing Price": manufacturing_price,
            "Sale Price": sale_price,
            "Month Number": month_number,
        }])
        pred = self.pipeline.predict(sample)[0]
        return max(1.0, round(float(pred), 2))


class InventoryRiskModel:
    """Calculates Statistical Safety Stock, Economic Order Quantity (EOQ), and reorder levels."""

    def __init__(self, df: Optional[pd.DataFrame] = None):
        self.df = df if df is not None else load_clean_financial_sample()
        self.stats = self._calculate_product_statistics()

    def _calculate_product_statistics(self) -> Dict[str, Dict[str, float]]:
        stats: Dict[str, Dict[str, float]] = {}
        grouped = self.df.groupby("Product")

        for product, group in grouped:
            units = group["Units Sold"].values
            mean_monthly = float(np.mean(units))
            std_monthly = float(np.std(units)) if len(units) > 1 else (mean_monthly * 0.25)
            mean_daily = mean_monthly / 30.0
            std_daily = std_monthly / math.sqrt(30.0)

            unit_cost = float(group["Manufacturing Price"].median())
            unit_price = float(group["Sale Price"].median())

            # Service level 95% -> Z = 1.645, Lead time = 7 days
            z_score = 1.645
            lead_time_days = 7.0
            safety_stock = round(z_score * std_daily * math.sqrt(lead_time_days), 1)
            min_threshold = round((mean_daily * lead_time_days) + safety_stock, 1)

            # Economic Order Quantity: sqrt(2 * D * S / H)
            # S = Order fee (Rs. 500), H = 20% annual holding cost of unit_cost
            annual_demand = max(100.0, mean_monthly * 12.0)
            order_cost = 500.0
            holding_cost = max(1.0, unit_cost * 0.20)
            eoq = round(math.sqrt((2 * annual_demand * order_cost) / holding_cost), 1)

            stats[product] = {
                "product": product,
                "unit_cost": unit_cost,
                "unit_price": unit_price,
                "avg_daily_sales": round(mean_daily, 2),
                "std_daily_sales": round(std_daily, 2),
                "safety_stock": max(5.0, safety_stock),
                "min_threshold": max(10.0, min_threshold),
                "reorder_quantity": max(15.0, eoq),
            }
        return stats

    def get_product_policy(self, product: str) -> Dict[str, float]:
        if product in self.stats:
            return self.stats[product]
        # Fallback default
        return {
            "product": product,
            "unit_cost": 20.0,
            "unit_price": 40.0,
            "avg_daily_sales": 5.0,
            "std_daily_sales": 2.0,
            "safety_stock": 10.0,
            "min_threshold": 25.0,
            "reorder_quantity": 50.0,
        }


forecaster = DemandForecaster()
inventory_risk_model = InventoryRiskModel()
