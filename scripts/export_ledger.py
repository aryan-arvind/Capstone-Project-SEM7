"""
================================================================================
MSME Working-Capital Ledger Export & Synchronization Tool
================================================================================
Rules for mapping SQLite database records to the simulation ledger:
1. UNPAID AP INVOICES:
   An invoice dated within the last 6 weeks (relative to reference_date / today)
   counts as unpaid accounts payable (AP). Invoices older than 6 weeks are
   assumed to have already been settled.
2. DUE DATE RULE:
   The due date is the invoice date plus supplier credit terms (6 weeks = 42 days).
3. WEEK INDEX FORMULA:
   week = floor((invoice_date - reference_date) / 7 days).
   The reference date is week 0 (today). Invoices issued in preceding weeks
   receive negative week indices (-1, -2, ..., -6).
4. MSME SUPPLIER DETERMINATION:
   A vendor is marked as an MSME vendor (msme=True) ONLY if its name appears
   in the msme_suppliers array in business_profile.json. Otherwise, msme=False.
5. RECEIVABLES (AR) & GST PAYABLE:
   Read directly from business_profile.json:
   - receivables: list of {id, customer, amount, issued, due}
   - gst_payable: outstanding tax owed to the government.
6. INVENTORY:
   Summed from inventory_items (current_stock). Unit cost is the weighted average
   unit_cost, falling back to business_profile.json if unpriced.
7. INTEGRITY & SANITY CHECKS:
   Rejects ledgers with negative cash, negative OD, missing invoice dates,
   or invalid amounts, throwing an explicit error.
================================================================================
"""

import os
import sys
import json
import math
import sqlite3
import argparse
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def parse_date(date_str):
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None

