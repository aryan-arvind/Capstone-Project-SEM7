import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy import or_
from src.database.connection import SessionLocal
from src.models.db_models import Customer, Invoice, Payment, Quotation, Product

# ── 1. DETERMINISTIC ARITHMETIC CALCULATION FUNCTIONS ──────────────────────────

def calculate_gst(taxable_amount: float, gst_rate: float) -> Dict[str, Any]:
    """
    Deterministically computes GST amount and total price.
    All calculations rounded to 2 decimal places.
    """
    taxable_amount = float(taxable_amount)
    gst_rate = float(gst_rate)
    gst_amount = round(taxable_amount * (gst_rate / 100.0), 2)
    total_amount = round(taxable_amount + gst_amount, 2)
    return {
        "taxable_amount": taxable_amount,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "total_amount": total_amount
    }

def calculate_discount(amount: float, discount_pct: float) -> Dict[str, Any]:
    """
    Deterministically calculates discount and discounted total.
    """
    amount = float(amount)
    discount_pct = float(discount_pct)
    discount_amount = round(amount * (discount_pct / 100.0), 2)
    discounted_amount = round(amount - discount_amount, 2)
    return {
        "original_amount": amount,
        "discount_pct": discount_pct,
        "discount_amount": discount_amount,
        "discounted_amount": discounted_amount
    }

def calculate_profit(cost_price: float, selling_price: float, quantity: int = 1) -> Dict[str, Any]:
    """
    Deterministically calculates gross profit and margins on transactions.
    """
    cost_price = float(cost_price)
    selling_price = float(selling_price)
    quantity = int(quantity)

    unit_profit = round(selling_price - cost_price, 2)
    total_cost = round(cost_price * quantity, 2)
    total_revenue = round(selling_price * quantity, 2)
    total_profit = round(total_revenue - total_cost, 2)
    margin_pct = round((unit_profit / selling_price * 100.0), 2) if selling_price > 0 else 0.0

    return {
        "unit_cost": cost_price,
        "unit_selling_price": selling_price,
        "quantity": quantity,
        "unit_profit": unit_profit,
        "total_cost": total_cost,
        "total_revenue": total_revenue,
        "total_profit": total_profit,
        "profit_margin_pct": margin_pct,
        "is_profitable": total_profit > 0
    }

def calculate_margin(cost_price: float, selling_price: float) -> Dict[str, Any]:
    """
    Calculates profit margin % (on selling price) and markup % (on cost price).
    """
    cost_price = float(cost_price)
    selling_price = float(selling_price)
    profit = selling_price - cost_price

    margin_pct = round((profit / selling_price * 100.0), 2) if selling_price > 0 else 0.0
    markup_pct = round((profit / cost_price * 100.0), 2) if cost_price > 0 else 0.0

    return {
        "cost_price": cost_price,
        "selling_price": selling_price,
        "profit_per_unit": round(profit, 2),
        "margin_pct": margin_pct,
        "markup_pct": markup_pct
    }

