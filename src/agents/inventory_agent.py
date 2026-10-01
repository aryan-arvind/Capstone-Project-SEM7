import logging
from typing import Dict, Any, Optional
from src.tools.inventory_tools import (
    get_inventory,
    get_product,
    check_stock,
    get_low_stock_products,
    calculate_stock_shortage,
    get_sales_history,
    get_fast_moving_products,
    calculate_reorder_requirement,
    create_purchase_order
)
from src.tools.supplier_tools import (
    get_suppliers,
    search_suppliers,
    compare_suppliers,
    get_supplier_details
)

logger = logging.getLogger(__name__)

class InventoryProcurementAgent:
    """
    Inventory & Procurement Agent.
    Owns: Products, inventory, stock levels, product prices, reorder levels,
    supplier discovery, supplier comparison, procurement, purchase orders.
    """

    def __init__(self):
        self.name = "Inventory & Procurement Agent"

    def execute(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes an inventory or procurement tool action deterministically.
        """
        trace = []
        trace.append(f"[INVENTORY] Initiating action '{action}' with parameters {params}")

        if action in ["check_stock", "check_inventory"]:
            product_name = params.get("product_name", "")
            requested_qty = int(params.get("quantity", params.get("requested_qty", 0)))
            trace.append(f"[INVENTORY] Checking stock for '{product_name}' (Requested: {requested_qty} units)...")
            result = check_stock(product_name=product_name, requested_qty=requested_qty)
            
            if result.get("found"):
                trace.append(f"[INVENTORY] Found '{result['product_name']}'. Current warehouse stock: {result['current_stock']} units.")
                if requested_qty > 0:
                    trace.append(f"[INVENTORY] Calculated shortage: {result['shortage']} units.")
            else:
                trace.append(f"[INVENTORY] Warning: Product '{product_name}' not found in catalog.")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if result.get("found") else "NOT_FOUND",
                "data": result,
                "trace": trace
            }

        elif action in ["get_inventory", "list_stock"]:
            trace.append("[INVENTORY] Fetching complete warehouse catalog...")
            inventory = get_inventory()
            trace.append(f"[INVENTORY] Retrieved {len(inventory)} product lines.")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": {"inventory": inventory, "total_products": len(inventory)},
                "trace": trace
            }

        elif action in ["get_low_stock", "reorder_suggestions"]:
            trace.append("[INVENTORY] Scanning warehouse for low-stock and out-of-stock items...")
            low_stock = get_low_stock_products()
            trace.append(f"[INVENTORY] Identified {len(low_stock)} items at or below reorder threshold.")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS",
                "data": {"low_stock_products": low_stock, "count": len(low_stock)},
                "trace": trace
            }

        elif action in ["search_suppliers", "find_suppliers"]:
            product_name = params.get("product_name", "")
            qty = int(params.get("quantity", 1))
            sort_by = params.get("sort_by", "price")
            trace.append(f"[INVENTORY] Searching suppliers for '{product_name}' (Qty: {qty}, Sort: {sort_by})...")
            suppliers = search_suppliers(product_name=product_name, required_qty=qty, sort_by=sort_by)
            trace.append(f"[INVENTORY] Discovered {len(suppliers)} verified supplier options.")
            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if suppliers else "NOT_FOUND",
                "data": {"product_name": product_name, "suppliers": suppliers, "count": len(suppliers)},
                "trace": trace
            }

        elif action in ["compare_suppliers", "procure_options"]:
            product_name = params.get("product_name", "")
            qty = int(params.get("quantity", 1))
            preference = params.get("preference", "cheapest")
            trace.append(f"[INVENTORY] Comparing suppliers for {qty} units of '{product_name}' (Preference: '{preference}')...")
            comparison = compare_suppliers(product_name=product_name, required_qty=qty, preference=preference)
            
            if comparison.get("found"):
                sel = comparison["selected_supplier"]
                trace.append(f"[INVENTORY] {comparison['total_suppliers_found']} options evaluated across IndiaMART & direct database.")
                trace.append(f"[INVENTORY] Selected: '{sel['name']}' @ ₹{sel['unit_price']:,.2f}/unit (Lead Time: {sel['delivery_days']} days, Location: {sel['location']}).")
            else:
                trace.append(f"[INVENTORY] No suppliers found for '{product_name}'.")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if comparison.get("found") else "NOT_FOUND",
                "data": comparison,
                "trace": trace
            }

        elif action in ["create_purchase_order", "create_po"]:
            supplier_id = int(params.get("supplier_id", 1))
            product_name = params.get("product_name", "")
            quantity = int(params.get("quantity", 1))
            unit_price = float(params.get("unit_price", 0.0))
            terms = params.get("terms", "Standard Commercial PO")

            trace.append(f"[INVENTORY] Generating formal Purchase Order for {quantity} units of '{product_name}'...")
            po_res = create_purchase_order(
                supplier_id=supplier_id,
                product_name=product_name,
                quantity=quantity,
                unit_price=unit_price,
                terms=terms
            )
            if po_res.get("success"):
                trace.append(f"[INVENTORY] Purchase Order #{po_res['po_number']} created successfully (Total: ₹{po_res['total_amount']:,.2f}).")
            else:
                trace.append(f"[INVENTORY] PO creation error: {po_res.get('error')}")

            return {
                "agent": self.name,
                "action": action,
                "status": "SUCCESS" if po_res.get("success") else "ERROR",
                "data": po_res,
                "trace": trace
            }

        else:
            return {
                "agent": self.name,
                "action": action,
                "status": "UNKNOWN_ACTION",
                "data": {"error": f"Action '{action}' is not supported by Inventory Agent."},
                "trace": trace
            }
