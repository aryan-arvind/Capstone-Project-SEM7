"""
Finance Agent.

Reads cash position from `business_profile` and revenue/expense history from
`operational_data` (via the read-only SQL tool in database.py) and reports on
cash health. It does not enforce spending caps itself — the hard Rs. 20k
restock cap under a Rs. 40k cash constraint is arbitration-engine policy — it
only surfaces the numbers the arbitration engine needs to apply that policy.
"""

import os
import sqlite3
from datetime import datetime
from typing import Optional, Dict, Any
from src.core.database import run_readonly_query
from src.schemas import SystemState

LOOKBACK_DAYS = 30
SAFETY_BUFFER = 10000.0
CASH_CRITICAL_THRESHOLD = 40000.0
CASH_CAUTION_THRESHOLD = 80000.0


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


def _fetch_reserves_from_db(db_path: str) -> tuple[Optional[float], Optional[float]]:
    if not os.path.exists(db_path):
        return None, None
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT bank_cash, payroll_reserve FROM financial_reserves ORDER BY business_id LIMIT 1")
        row = cursor.fetchone()
        if row:
            return float(row["bank_cash"]), float(row["payroll_reserve"])
    except Exception:
        pass
    finally:
        if conn:
            conn.close()
    return None, None


def _cash_balance(business_id: int) -> float:
    query = "SELECT cash_balance FROM business_profile WHERE id = ?"
    rows = run_readonly_query(query, (business_id,))
    if not rows:
        raise ValueError(f"No business found with id {business_id}")
    return rows[0]["cash_balance"]


def _sum_by_type(business_id: int, record_type: str) -> float:
    query = "SELECT COALESCE(SUM(amount), 0) AS total FROM operational_data WHERE business_id = ? AND record_type = ?"
    rows = run_readonly_query(query, (business_id, record_type))
    return rows[0]["total"] if rows else 0.0


def _days_of_history(business_id: int) -> int:
    query = "SELECT COUNT(DISTINCT record_date) AS days FROM operational_data WHERE business_id = ?"
    rows = run_readonly_query(query, (business_id,))
    return rows[0]["days"] if rows else 0


