import logging
from typing import Dict, Any, Optional
from src.tools.finance_tools import (
    calculate_gst,
    calculate_discount,
    calculate_profit,
    calculate_margin,
    calculate_selling_price_from_margin,
    get_customer_payment_history,
    get_outstanding_invoices,
    get_invoice,
    create_invoice,
    generate_payment_reminder,
    get_financial_alerts
)

logger = logging.getLogger(__name__)

class FinanceAgent:
    """
    Finance Agent.
    Owns: Payments, Invoices, GST, Discounts, Profit, Margins, Financial calculations,
    Financial alerts, Receivables, Quotation pricing calculations.
    """

    def __init__(self):
        self.name = "Finance Agent"

    def execute(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a financial tool action deterministically.
        """
        trace = []
        trace.append(f"[FINANCE] Initiating action '{action}' with parameters {params}")

        if action in ["calculate_quotation", "calculate_pricing"]:
            unit_cost = float(params.get("unit_cost", params.get("supplier_price", 0.0)))
            quantity = int(params.get("quantity", 1))
            margin_pct = float(params.get("margin_pct", params.get("desired_margin_pct", 20.0)))
            gst_rate = float(params.get("gst_rate", 18.0))
            discount_pct = float(params.get("discount_pct", 0.0))

            trace.append(f"[FINANCE] Calculating commercial quotation for {quantity} units @ ₹{unit_cost:,.2f} base cost...")
            trace.append(f"[FINANCE] Applying deterministic {margin_pct}% margin and {gst_rate}% GST rate...")

            calc_result = calculate_selling_price_from_margin(
                unit_cost=unit_cost,
                margin_pct=margin_pct,
                quantity=quantity,
                gst_rate=gst_rate,
                discount_pct=discount_pct
            )

            trace.append(f"[FINANCE] Purchase Cost: ₹{calc_result['purchase_cost']:,.2f}")
            trace.append(f"[FINANCE] Selling Subtotal: ₹{calc_result['subtotal']:,.2f} (Unit: ₹{calc_result['unit_selling_price']:,.2f})")
            trace.append(f"[FINANCE] GST Amount ({gst_rate}%): ₹{calc_result['gst_amount']:,.2f}")
            trace.append(f"[FINANCE] Final Quotation Total: ₹{calc_result['final_amount']:,.2f} (Gross Profit: ₹{calc_result['gross_profit']:,.2f})")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": calc_result,
                "trace": trace
            }

        elif action in ["get_outstanding", "outstanding_invoices", "get_receivables"]:
            trace.append("[FINANCE] Querying accounting records for all outstanding and overdue receivables...")
            res = get_outstanding_invoices()
            trace.append(f"[FINANCE] Total Outstanding: ₹{res['total_outstanding_amount']:,.2f} across {res['total_unpaid_invoices_count']} invoices.")
            trace.append(f"[FINANCE] Total Overdue: ₹{res['total_overdue_amount']:,.2f} ({res['overdue_invoices_count']} overdue invoices).")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": res,
                "trace": trace
            }

        elif action in ["customer_history", "payment_history"]:
            customer_query = params.get("customer", params.get("customer_name", params.get("customer_id", "")))
            trace.append(f"[FINANCE] Fetching ledger and invoice payment history for '{customer_query}'...")
            res = get_customer_payment_history(str(customer_query))
            
            if res.get("found"):
                trace.append(f"[FINANCE] Customer '{res['customer_name']}': Total Invoiced: ₹{res['total_invoiced']:,.2f}, Paid: ₹{res['total_paid']:,.2f}, Outstanding: ₹{res['total_outstanding']:,.2f}.")
            else:
                trace.append(f"[FINANCE] Customer '{customer_query}' not found in database.")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if res.get("found") else "NOT_FOUND",
                "data": res,
                "trace": trace
            }

        elif action in ["payment_reminder", "generate_reminder"]:
            customer_query = params.get("customer", params.get("customer_name", ""))
            trace.append(f"[FINANCE] Generating formal payment collection notice for '{customer_query}'...")
            res = generate_payment_reminder(str(customer_query))
            if res.get("found"):
                trace.append(f"[FINANCE] Generated collection notice for ₹{res['total_outstanding']:,.2f} balance.")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if res.get("found") else "NOT_FOUND",
                "data": res,
                "trace": trace
            }

        elif action in ["financial_alerts", "get_alerts"]:
            trace.append("[FINANCE] Scanning ledger for overdue payments and credit exposure alerts...")
            res = get_financial_alerts()
            trace.append(f"[FINANCE] Detected {res['total_alerts']} active financial alerts ({res['high_severity_count']} high severity).")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": res,
                "trace": trace
            }

        elif action in ["calculate_gst"]:
            taxable = float(params.get("taxable_amount", params.get("amount", 0.0)))
            rate = float(params.get("gst_rate", 18.0))
            trace.append(f"[FINANCE] Computing GST on ₹{taxable:,.2f} at {rate}%...")
            res = calculate_gst(taxable, rate)
            trace.append(f"[FINANCE] GST Amount: ₹{res['gst_amount']:,.2f}, Total: ₹{res['total_amount']:,.2f}")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": res,
                "trace": trace
            }

        elif action in ["calculate_profit", "calculate_margin"]:
            cost = float(params.get("cost_price", params.get("cost", 0.0)))
            sell = float(params.get("selling_price", params.get("price", 0.0)))
            qty = int(params.get("quantity", 1))
            trace.append(f"[FINANCE] Analyzing margin and profit for Unit Cost ₹{cost:,.2f} vs Selling Price ₹{sell:,.2f}...")
            res = calculate_profit(cost, sell, qty)
            trace.append(f"[FINANCE] Unit Profit: ₹{res['unit_profit']:,.2f} | Margin: {res['profit_margin_pct']}%")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": res,
                "trace": trace
            }

        else:
            return {
                "agent": self.name,
                "action": action,
                "status": "UNKNOWN_ACTION",
                "data": {"error": f"Action '{action}' is not supported by Finance Agent."},
                "trace": trace
            }
