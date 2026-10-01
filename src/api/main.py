"""
FastAPI REST Application for Indian MSME AI Multi-Agent Operations Platform.
Exposes endpoints for Orchestrator, Finance Agent, Inventory Agent, Verification Agent,
deterministic arithmetic tools, PDF quotation downloads, Excel exports, dashboard metrics, and Data Digitalization.
"""

import os
import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.database.connection import SessionLocal
from src.database.seed_data import init_and_seed_db
from src.models.db_models import Customer, Product, Supplier, Order, OrderItem, Invoice, Payment, Quotation, PurchaseOrder
from src.agents.orchestrator import MultiAgentOrchestrator
from src.tools.finance_tools import (
    get_outstanding_invoices, get_financial_alerts, get_customer_payment_history,
    calculate_selling_price_from_margin
)
from src.tools.inventory_tools import get_inventory, get_low_stock_products
from src.tools.supplier_tools import get_suppliers, compare_suppliers
from src.tools.excel_generator import export_inventory_excel, export_invoices_excel, export_quotation_excel
from src.tools.customer_tools import get_all_customers_crm, get_or_create_customer_context
from src.ingestion.router import router as ingestion_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Multi-Agent MSME Operations Platform",
    description="Agentic Business Assistant for Indian MSMEs: Orchestrator, Finance, Inventory & Verification Agents.",
    version="3.0.0"
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize and seed database on startup if not already seeded
init_and_seed_db(force=False)

# Mount Ingestion Router for Data Digitalization
app.include_router(ingestion_router, prefix="/api")
app.include_router(ingestion_router)

orchestrator = MultiAgentOrchestrator()


# ── REQUEST / RESPONSE MODELS ──────────────────────────────────────────────────

class AssistantChatRequest(BaseModel):
    message: str = Field(..., description="Natural language business request from MSME owner")


# ── HEALTH & STATUS ────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": "AI Multi-Agent MSME Operations Assistant",
        "version": "3.0.0",
        "agents": ["Orchestrator Agent", "Finance Agent", "Inventory & Procurement Agent", "Verification Agent"]
    }


# ── AI MULTI-AGENT CHAT & ASSISTANT ENDPOINTS ──────────────────────────────────

