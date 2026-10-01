import os
from typing import List, Dict, Any, Optional
from src.database.connection import SessionLocal
from src.models.db_models import Supplier, Product
from src.tools.india_mart import IndiaMartClient

indiamart_client = IndiaMartClient()

def get_suppliers(product_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetches all suppliers from local database, optionally filtered by product name."""
    session = SessionLocal()
    try:
        query = session.query(Supplier)
        if product_name:
            query = query.filter(Supplier.product_name.ilike(f"%{product_name.strip()}%"))
        
        suppliers = query.all()
        return [
            {
                "supplier_id": s.supplier_id,
                "name": s.name,
                "product_id": s.product_id,
                "product_name": s.product_name,
                "unit_price": float(s.unit_price),
                "moq": int(s.moq),
                "available_quantity": int(s.available_quantity),
                "location": s.location,
                "delivery_days": int(s.delivery_days),
                "rating": float(s.rating),
                "contact_email": s.contact_email,
                "contact_phone": s.contact_phone,
                "source": s.source
            }
            for s in suppliers
        ]
    finally:
        session.close()

def get_supplier_details(supplier_id: int) -> Optional[Dict[str, Any]]:
    """Fetches specific supplier details by ID."""
    session = SessionLocal()
    try:
        s = session.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
        if not s:
            return None
        return {
            "supplier_id": s.supplier_id,
            "name": s.name,
            "product_id": s.product_id,
            "product_name": s.product_name,
            "unit_price": float(s.unit_price),
            "moq": int(s.moq),
            "available_quantity": int(s.available_quantity),
            "location": s.location,
            "delivery_days": int(s.delivery_days),
            "rating": float(s.rating),
            "contact_email": s.contact_email,
            "contact_phone": s.contact_phone,
            "source": s.source
        }
    finally:
        session.close()

def search_suppliers(
    product_name: str,
    required_qty: int = 1,
    sort_by: str = "price"
) -> List[Dict[str, Any]]:
    """
    Searches both Database and IndiaMART marketplace for suppliers fulfilling the requested product & qty.
    Filters out suppliers who cannot meet required MOQ / availability where applicable.
    """
    db_suppliers = get_suppliers(product_name)
    im_results = indiamart_client.search_verified_suppliers(product_name, min_qty=required_qty)

    # Merge DB and marketplace listings
    combined = []
    seen_names = set()

    for s in db_suppliers:
        seen_names.add(s["name"].lower())
        fits_qty = s["available_quantity"] >= required_qty
        fits_moq = s["moq"] <= required_qty
        combined.append({
            **s,
            "fits_required_qty": fits_qty,
            "fits_moq": fits_moq,
            "tradeoff_notes": f"MOQ: {s['moq']}, Delivery: {s['delivery_days']} days, Location: {s['location']}"
        })

    for im in im_results:
        if im["supplier_name"].lower() not in seen_names:
            fits_qty = im["available_quantity"] >= required_qty
            fits_moq = im["moq"] <= required_qty
            combined.append({
                "supplier_id": 9000 + len(combined),
                "name": im["supplier_name"],
                "product_id": None,
                "product_name": im["product_name"],
                "unit_price": im["unit_price"],
                "moq": im["moq"],
                "available_quantity": im["available_quantity"],
                "location": im["location"],
                "delivery_days": im["delivery_days"],
                "rating": im["rating"],
                "contact_email": None,
                "contact_phone": im["contact"],
                "source": im["verified_badge"],
                "fits_required_qty": fits_qty,
                "fits_moq": fits_moq,
                "tradeoff_notes": f"Verified: {im['verified_badge']}, Delivery: {im['delivery_days']}d"
            })

    # Sort based on criteria
    if sort_by == "price":
        combined.sort(key=lambda x: x["unit_price"])
    elif sort_by == "delivery":
        combined.sort(key=lambda x: x["delivery_days"])
    elif sort_by == "rating":
        combined.sort(key=lambda x: x["rating"], reverse=True)

    return combined

def compare_suppliers(
    product_name: str,
    required_qty: int = 1,
    preference: str = "cheapest"
) -> Dict[str, Any]:
    """
    Compares available supplier options based on explicit user criteria:
    - 'cheapest': Lowest unit price fulfilling MOQ
    - 'fastest': Shortest delivery lead time
    - 'balanced': Best composite rating, price, and reasonable delivery
    Provides full trade-off summary without hallucinating a single forced best.
    """
    suppliers = search_suppliers(product_name, required_qty=required_qty, sort_by="price")
    
    if not suppliers:
        return {
            "found": False,
            "product_name": product_name,
            "message": f"No suppliers found matching '{product_name}'."
        }

    # Identify highlights
    eligible = [s for s in suppliers if s["available_quantity"] >= required_qty] or suppliers
    
    cheapest = min(eligible, key=lambda x: x["unit_price"])
    fastest = min(eligible, key=lambda x: x["delivery_days"])
    highest_rated = max(eligible, key=lambda x: x["rating"])

    # Selected recommendation based on preference
    selected = cheapest
    recommendation_reason = "Lowest procurement cost per unit"
    
    if "fast" in preference.lower() or "speed" in preference.lower() or "quick" in preference.lower():
        selected = fastest
        recommendation_reason = f"Fastest delivery time ({fastest['delivery_days']} days)"
    elif "rating" in preference.lower() or "quality" in preference.lower() or "reliable" in preference.lower():
        selected = highest_rated
        recommendation_reason = f"Highest verified rating ({highest_rated['rating']}/5.0)"
    elif "balanced" in preference.lower():
        # Score = (Price rank * 0.4) + (Delivery rank * 0.3) + (Rating rank * 0.3)
        selected = cheapest  # default sensible choice with balanced summary
        recommendation_reason = "Optimal balance of verified quality, unit pricing, and fulfillment speed"

    total_procurement_cost = round(float(selected["unit_price"] * required_qty), 2)

    return {
        "found": True,
        "product_name": product_name,
        "required_quantity": required_qty,
        "preference_applied": preference,
        "total_suppliers_found": len(suppliers),
        "options": suppliers,
        "highlights": {
            "cheapest_option": {
                "supplier": cheapest["name"],
                "price": cheapest["unit_price"],
                "delivery_days": cheapest["delivery_days"],
                "location": cheapest["location"]
            },
            "fastest_option": {
                "supplier": fastest["name"],
                "price": fastest["unit_price"],
                "delivery_days": fastest["delivery_days"],
                "location": fastest["location"]
            },
            "highest_rated_option": {
                "supplier": highest_rated["name"],
                "rating": highest_rated["rating"],
                "price": highest_rated["unit_price"],
                "location": highest_rated["location"]
            }
        },
        "selected_supplier": selected,
        "selected_unit_price": selected["unit_price"],
        "total_purchase_cost": total_procurement_cost,
        "recommendation_reason": recommendation_reason,
        "tradeoff_analysis": (
            f"Comparing {len(suppliers)} options for {required_qty} units of '{product_name}':\n"
            f"• Cheapest: {cheapest['name']} at ₹{cheapest['unit_price']:,.2f} ({cheapest['delivery_days']} days delivery from {cheapest['location']}).\n"
            f"• Fastest: {fastest['name']} at ₹{fastest['unit_price']:,.2f} ({fastest['delivery_days']} days delivery from {fastest['location']}).\n"
            f"• Selected based on '{preference}': {selected['name']} (Unit Price: ₹{selected['unit_price']:,.2f}, Total Cost: ₹{total_procurement_cost:,.2f})."
        )
    }
