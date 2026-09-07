"""
Inventory Agent.

Reads sales and restock history from `operational_data` (via the read-only
SQL tool in database.py) and produces a restock recommendation per SKU that
is currently below its reorder level. Never writes to the database and never
decides what actually gets purchased — that call belongs to the arbitration
engine, which weighs the recommendation against finance's cash constraints.
"""

from src.core.database import run_readonly_query

LOOKBACK_DAYS = 30


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