@app.post("/api/assistant/chat", tags=["Multi-Agent Assistant"])
def chat_with_multi_agent(payload: AssistantChatRequest) -> Dict[str, Any]:
    """
    Executes the multi-agent pipeline:
    Orchestrator -> Inventory / Finance Agent -> Deterministic Tools -> Verification Agent -> Final Synthesis.
    """
    try:
        response = orchestrator.process_request(payload.message)
        return response
    except Exception as ex:
        logger.error(f"Error processing agent chat: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(ex))


@app.get("/api/assistant/presets", tags=["Multi-Agent Assistant"])
def get_preset_demos() -> Dict[str, Any]:
    """
    Returns suggested business scenario queries.
    """
    return {
        "presets": [
            {
                "id": "demo_1",
                "title": "Stock & Warehouse Inquiry",
                "prompt": "How many office chairs are in stock?",
                "expected_agents": ["Inventory Agent"],
                "badge": "Inventory Operations"
            },
            {
                "id": "demo_2",
                "title": "Overdue Receivables Audit",
                "prompt": "Which customers have overdue payments?",
                "expected_agents": ["Finance Agent"],
                "badge": "Finance Ledger"
            },
            {
                "id": "demo_3",
                "title": "B2B Supplier Discovery & Comparison",
                "prompt": "Find suppliers for 100 office chairs.",
                "expected_agents": ["Inventory Agent"],
                "badge": "Procurement & Trade-offs"
            },
            {
                "id": "demo_4",
                "title": "Quotation with Target Profit Margin",
                "prompt": "Prepare a quotation for 100 office chairs with a 20% margin.",
                "expected_agents": ["Inventory Agent", "Finance Agent", "Verification Agent"],
                "badge": "Multi-Agent Quotation"
            },
            {
                "id": "demo_5",
                "title": "Automated Procurement & Certified Quotation",
                "prompt": "A customer wants 100 office chairs. Check our stock, find supplier options if necessary, compare them, calculate the selling price with a 20% margin and applicable GST, and prepare a quotation.",
                "expected_agents": ["Orchestrator", "Inventory Agent", "Finance Agent", "Verification Agent"],
                "badge": "🌟 Complete Workflow"
            }
        ]
    }


# ── DASHBOARD AGGREGATE ENDPOINTS ──────────────────────────────────────────────

@app.get("/api/dashboard/overview", tags=["Dashboard"])
def get_dashboard_overview() -> Dict[str, Any]:
    session = SessionLocal()
    try:
        orders = session.query(Order).all()
        total_sales = sum(o.total_amount for o in orders)
        
        invoices = session.query(Invoice).all()
        total_outstanding = sum(i.outstanding_amount for i in invoices)
        overdue_invoices = [i for i in invoices if i.status == "OVERDUE"]
        total_overdue = sum(i.outstanding_amount for i in overdue_invoices)

        products = session.query(Product).all()
        low_stock = [p for p in products if p.stock_quantity <= p.reorder_level]
        out_of_stock = [p for p in products if p.stock_quantity == 0]

        quotations = session.query(Quotation).order_by(Quotation.quotation_id.desc()).limit(5).all()

        recent_quotations_list = [
            {
                "quotation_id": q.quotation_id,
                "quotation_number": q.quotation_number,
                "customer_name": q.customer_name,
                "product_name": q.product_name,
                "quantity": q.quantity,
                "final_amount": q.final_amount,
                "status": q.status,
                "verified": q.verified_by_agent,
                "date": q.date.strftime("%Y-%m-%d")
            }
            for q in quotations
        ]

        return {
            "total_sales_revenue": round(total_sales, 2),
            "total_outstanding_receivables": round(total_outstanding, 2),
            "total_overdue_amount": round(total_overdue, 2),
            "overdue_invoices_count": len(overdue_invoices),
            "total_products_count": len(products),
            "low_stock_items_count": len(low_stock),
            "out_of_stock_items_count": len(out_of_stock),
            "total_quotations_count": session.query(Quotation).count(),
            "recent_quotations": recent_quotations_list,
            "recent_orders": [
                {
                    "order_id": o.order_id,
                    "customer_id": o.customer_id,
                    "date": o.order_date.strftime("%Y-%m-%d"),
                    "amount": o.total_amount,
                    "status": o.status
                }
                for o in orders[-5:]
            ]
        }
    finally:
        session.close()


@app.get("/api/dashboard/finance", tags=["Dashboard"])
def get_dashboard_finance() -> Dict[str, Any]:
    session = SessionLocal()
    try:
        inv_data = get_outstanding_invoices()
        alerts = get_financial_alerts()
        
        all_invoices = session.query(Invoice).all()
        invoices_list = []
        for inv in all_invoices:
            cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
            invoices_list.append({
                "invoice_id": inv.invoice_id,
                "customer_name": cust.name if cust else "N/A",
                "amount": inv.amount,
                "paid_amount": inv.paid_amount,
                "outstanding_amount": inv.outstanding_amount,
                "invoice_date": inv.invoice_date.strftime("%Y-%m-%d"),
                "due_date": inv.due_date.strftime("%Y-%m-%d"),
                "status": inv.status
            })

        customers = session.query(Customer).all()
        customers_summary = []
        for c in customers:
            c_invoices = session.query(Invoice).filter(Invoice.customer_id == c.customer_id).all()
            total_out = sum(i.outstanding_amount for i in c_invoices)
            customers_summary.append({
                "customer_id": c.customer_id,
                "name": c.name,
                "company": c.company,
                "phone": c.phone,
                "credit_limit": c.credit_limit,
                "total_outstanding": round(total_out, 2),
                "invoices_count": len(c_invoices)
            })

        return {
            "overview": inv_data,
            "alerts": alerts,
            "invoices": invoices_list,
            "customers": customers_summary
        }
    finally:
        session.close()


@app.get("/api/customers", tags=["CRM"])
def get_customers():
    """Returns all customers with active credit profiles and ledger balances."""
    return {"customers": get_all_customers_crm()}


@app.get("/api/dashboard/inventory", tags=["Dashboard"])
def get_dashboard_inventory() -> Dict[str, Any]:
    inventory = get_inventory()
    low_stock = get_low_stock_products()
    return {
        "total_catalog_items": len(inventory),
        "inventory": inventory,
        "low_stock_items": low_stock
    }


@app.get("/api/dashboard/suppliers", tags=["Dashboard"])
def get_dashboard_suppliers(product_name: Optional[str] = None) -> Dict[str, Any]:
    suppliers = get_suppliers(product_name)
    return {
        "total_suppliers": len(suppliers),
        "suppliers": suppliers
    }


@app.get("/api/dashboard/quotations", tags=["Dashboard"])
def get_dashboard_quotations() -> Dict[str, Any]:
    session = SessionLocal()
    try:
        quotations = session.query(Quotation).order_by(Quotation.quotation_id.desc()).all()
        return {
            "quotations": [
                {
                    "quotation_id": q.quotation_id,
                    "quotation_number": q.quotation_number,
                    "customer_name": q.customer_name,
                    "product_name": q.product_name,
                    "quantity": q.quantity,
                    "unit_cost": q.unit_cost,
                    "desired_margin_pct": q.desired_margin_pct,
                    "unit_price": q.unit_price,
                    "taxable_amount": q.taxable_amount,
                    "gst_rate": q.gst_rate,
                    "gst_amount": q.gst_amount,
                    "final_amount": q.final_amount,
                    "status": q.status,
                    "verified": q.verified_by_agent,
                    "date": q.date.strftime("%Y-%m-%d"),
                    "pdf_available": bool(q.pdf_path and os.path.exists(q.pdf_path))
                }
                for q in quotations
            ]
        }
    finally:
        session.close()


# ── PDF & EXCEL DOCUMENT EXPORTS ───────────────────────────────────────────────

@app.get("/api/quotations/{quotation_number}/pdf", tags=["Documents"])
def download_quotation_pdf(quotation_number: str):
    """Downloads official Quotation PDF."""
    session = SessionLocal()
    try:
        quot = session.query(Quotation).filter(Quotation.quotation_number == quotation_number).first()
        if not quot or not quot.pdf_path or not os.path.exists(quot.pdf_path):
            raise HTTPException(status_code=404, detail="Quotation PDF document not found")

        return FileResponse(
            path=quot.pdf_path,
            filename=f"Quotation_{quotation_number}.pdf",
            media_type="application/pdf"
        )
    finally:
        session.close()


@app.get("/api/quotations/{quotation_number}/excel", tags=["Documents"])
def download_quotation_excel(quotation_number: str):
    """Downloads Quotation breakdown in Excel (.xlsx) format."""
    session = SessionLocal()
    try:
        quot = session.query(Quotation).filter(Quotation.quotation_number == quotation_number).first()
        if not quot:
            raise HTTPException(status_code=404, detail="Quotation not found")

        data = {
            "quotation_number": quot.quotation_number,
            "customer_name": quot.customer_name,
            "product_name": quot.product_name,
            "quantity": quot.quantity,
            "unit_cost": quot.unit_cost,
            "desired_margin_pct": quot.desired_margin_pct,
            "unit_price": quot.unit_price,
            "subtotal": quot.subtotal,
            "taxable_amount": quot.taxable_amount,
            "gst_rate": quot.gst_rate,
            "gst_amount": quot.gst_amount,
            "final_amount": quot.final_amount
        }
        excel_path = export_quotation_excel(data)
        return FileResponse(
            path=excel_path,
            filename=f"Quotation_{quotation_number}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    finally:
        session.close()


@app.get("/api/export/inventory/excel", tags=["Documents"])
def download_inventory_excel():
    """Exports full warehouse inventory catalog as an Excel (.xlsx) spreadsheet."""
    path = export_inventory_excel()
    return FileResponse(
        path=path,
        filename="MSME_Inventory_Catalog.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@app.get("/api/export/invoices/excel", tags=["Documents"])
def download_invoices_excel():
    """Exports full receivables ledger and invoices as an Excel (.xlsx) spreadsheet."""
    path = export_invoices_excel()
    return FileResponse(
        path=path,
        filename="MSME_Invoices_Ledger.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
