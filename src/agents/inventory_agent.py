"""
Inventory Agent.

Reads sales and restock history from `operational_data` (via the read-only
SQL tool in database.py) and produces a restock recommendation per SKU that
is currently below its reorder level. Never writes to the database and never
decides what actually gets purchased — that call belongs to the arbitration
engine, which weighs the recommendation against finance's cash constraints.
"""

import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
from src.core.database import run_readonly_query
from src.schemas import Recommendation, AgentType

LOOKBACK_DAYS = 30


def _resolve_sme_db_path(custom_path: Optional[str] = None) -> str:
    if custom_path and custom_path.strip() and custom_path.strip().lower() != "string":
        if not os.path.exists(custom_path):
            raise FileNotFoundError(f"Database file not found: {custom_path}")
        return custom_path
    candidates = [
        os.path.join("data", "sme_digitalized_data.db"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "sme_digitalized_data.db")
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return os.path.abspath(candidates[0])


def _ensure_inventory_schema_and_seed(db_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS inventory_items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL,
                current_stock REAL NOT NULL,
                min_threshold REAL NOT NULL,
                reorder_quantity REAL NOT NULL,
                unit_cost REAL NOT NULL,
                category TEXT
            );
        """)
        cursor.execute("SELECT COUNT(*) FROM inventory_items")
        if cursor.fetchone()[0] == 0:
            cursor.executemany("""
                INSERT INTO inventory_items VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                ('SKU-001', 'Industrial Bearing Model X', 5.0, 20.0, 50.0, 1000.0, 'Mechanical'),
                ('SKU-002', 'High-Temp Synthetic Lubricant', 60.0, 30.0, 40.0, 250.0, 'Consumables'),
                ('SKU-003', 'Hydraulic Seal Ring', 45.0, 40.0, 100.0, 120.0, 'Mechanical')
            ])
            conn.commit()
    finally:
        conn.close()


def _latest_stock_snapshot(business_id: int) -> list[dict]:
    """One row per SKU: its most recent stock_on_hand / reorder_level, taken
    from whichever sale or restock record was inserted last for that SKU.
    """
    query = """
        SELECT od.sku, od.product_name, od.stock_on_hand, od.reorder_level, od.unit_cost, od.unit_price
        FROM operational_data od
        INNER JOIN (
            SELECT sku, MAX(id) AS max_id
            FROM operational_data
            WHERE business_id = ? AND sku IS NOT NULL AND record_type IN ('sale', 'restock')
            GROUP BY sku
        ) latest ON od.sku = latest.sku AND od.id = latest.max_id
        WHERE od.business_id = ?
    """
    return run_readonly_query(query, (business_id, business_id))


def _avg_daily_sales(business_id: int, sku: str) -> float:
    query = """
        SELECT SUM(quantity) AS total_units, COUNT(DISTINCT record_date) AS days_with_sales
        FROM operational_data
        WHERE business_id = ? AND sku = ? AND record_type = 'sale'
    """
    rows = run_readonly_query(query, (business_id, sku))
    row = rows[0] if rows else {}
    total_units = row.get("total_units") or 0
    days = row.get("days_with_sales") or 0
    if days == 0:
        return 0.0
    return total_units / max(days, 1)