def calculate_selling_price_from_margin(
    unit_cost: float,
    margin_pct: float,
    quantity: int,
    gst_rate: float,
    discount_pct: float = 0.0
) -> Dict[str, Any]:
    """
    Deterministically computes complete Quotation financial structure:
    1. Purchase Cost = unit_cost * quantity
    2. Unit Selling Price = unit_cost * (1 + margin_pct / 100)
    3. Gross Subtotal = Unit Selling Price * quantity
    4. Discount = Subtotal * (discount_pct / 100)
    5. Taxable Amount = Gross Subtotal - Discount
    6. GST Amount = Taxable Amount * (gst_rate / 100)
    7. Final Quotation Amount = Taxable Amount + GST Amount
    """
    unit_cost = float(unit_cost)
    margin_pct = float(margin_pct)
    quantity = int(quantity)
    gst_rate = float(gst_rate)
    discount_pct = float(discount_pct)

    purchase_cost = round(unit_cost * quantity, 2)
    unit_selling_price = round(unit_cost * (1.0 + margin_pct / 100.0), 2)
    subtotal = round(unit_selling_price * quantity, 2)
    
    disc_calc = calculate_discount(subtotal, discount_pct)
    discount_amount = disc_calc["discount_amount"]
    taxable_amount = disc_calc["discounted_amount"]

    gst_calc = calculate_gst(taxable_amount, gst_rate)
    gst_amount = gst_calc["gst_amount"]
    final_amount = gst_calc["total_amount"]

    gross_profit = round(taxable_amount - purchase_cost, 2)
    actual_margin_pct = round((gross_profit / taxable_amount * 100.0), 2) if taxable_amount > 0 else 0.0

    return {
        "unit_cost": unit_cost,
        "quantity": quantity,
        "purchase_cost": purchase_cost,
        "desired_margin_pct": margin_pct,
        "unit_selling_price": unit_selling_price,
        "subtotal": subtotal,
        "discount_pct": discount_pct,
        "discount_amount": discount_amount,
        "taxable_amount": taxable_amount,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "final_amount": final_amount,
        "gross_profit": gross_profit,
        "actual_margin_pct": actual_margin_pct,
        "breakdown_summary": (
            f"Purchase Cost: ₹{purchase_cost:,.2f} ({quantity} @ ₹{unit_cost:,.2f}) | "
            f"Markup/Margin: {margin_pct:.1f}% -> Selling Price: ₹{taxable_amount:,.2f} | "
            f"GST ({gst_rate:.0f}%): ₹{gst_amount:,.2f} | Final Quotation Total: ₹{final_amount:,.2f}"
        )
    }

# ── 2. DATABASE FINANCIAL QUERIES & INVOICE MANAGEMENT ──────────────────────────

def get_customer_payment_history(customer_query: str) -> Dict[str, Any]:
    """
    Fetches full payment history, paid invoices, unpaid invoices, and balance for a customer.
    """
    session = SessionLocal()
    try:
        cust = None
        if str(customer_query).isdigit():
            cust = session.query(Customer).filter(Customer.customer_id == int(customer_query)).first()
        
        if not cust:
            cust = session.query(Customer).filter(
                or_(
                    Customer.name.ilike(f"%{customer_query.strip()}%"),
                    Customer.company.ilike(f"%{customer_query.strip()}%")
                )
            ).first()

        if not cust:
            return {
                "found": False,
                "message": f"Customer '{customer_query}' not found in database."
            }

        invoices = session.query(Invoice).filter(Invoice.customer_id == cust.customer_id).all()
        
        total_invoiced = sum(i.amount for i in invoices)
        total_paid = sum(i.paid_amount for i in invoices)
        total_outstanding = sum(i.outstanding_amount for i in invoices)
        overdue_invoices = [i for i in invoices if i.status == "OVERDUE"]

        inv_list = []
        for i in invoices:
            payments = session.query(Payment).filter(Payment.invoice_id == i.invoice_id).all()
            pay_records = [
                {
                    "payment_id": p.payment_id,
                    "date": p.payment_date.strftime("%Y-%m-%d"),
                    "amount": p.amount,
                    "mode": p.payment_mode,
                    "reference": p.reference_no
                }
                for p in payments
            ]
            inv_list.append({
                "invoice_id": i.invoice_id,
                "date": i.invoice_date.strftime("%Y-%m-%d"),
                "due_date": i.due_date.strftime("%Y-%m-%d"),
                "amount": float(i.amount),
                "paid_amount": float(i.paid_amount),
                "outstanding_amount": float(i.outstanding_amount),
                "status": i.status,
                "payments": pay_records
            })

        return {
            "found": True,
            "customer_id": cust.customer_id,
            "customer_name": cust.name,
            "company": cust.company,
            "phone": cust.phone,
            "email": cust.email,
            "gstin": cust.gstin,
            "credit_limit": cust.credit_limit,
            "total_invoiced": round(total_invoiced, 2),
            "total_paid": round(total_paid, 2),
            "total_outstanding": round(total_outstanding, 2),
            "has_overdue": len(overdue_invoices) > 0,
            "overdue_count": len(overdue_invoices),
            "invoices": inv_list
        }
    finally:
        session.close()