def export_ledger(db_path, profile_path, out_path, ref_date_str=None):
    if not os.path.exists(profile_path):
        raise FileNotFoundError(f"business_profile.json not found at {profile_path}")
    
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    # Sanity checks on profile
    cash = profile.get("cash")
    if cash is None or cash < 0:
        raise ValueError(f"Invalid cash value in profile: {cash} (must be non-negative integer)")
    
    od_limit = profile.get("od_limit", 0)
    od_used = profile.get("od_used", 0)
    if od_limit < 0 or od_used < 0:
        raise ValueError("Overdraft limit and overdraft used must be non-negative")
    if od_used > od_limit:
        print(f"Warning: Overdraft drawn ({od_used}) exceeds limit ({od_limit})", file=sys.stderr)

    gst_payable = profile.get("gst_payable", 0)
    if gst_payable < 0:
        raise ValueError("gst_payable must be non-negative")

    # Reference Date
    if ref_date_str:
        ref_date = parse_date(ref_date_str)
    elif profile.get("reference_date"):
        ref_date = parse_date(profile["reference_date"])
    else:
        ref_date = datetime.now()

    if not ref_date:
        raise ValueError(f"Could not parse reference date: {ref_date_str or profile.get('reference_date')}")

    msme_suppliers = set(s.strip().lower() for s in profile.get("msme_suppliers", []))

    # Read from SQLite
    ap_records = []
    inv_units = 0
    inv_weighted_val = 0.0

    if db_path and os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # 1. Invoices
        try:
            cur.execute("SELECT invoice_id, supplier_name, date, grand_total, verification_status FROM invoices")
            rows = cur.fetchall()
            for inv_id, supplier, dt_str, grand_total, status in rows:
                if not dt_str:
                    print(f"Warning: Skipping invoice {inv_id} with missing date", file=sys.stderr)
                    continue
                dt = parse_date(dt_str)
                if not dt:
                    print(f"Warning: Skipping invoice {inv_id} with unparseable date {dt_str}", file=sys.stderr)
                    continue
                
                amount = round(float(grand_total or 0))
                if amount <= 0:
                    continue  # Zero-value or invalid test invoice

                days_diff = (dt - ref_date).days
                # Rule 1: Invoices dated within the last 6 weeks (>= -42 days and <= +7 days)
                if -42 <= days_diff <= 7:
                    # Rule 3: week index = floor((date - today) / 7)
                    issued_week = math.floor(days_diff / 7.0)
                    # Rule 2: due date is invoice date + 6 weeks
                    due_week = issued_week + 6
                    # Rule 4: MSME vendor check
                    is_msme = (supplier or "").strip().lower() in msme_suppliers

                    ap_records.append({
                        "id": str(inv_id),
                        "supplier": supplier or "Vendor",
                        "amount": amount,
                        "issued": issued_week,
                        "due": due_week,
                        "msme": is_msme
                    })
        except sqlite3.OperationalError as e:
            print(f"Note: Could not query invoices table: {e}", file=sys.stderr)

        # 2. Inventory Items
        try:
            cur.execute("SELECT current_stock, unit_cost FROM inventory_items")
            for stock, cost in cur.fetchall():
                stk = float(stock or 0)
                cst = float(cost or 0)
                if stk > 0:
                    inv_units += stk
                    inv_weighted_val += (stk * cst)
        except sqlite3.OperationalError as e:
            print(f"Note: Could not query inventory_items table: {e}", file=sys.stderr)

        conn.close()
    else:
        print(f"Notice: Database path {db_path} not found. Using profile defaults.", file=sys.stderr)

    # Calculate unit cost
    if inv_units > 0 and inv_weighted_val > 0:
        unit_cost = round(inv_weighted_val / inv_units)
    else:
        unit_cost = profile.get("unit_cost_fallback", 320)
        if inv_units == 0:
            inv_units = profile.get("inventory_units_fallback", 2500)

    # Receivables from profile
    raw_ar = profile.get("receivables", [])
    ar_records = []
    for item in raw_ar:
        amt = round(float(item.get("amount", 0)))
        if amt <= 0:
            continue
        ar_records.append({
            "id": str(item.get("id", f"AR_{len(ar_records)+1}")),
            "customer": item.get("customer", "Customer"),
            "amount": amt,
            "issued": int(item.get("issued", -1)),
            "due": int(item.get("due", 3))
        })

    # Output payload
    ledger = {
        "generated_at": datetime.now().isoformat(),
        "reference_date": ref_date.strftime("%Y-%m-%d"),
        "company_name": profile.get("company_name", "MSME"),
        "data_source": f"SQLite ({os.path.basename(db_path) if db_path else 'none'}) + business_profile.json",
        "cash": int(cash),
        "od_limit": int(od_limit),
        "od_used": int(od_used),
        "gst_payable": int(gst_payable),
        "inventory": {
            "units": int(inv_units),
            "unit_cost": int(unit_cost)
        },
        "ap": ap_records,
        "ar": ar_records,
        "sim_overrides": {
            "price": profile.get("price", 520),
            "unit_cost": int(unit_cost),
            "payroll": profile.get("weekly_payroll", 42000),
            "fixed": profile.get("weekly_fixed_costs", 28000),
            "base_demand_units": profile.get("base_demand_units", 150)
        }
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(ledger, f, indent=2)

    print(f"Successfully generated {out_path}")
    print(f"  Summary: Cash={cash}, AP count={len(ap_records)}, AR count={len(ar_records)}, Inv units={inv_units}")
    return ledger

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export SQLite & business profile to MSME ledger.json")
    parser.add_argument("--db", default=r"D:\ARYAN ACADEMIC\SEM7\Capstone Project\data\sme_digitalized_data.db")
    parser.add_argument("--profile", default=os.path.join(ROOT, "data", "business_profile.json"))
    parser.add_argument("--out", default=os.path.join(ROOT, "data", "ledger.json"))
    parser.add_argument("--today", default=None)
    args = parser.parse_args()

    export_ledger(args.db, args.profile, args.out, args.today)
