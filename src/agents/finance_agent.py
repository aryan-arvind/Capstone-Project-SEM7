"""
Finance Agent.

Reads cash position from `business_profile` and revenue/expense history from
`operational_data` (via the read-only SQL tool in database.py) and reports on
cash health. It does not enforce spending caps itself — the hard Rs. 20k
restock cap under a Rs. 40k cash constraint is arbitration-engine policy — it
only surfaces the numbers the arbitration engine needs to apply that policy.
"""

from src.core.database import run_readonly_query

LOOKBACK_DAYS = 30
SAFETY_BUFFER = 10000.0
CASH_CRITICAL_THRESHOLD = 40000.0
CASH_CAUTION_THRESHOLD = 80000.0


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
