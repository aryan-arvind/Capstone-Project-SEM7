"""
Data Loader & Business Context Synthesizer.
Interfaces digitalized SQLite datasets with domain intelligence agents.
"""

import os
import sqlite3
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def get_digitalized_business_context(db_path: str = os.path.join("data", "sme_digitalized_data.db")) -> Dict[str, Any]:
    """
    Loads digitalized inventory items, invoices, and business metrics from SQLite.
    Synthesizes the complete business context payload required for domain agent evaluation.
    """
    context: Dict[str, Any] = {
        "inventory_items": [],
        "invoices": [],
        "upcoming_payroll_reserve": 2000.0,
        "market_signals": {
            "demand_surge_pct": 35.0,
            "target_product": "Diwali Festival Stock",
            "recommended_budget": 3000.0
        },
        "procurement_deals": [
            {
                "supplier_name": "Apex Raw Materials Ltd",
                "raw_material": "Steel Components",
                "discount_pct": 15.0,
                "deal_cost": 2500.0
            }
        ],
        "pending_order_delays": 6
    }

    if not os.path.exists(db_path):
        logger.warning(f"Digitalized database {db_path} not found. Returning default context.")
        return context

    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Load inventory items
            cursor.execute("SELECT * FROM inventory_items")
            inv_rows = cursor.fetchall()
            if inv_rows:
                context["inventory_items"] = [dict(row) for row in inv_rows]

            # Load invoices
            cursor.execute("SELECT * FROM invoices")
            invc_rows = cursor.fetchall()
            if invc_rows:
                context["invoices"] = [dict(row) for row in invc_rows]

    except Exception as e:
        logger.error(f"Error loading context from SQLite DB: {e}")

    return context
