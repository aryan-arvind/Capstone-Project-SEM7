import logging
from typing import Dict, Any, Optional, List
from sqlalchemy import or_
from src.database.connection import SessionLocal
from src.models.db_models import Customer, Order, OrderItem, Invoice, Payment, Product

logger = logging.getLogger(__name__)

def get_or_create_customer_context(customer_name_or_query: str) -> Dict[str, Any]:
    """
    Fetches comprehensive customer business profile, past purchase history,
    payment track record, credit limit, and risk rating.
    If the customer is new, registers them with default enterprise commercial terms.
    """
    session = SessionLocal()
    try:
        clean_name = customer_name_or_query.strip()
        
        cust = session.query(Customer).filter(
            or_(
                Customer.name.ilike(f"%{clean_name}%"),
                Customer.company.ilike(f"%{clean_name}%")
            )
        ).first()

        # If customer does not exist in DB, create profile dynamically
        if not cust:
            cust = Customer(
                name=clean_name.title(),
                company=f"{clean_name.title()} Enterprises",
                email=f"{clean_name.lower().replace(' ', '')}@business.in",
                phone="+91 98110 55420",
                address="Sector 62, Noida, NCR, UP - 201301",
                gstin="07AAACR9921B1Z4",
                credit_limit=200000.0
            )
            session.add(cust)
            session.commit()
            session.refresh(cust)

        # Retrieve order history
        orders = session.query(Order).filter(Order.customer_id == cust.customer_id).all()
        total_lifetime_spend = sum(o.total_amount for o in orders)
        
        # Retrieve invoices
        invoices = session.query(Invoice).filter(Invoice.customer_id == cust.customer_id).all()
        total_outstanding = sum(i.outstanding_amount for i in invoices)
        overdue_invoices = [i for i in invoices if i.status == "OVERDUE"]
        total_overdue = sum(i.outstanding_amount for i in overdue_invoices)

        # Determine credit credibility rating
        if total_overdue > 50000:
            credit_status = "RESTRICTED (Overdue invoices pending)"
            risk_level = "HIGH"
        elif total_outstanding > cust.credit_limit:
            credit_status = "CREDIT LIMIT EXCEEDED"
            risk_level = "MEDIUM"
        else:
            credit_status = "PRIME (Eligible for standard 30-day commercial credit)"
            risk_level = "LOW"

        past_orders_summary = []
        for o in orders:
            items = session.query(OrderItem).filter(OrderItem.order_id == o.order_id).all()
            for itm in items:
                prod = session.query(Product).filter(Product.product_id == itm.product_id).first()
                past_orders_summary.append({
                    "order_date": o.order_date.strftime("%Y-%m-%d"),
                    "product": prod.name if prod else "Item",
                    "quantity": itm.quantity,
                    "unit_price": itm.unit_price,
                    "total": itm.total_price
                })

        return {
            "customer_id": cust.customer_id,
            "name": cust.name,
            "company": cust.company or f"{cust.name} Enterprises",
            "email": cust.email or f"{cust.name.lower().replace(' ', '')}@business.in",
            "phone": cust.phone or "+91 98100 12345",
            "address": cust.address or "New Delhi / NCR, India",
            "gstin": cust.gstin or "07AAACR9921B1Z4",
            "credit_limit": cust.credit_limit or 200000.0,
            "total_lifetime_spend": round(total_lifetime_spend, 2),
            "total_outstanding": round(total_outstanding, 2),
            "total_overdue": round(total_overdue, 2),
            "credit_rating": credit_status,
            "risk_level": risk_level,
            "past_purchases": past_orders_summary,
            "account_manager": "Amitabh Sen (Senior Accounts Lead)"
        }
    finally:
        session.close()

def get_all_customers_crm() -> List[Dict[str, Any]]:
    """Returns directory of all customers with active credit profiles and ledger balances."""
    session = SessionLocal()
    try:
        customers = session.query(Customer).all()
        result = []
        for c in customers:
            invoices = session.query(Invoice).filter(Invoice.customer_id == c.customer_id).all()
            total_out = sum(i.outstanding_amount for i in invoices)
            overdue = sum(i.outstanding_amount for i in invoices if i.status == "OVERDUE")
            
            result.append({
                "customer_id": c.customer_id,
                "name": c.name,
                "company": c.company or c.name,
                "email": c.email,
                "phone": c.phone,
                "gstin": c.gstin,
                "address": c.address,
                "credit_limit": c.credit_limit,
                "total_outstanding": round(total_out, 2),
                "total_overdue": round(overdue, 2),
                "status": "OVERDUE" if overdue > 0 else ("ACTIVE" if total_out > 0 else "SETTLED")
            })
        return result
    finally:
        session.close()