def get_outstanding_invoices() -> Dict[str, Any]:
    """
    Retrieves all unpaid, partially paid, and overdue invoices across all customers.
    """
    session = SessionLocal()
    try:
        invoices = session.query(Invoice).filter(Invoice.outstanding_amount > 0).all()
        
        total_outstanding = 0.0
        total_overdue = 0.0
        overdue_list = []
        pending_list = []

        for inv in invoices:
            cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
            cust_name = cust.name if cust else "Unknown Customer"
            
            item = {
                "invoice_id": inv.invoice_id,
                "customer_id": inv.customer_id,
                "customer_name": cust_name,
                "invoice_date": inv.invoice_date.strftime("%Y-%m-%d"),
                "due_date": inv.due_date.strftime("%Y-%m-%d"),
                "amount": float(inv.amount),
                "paid_amount": float(inv.paid_amount),
                "outstanding_amount": float(inv.outstanding_amount),
                "status": inv.status
            }
            total_outstanding += inv.outstanding_amount
            if inv.status == "OVERDUE":
                total_overdue += inv.outstanding_amount
                overdue_list.append(item)
            else:
                pending_list.append(item)

        return {
            "total_outstanding_amount": round(total_outstanding, 2),
            "total_overdue_amount": round(total_overdue, 2),
            "total_unpaid_invoices_count": len(invoices),
            "overdue_invoices_count": len(overdue_list),
            "overdue_invoices": overdue_list,
            "pending_invoices": pending_list,
            "summary_message": f"Customers currently owe ₹{total_outstanding:,.2f} in total (including ₹{total_overdue:,.2f} overdue)."
        }
    finally:
        session.close()