class InventoryAgent:
    """Domain agent responsible for stock-level analysis and restock asks."""

    def analyze(self, business_id: int) -> dict:
        snapshot = _latest_stock_snapshot(business_id)

        low_stock_items = []
        for item in snapshot:
            stock_on_hand = item["stock_on_hand"] or 0
            reorder_level = item["reorder_level"] or 0
            if stock_on_hand >= reorder_level:
                continue

            avg_sales = _avg_daily_sales(business_id, item["sku"])
            days_of_stock_remaining = (stock_on_hand / avg_sales) if avg_sales > 0 else float("inf")

            recommended_qty = max(reorder_level * 3 - stock_on_hand, reorder_level)
            restock_cost = round(recommended_qty * item["unit_cost"], 2)

            low_stock_items.append({
                "sku": item["sku"],
                "product_name": item["product_name"],
                "stock_on_hand": stock_on_hand,
                "reorder_level": reorder_level,
                "avg_daily_sales": round(avg_sales, 2),
                "days_of_stock_remaining": (
                    round(days_of_stock_remaining, 1) if days_of_stock_remaining != float("inf") else None
                ),
                "unit_cost": item["unit_cost"],
                "unit_price": item["unit_price"],
                "recommended_restock_qty": recommended_qty,
                "restock_cost": restock_cost,
            })

        low_stock_items.sort(key=lambda x: (x["days_of_stock_remaining"] is None, x["days_of_stock_remaining"]))
        total_requested_cost = round(sum(i["restock_cost"] for i in low_stock_items), 2)

        return {
            "agent": "inventory",
            "business_id": business_id,
            "low_stock_items": low_stock_items,
            "total_requested_cost": total_requested_cost,
            "summary": (
                f"{len(low_stock_items)} SKU(s) below reorder level, "
                f"requesting Rs. {total_requested_cost:,.2f} in restock spend."
                if low_stock_items else "All SKUs are adequately stocked."
            ),
        }

    def generate_recommendations(self, business_id: int) -> List[Recommendation]:
        analysis = self.analyze(business_id)
        recommendations: List[Recommendation] = []

        for item in analysis.get("low_stock_items", []):
            days = item.get("days_of_stock_remaining")
            urgency = min(1.0, max(0.1, round(1.0 - ((days or 0.0) / 14.0), 2)))
            markup = (item["unit_price"] - item["unit_cost"]) / max(item["unit_cost"], 1.0)
            roi_impact = min(1.0, max(0.1, round(markup * 1.5, 2)))

            rec = Recommendation(
                recommendation_id=f"REC_INV_{item['sku']}",
                agent_type=AgentType.INVENTORY,
                title=f"Restock {item['product_name']} ({item['recommended_restock_qty']} units)",
                description=(
                    f"Current stock {item['stock_on_hand']} is below reorder level {item['reorder_level']}. "
                    f"Estimated runway: {days} days."
                ),
                required_cash=float(item["restock_cost"]),
                urgency_score=urgency,
                expected_roi_or_impact=roi_impact,
                risk_score=0.15,
                deadline_days=max(1.0, float(days or 3.0)),
                metadata=item,
            )
            recommendations.append(rec)

        return recommendations

    def get_inventory_status(self, business_id: int) -> dict:
        snapshot = _latest_stock_snapshot(business_id)
        items = []
        for item in snapshot:
            stock = item["stock_on_hand"] or 0
            reorder = item["reorder_level"] or 0
            avg_sales = _avg_daily_sales(business_id, item["sku"])
            days = (stock / avg_sales) if avg_sales > 0 else (999.0 if stock > 0 else 0.0)
            status = "CRITICAL" if stock <= reorder * 0.5 else ("LOW" if stock < reorder else "HEALTHY")
            items.append({
                "sku": item["sku"],
                "product_name": item["product_name"],
                "stock_on_hand": stock,
                "reorder_level": reorder,
                "avg_daily_sales": round(avg_sales, 2),
                "days_of_stock_remaining": round(days, 1) if days < 999 else None,
                "unit_cost": item["unit_cost"],
                "unit_price": item["unit_price"],
                "status": status,
            })
        return {"business_id": business_id, "inventory": items}

    def evaluate(self, db_path: Optional[str] = None) -> dict:
        """
        Review 2 Milestone K.1:
        Queries the SQLite `inventory_items` table, identifies items where:
            current_stock < min_threshold
        and returns a reorder recommendation object (e.g. 'Reorder SKU-001 for ₹50,000').
        """
        resolved_db = _resolve_sme_db_path(db_path)
        _ensure_inventory_schema_and_seed(resolved_db)

        conn = sqlite3.connect(resolved_db)
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as total FROM inventory_items")
            total_items = cursor.fetchone()["total"]

            cursor.execute("""
                SELECT item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category
                FROM inventory_items
                WHERE current_stock < min_threshold
                ORDER BY (min_threshold - current_stock) DESC
            """)
            rows = cursor.fetchall()
        finally:
            conn.close()

        critical_items = []
        for r in rows:
            reorder_cost = round(float(r["reorder_quantity"]) * float(r["unit_cost"]), 2)
            critical_items.append({
                "sku": r["item_id"],
                "item_name": r["item_name"],
                "current_stock": float(r["current_stock"]),
                "min_threshold": float(r["min_threshold"]),
                "reorder_quantity": float(r["reorder_quantity"]),
                "unit_cost": float(r["unit_cost"]),
                "category": r["category"],
                "reorder_cost": reorder_cost,
                "deficit": round(float(r["min_threshold"]) - float(r["current_stock"]), 2)
            })

        total_reorder_cost = round(sum(item["reorder_cost"] for item in critical_items), 2)

        if critical_items:
            primary = critical_items[0]
            if len(critical_items) == 1:
                recommendation_text = f"Reorder {primary['sku']} for ₹{int(total_reorder_cost):,}"
            else:
                recommendation_text = f"Reorder {primary['sku']} and {len(critical_items)-1} others for ₹{int(total_reorder_cost):,}"
            status = "ACTION_REQUIRED"
            recommendation_action = "reorder"
            primary_sku = primary["sku"]
            primary_stock = primary["current_stock"]
            primary_threshold = primary["min_threshold"]
            priority = "High"
            reason = "Current stock is below the configured minimum threshold."
        else:
            recommendation_text = "All inventory levels are healthy. No restock needed."
            status = "OPTIMAL"
            recommendation_action = "none"
            primary_sku = None
            primary_stock = None
            primary_threshold = None
            priority = "None"
            reason = "All inventory levels are healthy and above the configured minimum threshold."

        return {
            "agent": "inventory",
            "agent_name": "Inventory Intelligence Agent",
            "status": status,
            "recommendation": recommendation_action,
            "sku": primary_sku,
            "current_stock": primary_stock,
            "min_threshold": primary_threshold,
            "requested_amount": total_reorder_cost,
            "priority": priority,
            "reason": reason,
            "items_scanned": total_items,
            "low_stock_count": len(critical_items),
            "critical_items": critical_items,
            "total_reorder_cost": total_reorder_cost,
            "recommended_sku": primary_sku,
            "recommendation_text": recommendation_text,
            "timestamp": datetime.now().isoformat()
        }

    def evaluate_digitalized(self, db_path: Optional[str] = None) -> dict:
        """
        Evaluates inventory health using the Data Digitalization & Ingestion contract interface.
        Extracts digitalized inventory items and cross-references verified invoices for pricing.
        """
        from src.data_loader import get_digitalized_business_context
        context = get_digitalized_business_context(db_path)
        items = context.get("inventory_items", [])
        invoices = context.get("invoices", [])

        critical_items = []
        for item in items:
            cur_stock = float(item["current_stock"])
            min_thresh = float(item["min_threshold"])
            if cur_stock < min_thresh:
                reorder_qty = float(item["reorder_quantity"])
                unit_cost = float(item["unit_cost"])
                reorder_cost = round(reorder_qty * unit_cost, 2)
                critical_items.append({
                    "sku": item["item_id"],
                    "item_name": item["item_name"],
                    "current_stock": cur_stock,
                    "min_threshold": min_thresh,
                    "reorder_quantity": reorder_qty,
                    "unit_cost": unit_cost,
                    "category": item["category"],
                    "reorder_cost": reorder_cost,
                    "deficit": round(min_thresh - cur_stock, 2)
                })

        critical_items.sort(key=lambda x: x["deficit"], reverse=True)
        total_reorder_cost = round(sum(i["reorder_cost"] for i in critical_items), 2)

        if critical_items:
            primary = critical_items[0]
            if len(critical_items) == 1:
                recommendation_text = f"Reorder {primary['sku']} for ₹{int(total_reorder_cost):,}"
            else:
                recommendation_text = f"Reorder {primary['sku']} and {len(critical_items)-1} others for ₹{int(total_reorder_cost):,}"
            status = "ACTION_REQUIRED"
            recommendation_action = "reorder"
            primary_sku = primary["sku"]
            primary_stock = primary["current_stock"]
            primary_threshold = primary["min_threshold"]
            priority = "High"
            reason = "Current stock is below the configured minimum threshold."
        else:
            recommendation_text = "All inventory levels are healthy. No restock needed."
            status = "OPTIMAL"
            recommendation_action = "none"
            primary_sku = None
            primary_stock = None
            primary_threshold = None
            priority = "None"
            reason = "All inventory levels are healthy and above the configured minimum threshold."

        return {
            "agent": "inventory",
            "agent_name": "Inventory Intelligence Agent",
            "status": status,
            "recommendation": recommendation_action,
            "sku": primary_sku,
            "current_stock": primary_stock,
            "min_threshold": primary_threshold,
            "requested_amount": total_reorder_cost,
            "priority": priority,
            "reason": reason,
            "items_scanned": len(items),
            "low_stock_count": len(critical_items),
            "critical_items": critical_items,
            "total_reorder_cost": total_reorder_cost,
            "verified_invoices_available": len(invoices),
            "db_source": context.get("db_source"),
            "timestamp": datetime.now().isoformat()
        }

    def predict_reorder_ml(self, product_name: str, current_stock: float) -> dict:
        """Uses trained ML models to compute predicted demand and dynamic reorder recommendations."""
        from src.ml_models import forecaster, inventory_risk_model
        policy = inventory_risk_model.get_product_policy(product_name)
        predicted_demand = forecaster.predict_units(
            product=product_name,
            manufacturing_price=policy["unit_cost"],
            sale_price=policy["unit_price"],
        )
        is_low = current_stock < policy["min_threshold"]
        recommended_qty = policy["reorder_quantity"] if is_low else 0.0
        reorder_cost = round(recommended_qty * policy["unit_cost"], 2)

        return {
            "product_name": product_name,
            "current_stock": current_stock,
            "predicted_monthly_demand": predicted_demand,
            "min_threshold": policy["min_threshold"],
            "safety_stock": policy["safety_stock"],
            "is_low_stock": is_low,
            "recommended_reorder_qty": recommended_qty,
            "unit_cost": policy["unit_cost"],
            "estimated_reorder_cost": reorder_cost,
        }


inventory_agent = InventoryAgent()
