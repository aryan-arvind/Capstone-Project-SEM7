import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func
from src.database.connection import SessionLocal
from src.models.db_models import Product, Order, OrderItem, PurchaseOrder, Supplier

def get_inventory() -> List[Dict[str, Any]]:
    """Returns the full list of products and current stock in the warehouse."""
    session = SessionLocal()
    try:
        products = session.query(Product).all()
        result = []
        for p in products:
            status = "IN_STOCK"
            if p.stock_quantity == 0:
                status = "OUT_OF_STOCK"
            elif p.stock_quantity <= p.reorder_level:
                status = "LOW_STOCK"
                
            result.append({
                "product_id": p.product_id,
                "name": p.name,
                "category": p.category,
                "cost_price": float(p.cost_price),
                "selling_price": float(p.selling_price),
                "gst_rate": float(p.gst_rate),
                "stock_quantity": int(p.stock_quantity),
                "reorder_level": int(p.reorder_level),
                "sku": p.sku,
                "stock_status": status
            })
        return result
    finally:
        session.close()

def get_product(product_name_or_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves single product details by exact/partial name or product_id."""
    session = SessionLocal()
    try:
        product = None
        if str(product_name_or_id).isdigit():
            product = session.query(Product).filter(Product.product_id == int(product_name_or_id)).first()
        
        if not product:
            product = session.query(Product).filter(
                Product.name.ilike(f"%{product_name_or_id.strip()}%")
            ).first()

        if not product:
            return None

        status = "IN_STOCK"
        if product.stock_quantity == 0:
            status = "OUT_OF_STOCK"
        elif product.stock_quantity <= product.reorder_level:
            status = "LOW_STOCK"

        return {
            "product_id": product.product_id,
            "name": product.name,
            "category": product.category,
            "cost_price": float(product.cost_price),
            "selling_price": float(product.selling_price),
            "gst_rate": float(product.gst_rate),
            "stock_quantity": int(product.stock_quantity),
            "reorder_level": int(product.reorder_level),
            "sku": product.sku,
            "stock_status": status
        }
    finally:
        session.close()

def check_stock(product_name: str, requested_qty: int = 0) -> Dict[str, Any]:
    """
    Checks stock availability for a product and computes shortage against a requested quantity.
    """
    prod = get_product(product_name)
    if not prod:
        return {
            "found": False,
            "product_name": product_name,
            "message": f"Product '{product_name}' not found in inventory catalog."
        }

    current_stock = prod["stock_quantity"]
    shortage = max(0, requested_qty - current_stock) if requested_qty > 0 else 0
    is_sufficient = (current_stock >= requested_qty) if requested_qty > 0 else (current_stock > prod["reorder_level"])

    return {
        "found": True,
        "product_id": prod["product_id"],
        "product_name": prod["name"],
        "category": prod["category"],
        "current_stock": current_stock,
        "reorder_level": prod["reorder_level"],
        "requested_quantity": requested_qty,
        "shortage": shortage,
        "is_sufficient": is_sufficient,
        "needs_procurement": shortage > 0 or current_stock <= prod["reorder_level"],
        "unit_cost_price": prod["cost_price"],
        "unit_selling_price": prod["selling_price"],
        "gst_rate": prod["gst_rate"],
        "message": f"Stock check: {current_stock} units of '{prod['name']}' in stock. Shortage for {requested_qty} units: {shortage}."
    }

def get_low_stock_products() -> List[Dict[str, Any]]:
    """Identifies all products currently at or below their reorder threshold."""
    session = SessionLocal()
    try:
        products = session.query(Product).filter(Product.stock_quantity <= Product.reorder_level).all()
        return [
            {
                "product_id": p.product_id,
                "name": p.name,
                "category": p.category,
                "stock_quantity": int(p.stock_quantity),
                "reorder_level": int(p.reorder_level),
                "suggested_reorder_qty": max(int(p.reorder_level) * 2 - int(p.stock_quantity), 10),
                "cost_price": float(p.cost_price),
                "is_out_of_stock": p.stock_quantity == 0
            }
            for p in products
        ]
    finally:
        session.close()

def calculate_stock_shortage(product_name: str, requested_qty: int) -> Dict[str, Any]:
    """Calculates exact shortage for procurement."""
    return check_stock(product_name=product_name, requested_qty=requested_qty)

def get_sales_history(product_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetches sales history by product from completed orders."""
    session = SessionLocal()
    try:
        query = session.query(
            Product.name,
            func.sum(OrderItem.quantity).label("total_sold"),
            func.sum(OrderItem.total_price).label("total_revenue")
        ).join(OrderItem, Product.product_id == OrderItem.product_id)\
         .join(Order, OrderItem.order_id == Order.order_id)

        if product_name:
            query = query.filter(Product.name.ilike(f"%{product_name}%"))

        results = query.group_by(Product.name).all()
        return [
            {
                "product_name": r[0],
                "units_sold": int(r[1] or 0),
                "total_revenue": float(r[2] or 0.0)
            }
            for r in results
        ]
    finally:
        session.close()

def get_fast_moving_products() -> List[Dict[str, Any]]:
    """Returns top selling products based on order records."""
    history = get_sales_history()
    return sorted(history, key=lambda x: x["units_sold"], reverse=True)

def calculate_reorder_requirement(product_name: str) -> Dict[str, Any]:
    """Calculates recommended reorder quantity based on reorder level and current stock."""
    prod = get_product(product_name)
    if not prod:
        return {"error": f"Product '{product_name}' not found."}
    
    current_stock = prod["stock_quantity"]
    reorder_level = prod["reorder_level"]
    suggested = max(0, (reorder_level * 2) - current_stock)
    
    return {
        "product_id": prod["product_id"],
        "product_name": prod["name"],
        "current_stock": current_stock,
        "reorder_level": reorder_level,
        "reorder_needed": current_stock <= reorder_level,
        "suggested_reorder_qty": suggested if current_stock <= reorder_level else 0
    }

def create_purchase_order(
    supplier_id: int,
    product_name: str,
    quantity: int,
    unit_price: float,
    terms: str = "Standard Net 30 Commercial PO"
) -> Dict[str, Any]:
    """Generates and saves an official Purchase Order in the database."""
    session = SessionLocal()
    try:
        supplier = session.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
        if not supplier:
            return {"success": False, "error": f"Supplier with ID {supplier_id} not found."}

        prod = session.query(Product).filter(Product.name.ilike(f"%{product_name}%")).first()
        prod_id = prod.product_id if prod else None

        total_amount = float(quantity * unit_price)
        po_number = f"PO-{datetime.now().strftime('%Y%m%d')}-{session.query(PurchaseOrder).count() + 101}"

        po = PurchaseOrder(
            po_number=po_number,
            supplier_id=supplier.supplier_id,
            supplier_name=supplier.name,
            product_id=prod_id,
            product_name=product_name,
            quantity=quantity,
            unit_price=unit_price,
            total_amount=total_amount,
            expected_delivery_days=supplier.delivery_days,
            terms=terms,
            status="ISSUED"
        )
        session.add(po)
        session.commit()
        session.refresh(po)

        return {
            "success": True,
            "po_id": po.po_id,
            "po_number": po.po_number,
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier_name,
            "product_name": po.product_name,
            "quantity": po.quantity,
            "unit_price": po.unit_price,
            "total_amount": po.total_amount,
            "expected_delivery_days": po.expected_delivery_days,
            "created_date": po.created_date.isoformat(),
            "terms": po.terms,
            "status": po.status
        }
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}
    finally:
        session.close()
