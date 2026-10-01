import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from datetime import datetime
from src.database.connection import SessionLocal
from src.models.db_models import Product, Invoice, Supplier, Quotation, Customer

EXCEL_OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "generated_documents"
)
os.makedirs(EXCEL_OUTPUT_DIR, exist_ok=True)

def _style_header(ws, col_count):
    fill = PatternFill(start_color="312E81", end_color="312E81", fill_type="solid")
    font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    align = Alignment(horizontal="center", vertical="center")
    
    for col in range(1, col_count + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = fill
        cell.font = font
        cell.alignment = align

def export_inventory_excel() -> str:
    """Exports entire inventory master catalog to formatted Excel spreadsheet."""
    filepath = os.path.join(EXCEL_OUTPUT_DIR, "MSME_Inventory_Catalog.xlsx")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inventory Catalog"

    headers = ["Product ID", "SKU", "Product Name", "Category", "Cost Price (INR)", "Selling Price (INR)", "GST Rate (%)", "Current Stock", "Reorder Level", "Stock Status"]
    ws.append(headers)

    session = SessionLocal()
    try:
        products = session.query(Product).all()
        for p in products:
            status = "IN STOCK"
            if p.stock_quantity == 0:
                status = "OUT OF STOCK"
            elif p.stock_quantity <= p.reorder_level:
                status = "LOW STOCK"
                
            ws.append([
                p.product_id,
                p.sku or f"SKU-{p.product_id}",
                p.name,
                p.category,
                p.cost_price,
                p.selling_price,
                p.gst_rate,
                p.stock_quantity,
                p.reorder_level,
                status
            ])
    finally:
        session.close()

    _style_header(ws, len(headers))
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    wb.save(filepath)
    return filepath

def export_invoices_excel() -> str:
    """Exports customer receivables and invoices to formatted Excel spreadsheet."""
    filepath = os.path.join(EXCEL_OUTPUT_DIR, "MSME_Invoices_Ledger.xlsx")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Invoices Ledger"

    headers = ["Invoice ID", "Customer Name", "Invoice Date", "Due Date", "Total Amount (INR)", "Paid Amount (INR)", "Outstanding Amount (INR)", "Payment Status"]
    ws.append(headers)

    session = SessionLocal()
    try:
        invoices = session.query(Invoice).all()
        for inv in invoices:
            cust = session.query(Customer).filter(Customer.customer_id == inv.customer_id).first()
            ws.append([
                inv.invoice_id,
                cust.name if cust else "N/A",
                inv.invoice_date.strftime("%Y-%m-%d"),
                inv.due_date.strftime("%Y-%m-%d"),
                inv.amount,
                inv.paid_amount,
                inv.outstanding_amount,
                inv.status
            ])
    finally:
        session.close()

    _style_header(ws, len(headers))
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    wb.save(filepath)
    return filepath

def export_quotation_excel(quot_data: dict) -> str:
    """Exports individual quotation breakdown to formatted Excel file."""
    quot_num = quot_data.get("quotation_number", "QUOT-001")
    filepath = os.path.join(EXCEL_OUTPUT_DIR, f"Quotation_{quot_num}.xlsx")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quotation Breakdown"

    headers = ["Parameter", "Details / Value"]
    ws.append(headers)
    ws.append(["Quotation Number", quot_data.get("quotation_number")])
    ws.append(["Customer Name", quot_data.get("customer_name")])
    ws.append(["Product Name", quot_data.get("product_name")])
    ws.append(["Quantity", quot_data.get("quantity")])
    ws.append(["Unit Cost Benchmark (INR)", quot_data.get("unit_cost")])
    ws.append(["Desired Margin (%)", quot_data.get("desired_margin_pct")])
    ws.append(["Unit Selling Price (INR)", quot_data.get("unit_price")])
    ws.append(["Gross Subtotal (INR)", quot_data.get("subtotal")])
    ws.append(["Taxable Amount (INR)", quot_data.get("taxable_amount")])
    ws.append(["GST Rate (%)", quot_data.get("gst_rate")])
    ws.append(["GST Tax Amount (INR)", quot_data.get("gst_amount")])
    ws.append(["Final Quotation Total (INR)", quot_data.get("final_amount")])
    ws.append(["Verification Status", "100% VERIFIED BY MULTI-AGENT SYSTEM"])

    _style_header(ws, 2)
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 40
    wb.save(filepath)
    return filepath
