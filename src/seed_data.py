"""
Synthetic data generator for a demo Kirana (general store) business.

Simulates 30 days of daily sales, stock-driven restocks, and recurring
expenses (rent, wages, utilities) for a fixed catalog of SKUs, writing every
event into `operational_data` and finishing by updating the business's
`cash_balance` in `business_profile` to reflect the simulated cash flow.

Deterministic (fixed random seed) so the same business always reproduces the
same 30-day history — useful for demoing the arbitration engine's cash-cap
behaviour on request.
"""

import random
from datetime import datetime, timedelta, timezone

from src.core import database as db

SIMULATION_DAYS = 30

CATALOG = [
    # sku,     product_name,          unit_cost, unit_price, start_stock, reorder_level, avg_daily_sales
    ("SKU001", "Rice 5kg Bag",             220.0, 260.0, 40, 15, 3.2),
    ("SKU002", "Wheat Flour 5kg Bag",      190.0, 225.0, 35, 12, 2.6),
    ("SKU003", "Sugar 1kg Pack",            42.0,  50.0, 60, 20, 4.5),
    ("SKU004", "Cooking Oil 1L Bottle",    130.0, 155.0, 30, 10, 2.1),
    ("SKU005", "Tea Powder 250g",           85.0, 105.0, 25, 10, 1.8),
    ("SKU006", "Soap Bar",                  20.0,  28.0, 80, 25, 5.0),
    ("SKU007", "Biscuits Pack",             18.0,  25.0, 90, 30, 6.5),
    ("SKU008", "Detergent 1kg",             95.0, 118.0, 20,  8, 1.4),
]

RENT_AMOUNT = 9000.0
WAGE_AMOUNT = 2500.0
UTILITY_AMOUNT = 1800.0

# Stop auto-restocking this many days before the end of the simulation so at
# least a few fast-moving SKUs are realistically still below their reorder
# level "today" — otherwise every SKU always ends the window freshly
# restocked and InventoryAgent would never have anything to recommend.
RESTOCK_CUTOFF_DAYS_BEFORE_END = 4


def _simulate_day(business_id: int, day_index: int, sim_date: datetime, stock: dict, rng: random.Random,
                   records: list, running_cash: float, allow_restock: bool) -> float:
    date_str = sim_date.strftime("%Y-%m-%d")

    for sku, name, unit_cost, unit_price, _start_stock, reorder_level, avg_daily_sales in CATALOG:
        units_sold = max(0, round(rng.gauss(avg_daily_sales, avg_daily_sales * 0.4)))
        units_sold = min(units_sold, stock[sku])
        if units_sold > 0:
            stock[sku] -= units_sold
            revenue = round(units_sold * unit_price, 2)
            running_cash += revenue
            records.append({
                "business_id": business_id,
                "record_date": date_str,
                "record_type": "sale",
                "sku": sku,
                "product_name": name,
                "quantity": units_sold,
                "unit_cost": unit_cost,
                "unit_price": unit_price,
                "amount": revenue,
                "stock_on_hand": stock[sku],
                "reorder_level": reorder_level,
                "category": None,
            })

        if allow_restock and stock[sku] < reorder_level:
            restock_qty = reorder_level * 3 - stock[sku]
            restock_cost = round(restock_qty * unit_cost, 2)
            stock[sku] += restock_qty
            running_cash -= restock_cost
            records.append({
                "business_id": business_id,
                "record_date": date_str,
                "record_type": "restock",
                "sku": sku,
                "product_name": name,
                "quantity": restock_qty,
                "unit_cost": unit_cost,
                "unit_price": unit_price,
                "amount": restock_cost,
                "stock_on_hand": stock[sku],
                "reorder_level": reorder_level,
                "category": None,
            })

    if day_index == 0:
        running_cash -= RENT_AMOUNT
        records.append({
            "business_id": business_id, "record_date": date_str, "record_type": "expense",
            "sku": None, "product_name": None, "quantity": None, "unit_cost": None,
            "unit_price": None, "amount": RENT_AMOUNT, "stock_on_hand": None,
            "reorder_level": None, "category": "rent",
        })

    if day_index % 7 == 6:
        running_cash -= WAGE_AMOUNT
        records.append({
            "business_id": business_id, "record_date": date_str, "record_type": "expense",
            "sku": None, "product_name": None, "quantity": None, "unit_cost": None,
            "unit_price": None, "amount": WAGE_AMOUNT, "stock_on_hand": None,
            "reorder_level": None, "category": "wages",
        })

    if day_index == 14:
        running_cash -= UTILITY_AMOUNT
        records.append({
            "business_id": business_id, "record_date": date_str, "record_type": "expense",
            "sku": None, "product_name": None, "quantity": None, "unit_cost": None,
            "unit_price": None, "amount": UTILITY_AMOUNT, "stock_on_hand": None,
            "reorder_level": None, "category": "utilities",
        })

    return running_cash


def generate_seed_data(business_id: int, starting_cash: float, seed: int = 42) -> float:
    """Simulates SIMULATION_DAYS of history for `business_id` and returns the
    final cash balance, which the caller is responsible for persisting via
    `database.update_cash_balance`.
    """
    rng = random.Random(seed + business_id)
    stock = {sku: start_stock for sku, _n, _c, _p, start_stock, _r, _v in CATALOG}
    records: list = []
    running_cash = starting_cash

    restock_cutoff_index = SIMULATION_DAYS - RESTOCK_CUTOFF_DAYS_BEFORE_END

    start_date = datetime.now(timezone.utc) - timedelta(days=SIMULATION_DAYS)
    for day_index in range(SIMULATION_DAYS):
        sim_date = start_date + timedelta(days=day_index)
        allow_restock = day_index < restock_cutoff_index
        running_cash = _simulate_day(
            business_id, day_index, sim_date, stock, rng, records, running_cash, allow_restock
        )

    db.insert_operational_records_bulk(records)
    return round(running_cash, 2)


def seed_demo_business() -> int:
    """Standalone entry point: creates a demo business and seeds its history.
    Run directly with `python -m src.seed_data`.
    """
    db.init_db()
    starting_cash = 25000.0
    business_id = db.create_business(
        business_name="Sharma General Store",
        business_type="Retail - Kirana Store",
        owner_name="Rajesh Sharma",
        cash_balance=starting_cash,
    )
    final_cash = generate_seed_data(business_id, starting_cash=starting_cash)
    db.update_cash_balance(business_id, final_cash)
    return business_id


if __name__ == "__main__":
    biz_id = seed_demo_business()
    biz = db.get_business(biz_id)
    print(f"Seeded demo business #{biz_id}: {biz['business_name']}")
    print(f"Final cash balance after {SIMULATION_DAYS} days: Rs. {biz['cash_balance']:.2f}")
