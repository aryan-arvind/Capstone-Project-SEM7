"""
Data cleaning and normalization module for the Financial Sample dataset.
Converts raw string currencies and accounting representations into clean numeric features.
"""

import os
import re
from typing import Optional
import pandas as pd
import numpy as np


def clean_currency_value(val) -> float:
    """Converts formatted string currency to float, handling accounting negatives and dashes."""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).strip()
    if s in ("$-", "-", ""):
        return 0.0

    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()
    elif s.startswith("$(") and s.endswith(")"):
        is_negative = True
        s = s[2:-1].strip()
    elif s.startswith("-"):
        is_negative = True
        s = s[1:].strip()

    # Remove $, commas, spaces
    cleaned = re.sub(r"[^\d.]", "", s)
    try:
        num = float(cleaned) if cleaned else 0.0
        return -num if is_negative else num
    except ValueError:
        return 0.0


def load_clean_financial_sample(csv_path: Optional[str] = None) -> pd.DataFrame:
    """Loads and standardizes the financial sample dataset."""
    if not csv_path:
        candidates = [
            os.path.join("data", "financial_sample.csv"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "financial_sample.csv"),
        ]
        for c in candidates:
            if os.path.exists(c):
                csv_path = c
                break
        if not csv_path or not os.path.exists(csv_path):
            raise FileNotFoundError("financial_sample.csv not found in data directories.")

    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    # Clean text columns
    text_cols = ["Segment", "Country", "Product", "Discount Band"]
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    # Clean numeric/currency columns
    numeric_cols = [
        "Units Sold", "Manufacturing Price", "Sale Price", "Gross Sales",
        "Discounts", "Sales", "COGS", "Profit"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = df[col].apply(clean_currency_value)

    # Standardize dates to YYYY-MM-DD
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce").dt.strftime("%Y-%m-%d")

    return df