def get_invoice(invoice_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves single invoice details by invoice ID."""
    session = SessionLocal()
    try:
        inv = session.query(Invoice).filter(Invoice.invoice_id == invoice_id.strip()).first()
        if not inv:
            return None
        cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
        return {
            "invoice_id": inv.invoice_id,
            "customer_name": cust.name if cust else "N/A",
            "invoice_date": inv.invoice_date.strftime("%Y-%m-%d"),
            "due_date": inv.due_date.strftime("%Y-%m-%d"),
            "amount": float(inv.amount),
            "paid_amount": float(inv.paid_amount),
            "outstanding_amount": float(inv.outstanding_amount),
            "status": inv.status
        }
    finally:
        session.close()

def create_invoice(
    customer_id: int,
    items: List[Dict[str, Any]],
    discount_pct: float = 0.0,
    due_days: int = 30
) -> Dict[str, Any]:
    """
    Creates and records a new GST Tax Invoice in the database.
    items: [{"product_name": str, "quantity": int, "unit_price": float, "gst_rate": float}]
    """
    session = SessionLocal()
    try:
        cust = session.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not cust:
            return {"success": False, "error": f"Customer ID {customer_id} not found."}

        subtotal = 0.0
        total_gst = 0.0
        for itm in items:
            line_taxable = itm["quantity"] * itm["unit_price"]
            line_gst = line_taxable * (itm.get("gst_rate", 18.0) / 100.0)
            subtotal += line_taxable
            total_gst += line_gst

        disc_amount = subtotal * (discount_pct / 100.0)
        taxable_total = subtotal - disc_amount
        final_invoice_amount = round(taxable_total + total_gst, 2)

        now = datetime.utcnow()
        inv_count = session.query(Invoice).count() + 1
        invoice_id = f"INV-{now.strftime('%Y')}-{inv_count:04d}"

        new_inv = Invoice(
            invoice_id=invoice_id,
            customer_id=customer_id,
            invoice_date=now,
            amount=final_invoice_amount,
            paid_amount=0.0,
            outstanding_amount=final_invoice_amount,
            due_date=now + timedelta(days=due_days),
            status="UNPAID"
        )
        session.add(new_inv)
        session.commit()

        return {
            "success": True,
            "invoice_id": invoice_id,
            "customer_name": cust.name,
            "amount": final_invoice_amount,
            "taxable_amount": round(taxable_total, 2),
            "gst_amount": round(total_gst, 2),
            "due_date": (now + timedelta(days=due_days)).strftime("%Y-%m-%d"),
            "status": "UNPAID"
        }
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}
    finally:
        session.close()

def generate_payment_reminder(customer_query: str) -> Dict[str, Any]:
    """
    Generates a courteous, legally grounded commercial payment reminder notice for MSME recovery.
    """
    history = get_customer_payment_history(customer_query)
    if not history.get("found"):
        return {"found": False, "message": f"Customer '{customer_query}' not found."}

    cust_name = history["customer_name"]
    company = history["company"]
    outstanding = history["total_outstanding"]
    
    overdue_invoices = [i for i in history["invoices"] if i["status"] == "OVERDUE"]

    if outstanding == 0:
        return {
            "found": True,
            "customer_name": cust_name,
            "outstanding": 0.0,
            "message": f"{cust_name} has no outstanding balance. All accounts are settled!"
        }

    overdue_details = ""
    for inv in overdue_invoices:
        overdue_details += f"• Invoice #{inv['invoice_id']} (Due: {inv['due_date']}) - Balance: ₹{inv['outstanding_amount']:,.2f}\n"

    notice_text = (
        f"Dear {cust_name} / {company},\n\n"
        f"This is a gentle reminder regarding the outstanding balance of ₹{outstanding:,.2f} on your account.\n\n"
        f"Overdue Invoices:\n{overdue_details if overdue_details else '• Current billing cycle pending payment.'}\n"
        f"Kindly arrange for the settlement via NEFT/RTGS/UPI to avoid disruption in credit terms.\n\n"
        f"Bank Account: MSME Operations Current A/c #910020038841 (IFSC: HDFC0001234)\n"
        f"UPI ID: payments@msmeassist\n\n"
        f"Thank you for your valued partnership."
    )

    return {
        "found": True,
        "customer_name": cust_name,
        "company": company,
        "phone": history["phone"],
        "email": history["email"],
        "total_outstanding": outstanding,
        "overdue_invoices_count": len(overdue_invoices),
        "reminder_letter": notice_text
    }

def get_financial_alerts() -> Dict[str, Any]:
    """
    Scans accounts for financial risks:
    - Overdue payments
    - High outstanding balances (> ₹50,000)
    - Low-margin transactions
    """
    session = SessionLocal()
    try:
        overdue_invoices = session.query(Invoice).filter(Invoice.status == "OVERDUE").all()
        large_receivables = session.query(Invoice).filter(Invoice.outstanding_amount >= 50000.0).all()

        alerts = []
        for inv in overdue_invoices:
            cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
            alerts.append({
                "type": "OVERDUE_PAYMENT",
                "severity": "HIGH",
                "title": f"Overdue Invoice: {inv.invoice_id}",
                "description": f"{cust.name if cust else 'Customer'} has overdue payment of ₹{inv.outstanding_amount:,.2f} (Due: {inv.due_date.strftime('%Y-%m-%d')}).",
                "amount": float(inv.outstanding_amount),
                "customer": cust.name if cust else "N/A"
            })

        for inv in large_receivables:
            if inv.status != "OVERDUE":
                cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
                alerts.append({
                    "type": "LARGE_OUTSTANDING",
                    "severity": "MEDIUM",
                    "title": f"High Exposure: {inv.invoice_id}",
                    "description": f"Outstanding balance of ₹{inv.outstanding_amount:,.2f} pending with {cust.name if cust else 'Customer'}.",
                    "amount": float(inv.outstanding_amount),
                    "customer": cust.name if cust else "N/A"
                })

        return {
            "total_alerts": len(alerts),
            "high_severity_count": len([a for a in alerts if a["severity"] == "HIGH"]),
            "alerts": alerts
        }
    finally:
        session.close()