class FinanceAgent:
    """Domain agent responsible for cash-flow analysis and spending headroom."""

    def analyze(self, business_id: int) -> dict:
        cash_balance = _cash_balance(business_id)

        total_revenue = round(_sum_by_type(business_id, "sale"), 2)
        total_restock_spend = round(_sum_by_type(business_id, "restock"), 2)
        total_expenses = round(_sum_by_type(business_id, "expense"), 2)
        total_outflow = round(total_restock_spend + total_expenses, 2)
        net_cash_flow = round(total_revenue - total_outflow, 2)

        history_days = _days_of_history(business_id) or LOOKBACK_DAYS
        burn_rate_daily = round(total_outflow / history_days, 2) if history_days else 0.0

        if cash_balance < CASH_CRITICAL_THRESHOLD:
            tier = "critical"
        elif cash_balance < CASH_CAUTION_THRESHOLD:
            tier = "caution"
        else:
            tier = "healthy"

        available_cash = round(max(cash_balance - SAFETY_BUFFER, 0.0), 2)

        return {
            "agent": "finance",
            "business_id": business_id,
            "cash_balance": cash_balance,
            "total_revenue_30d": total_revenue,
            "total_restock_spend_30d": total_restock_spend,
            "total_expenses_30d": total_expenses,
            "net_cash_flow_30d": net_cash_flow,
            "burn_rate_daily": burn_rate_daily,
            "cash_constraint_tier": tier,
            "available_cash": available_cash,
            "summary": (
                f"Cash balance Rs. {cash_balance:,.2f} ({tier}). "
                f"Net 30-day cash flow: Rs. {net_cash_flow:,.2f}. "
                f"Available for discretionary spend: Rs. {available_cash:,.2f}."
            ),
        }

    def get_system_state(self, business_id: int, time_window_days: float = 7.0) -> SystemState:
        analysis = self.analyze(business_id)
        return SystemState(
            available_cash=float(analysis["cash_balance"]),
            time_window_days=time_window_days,
            credit_limit_available=0.0,
            minimum_cash_reserve=SAFETY_BUFFER,
        )

    def evaluate(
        self,
        bank_cash: Optional[float] = None,
        payroll_reserve: Optional[float] = None,
        db_path: Optional[str] = None,
    ) -> dict:
        """
        Review 2 Milestone K.2:
        Calculates:
            Free Liquid Cash = Bank Cash - Payroll Reserve
        and returns a budget ceiling object (e.g. 'Max spend allowed = ₹20,000').
        """
        resolved_db = _resolve_sme_db_path(db_path)
        db_bank, db_payroll = _fetch_reserves_from_db(resolved_db)

        final_bank_cash = bank_cash if bank_cash is not None else (db_bank if db_bank is not None else 50000.0)
        final_payroll = payroll_reserve if payroll_reserve is not None else (db_payroll if db_payroll is not None else 30000.0)

        free_liquid_cash = round(max(0.0, final_bank_cash - final_payroll), 2)
        max_spend_allowed = free_liquid_cash
        recommendation_text = f"Max spend allowed = ₹{int(max_spend_allowed):,}"

        status = "APPROVED_BUDGET" if free_liquid_cash > 0 else "BUDGET_EXHAUSTED"
        solvency_tier = "HEALTHY" if free_liquid_cash >= 15000 else ("CAUTION" if free_liquid_cash > 0 else "CRITICAL")

        return {
            "agent": "finance",
            "agent_name": "Financial Liquidity Agent",
            "status": status,
            "bank_cash": float(final_bank_cash),
            "payroll_reserve": float(final_payroll),
            "free_liquid_cash": float(free_liquid_cash),
            "max_spend_allowed": float(max_spend_allowed),
            "priority": "High" if free_liquid_cash > 0 else "Critical",
            "reason": "Available spending is limited by free liquid cash.",
            "recommendation_text": recommendation_text,
            "solvency_status": solvency_tier,
            "timestamp": datetime.now().isoformat()
        }

    def evaluate_digitalized(
        self,
        db_path: Optional[str] = None,
        bank_cash: Optional[float] = None,
        payroll_reserve: Optional[float] = None,
    ) -> dict:
        """
        Evaluates liquidity headroom against digitalized invoices and operational reserves.
        Incorporates committed invoice amounts from verified invoices.
        """
        from src.data_loader import get_digitalized_business_context
        context = get_digitalized_business_context(db_path)
        invoices = context.get("invoices", [])

        # Total committed from verified invoices
        total_invoiced = round(
            sum(float(inv.get("grand_total", 0.0)) for inv in invoices if inv.get("verification_status") == "VALIDATED"),
            2
        )

        base_eval = self.evaluate(bank_cash=bank_cash, payroll_reserve=payroll_reserve, db_path=db_path)
        base_eval["total_invoiced_commitments"] = total_invoiced
        base_eval["invoices_count"] = len(invoices)
        base_eval["db_source"] = context.get("db_source")
        return base_eval

    def predict_revenue_ml(self, product_name: str, expected_units: Optional[float] = None) -> dict:
        """Uses trained ML demand model and product prices to project sales and profit margins."""
        from src.ml_models import forecaster, inventory_risk_model
        policy = inventory_risk_model.get_product_policy(product_name)
        units = expected_units if expected_units is not None else forecaster.predict_units(
            product=product_name,
            manufacturing_price=policy["unit_cost"],
            sale_price=policy["unit_price"],
        )
        gross_sales = round(units * policy["unit_price"], 2)
        cogs = round(units * policy["unit_cost"], 2)
        projected_profit = round(gross_sales - cogs, 2)
        margin_pct = round((projected_profit / gross_sales * 100.0) if gross_sales > 0 else 0.0, 2)

        return {
            "product_name": product_name,
            "forecasted_units": units,
            "unit_price": policy["unit_price"],
            "unit_cost": policy["unit_cost"],
            "projected_sales": gross_sales,
            "projected_cogs": cogs,
            "projected_profit": projected_profit,
            "margin_pct": margin_pct,
        }


finance_agent = FinanceAgent()
