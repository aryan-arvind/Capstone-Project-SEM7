import re
import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from src.agents.inventory_agent import InventoryProcurementAgent
from src.agents.finance_agent import FinanceAgent
from src.agents.verification_agent import VerificationAgent
from src.tools.inventory_tools import get_product
from src.tools.customer_tools import get_or_create_customer_context
from src.tools.market_search import search_live_market_prices
from src.tools.pdf_generator import generate_quotation_pdf
from src.database.connection import SessionLocal
from src.models.db_models import Quotation, Customer

logger = logging.getLogger(__name__)

class MultiAgentOrchestrator:
    """
    Enterprise Multi-Agent Orchestrator.
    Autonomously resolves business context, coordinates departmental agents,
    grounds decisions in real customer credit data and live IndiaMART wholesale benchmarks.
    """

    def __init__(self):
        self.inventory_agent = InventoryProcurementAgent()
        self.finance_agent = FinanceAgent()
        self.verification_agent = VerificationAgent()

    def parse_intent(self, query: str) -> Dict[str, Any]:
        """
        Extracts business operation intent, customer profile, quantities,
        and pricing margins from natural language request or complex problem statements.
        """
        clean_text = query.replace("*", "").replace(">", "").strip()
        q = clean_text.lower()

        # 1. Extract quantity
        qty_match = re.search(r'(\d+)\s*(?:units?|pcs?|pieces?|chairs?|stands?|items?|printers?|keyboards?|mice|desks?|bulbs?)?', q)
        quantity = int(qty_match.group(1)) if qty_match else None

        # 2. Extract margin
        margin_match = re.search(r'(\d+(?:\.\d+)?)\s*%\s*(?:profit\s+)?(?:margin|markup)?', q)
        margin_pct = float(margin_match.group(1)) if margin_match else 20.0

        # 3. Extract product candidate
        known_products = [
            "office chair", "laptop stand", "laser printer", "printer",
            "executive desk", "desk", "led high bay", "led bulb", "bulb",
            "notebook", "mechanical keyboard", "keyboard", "optical mouse", "mouse"
        ]
        detected_product = None
        for kp in known_products:
            if kp in q:
                detected_product = kp.title()
                break

        # 4. Extract customer candidate
        detected_customer = None
        cust_match = re.search(r'(?:customer|client|for)\s*,?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)', clean_text)
        if cust_match:
            detected_customer = cust_match.group(1).strip()
        
        if not detected_customer:
            known_customers = [
                "sharma infotech", "apex logistics", "reliable engineering",
                "greenfield retailers", "vikas tech park", "rahul sharma"
            ]
            for kc in known_customers:
                if kc in q:
                    detected_customer = kc.title()
                    break

        # 5. Classify workflow type
        if ("quotation" in q or "quote" in q or "prepare a quotation" in q or "procurement" in q) or \
           ("wants" in q and ("margin" in q or "supplier" in q or "quotation" in q)) or \
           ("compare" in q and "margin" in q):
            workflow_type = "FULL_QUOTATION_WORKFLOW"
            required_agents = ["Inventory Agent", "Finance Agent", "Verification Agent"]
        elif "supplier" in q or "suppliers" in q or "vendor" in q or "procure" in q or "market" in q:
            workflow_type = "SUPPLIER_SEARCH"
            required_agents = ["Inventory Agent"]
        elif "stock" in q or "inventory" in q or "how many" in q or "available" in q or "reorder" in q:
            workflow_type = "INVENTORY_ONLY"
            required_agents = ["Inventory Agent"]
        elif "owe" in q or "overdue" in q or "outstanding" in q or "payment" in q or "invoice" in q or "gst" in q or "profit" in q or "revenue" in q:
            workflow_type = "FINANCE_ONLY"
            required_agents = ["Finance Agent"]
        else:
            workflow_type = "GENERAL_ASSISTANT"
            required_agents = ["Inventory Agent", "Finance Agent"]

        return {
            "query": query,
            "workflow_type": workflow_type,
            "required_agents": required_agents,
            "product_name": detected_product or "Office Chair",
            "quantity": quantity or (100 if "chair" in q else 1),
            "margin_pct": margin_pct,
            "customer_name": detected_customer or "Rahul Sharma",
            "preference": "fastest" if "fast" in q or "speed" in q else ("cheapest" if "cheap" in q else "balanced")
        }

    def process_request(self, user_query: str) -> Dict[str, Any]:
        """
        Executes business operations with full customer context, live market sourcing,
        departmental task routing, and independent verification.
        """
        intent = self.parse_intent(user_query)
        workflow = intent["workflow_type"]
        
        execution_logs: List[str] = []
        execution_logs.append(f"[ORCHESTRATOR] Received request: \"{user_query}\"")
        execution_logs.append(f"[ORCHESTRATOR] Route: {workflow} | Agents: {', '.join(intent['required_agents'])}")

        final_response: Dict[str, Any] = {
            "query": user_query,
            "workflow": workflow,
            "required_agents": intent["required_agents"],
            "customer_context": None,
            "market_benchmark": None,
            "agent_results": {},
            "verification": None,
            "quotation": None,
            "summary_text": "",
            "execution_logs": execution_logs
        }

        # ── ROUTE 1: INVENTORY ONLY ──────────────────────────────────────────
        if workflow == "INVENTORY_ONLY":
            if "low" in user_query.lower() or "reorder" in user_query.lower():
                inv_res = self.inventory_agent.execute("get_low_stock", {})
                execution_logs.extend(inv_res["trace"])
                final_response["agent_results"]["inventory"] = inv_res["data"]
                
                low_items = inv_res["data"].get("low_stock_products", [])
                if low_items:
                    lines = [f"• **{i['name']}**: {i['stock_quantity']} units in stock (Threshold: {i['reorder_level']}, Recommended Batch: {i['suggested_reorder_qty']} units)" for i in low_items]
                    final_response["summary_text"] = f"**Inventory Status:** {len(low_items)} products currently require replenishment:\n\n" + "\n".join(lines)
                else:
                    final_response["summary_text"] = "All inventory stock levels are healthy. No replenishment needed."

            else:
                prod_name = intent["product_name"]
                qty = intent["quantity"]
                inv_res = self.inventory_agent.execute("check_stock", {"product_name": prod_name, "quantity": qty})
                execution_logs.extend(inv_res["trace"])
                final_response["agent_results"]["inventory"] = inv_res["data"]
                
                data = inv_res["data"]
                if data.get("found"):
                    final_response["summary_text"] = (
                        f"**Warehouse Stock Check for '{data['product_name']}':**\n"
                        f"• Available Stock: **{data['current_stock']} units**\n"
                        f"• Requested Quantity: **{qty} units**\n"
                        f"• Status: **{'Sufficient stock available' if data['is_sufficient'] else f'Shortage of {data['shortage']} units (Procurement required)'}**"
                    )
                else:
                    final_response["summary_text"] = f"Product '{prod_name}' not found in catalog."

        # ── ROUTE 2: FINANCE ONLY ────────────────────────────────────────────
        elif workflow == "FINANCE_ONLY":
            q_lower = user_query.lower()
            if "overdue" in q_lower or "due" in q_lower or "owe" in q_lower or "outstanding" in q_lower:
                fin_res = self.finance_agent.execute("get_outstanding", {})
                execution_logs.extend(fin_res["trace"])
                final_response["agent_results"]["finance"] = fin_res["data"]

                data = fin_res["data"]
                if "overdue" in q_lower:
                    overdue = data.get("overdue_invoices", [])
                    if overdue:
                        lines = [f"• **{i['customer_name']}** (Invoice #{i['invoice_id']}): **₹{i['outstanding_amount']:,.2f}** overdue since {i['due_date']}" for i in overdue]
                        final_response["summary_text"] = f"**Accounts Receivable Audit:** {len(overdue)} overdue invoices pending totaling **₹{data['total_overdue_amount']:,.2f}**:\n\n" + "\n".join(lines)
                    else:
                        final_response["summary_text"] = "All customer accounts are current. Zero overdue invoices."
                else:
                    final_response["summary_text"] = (
                        f"**Accounts Receivable Summary:**\n"
                        f"• Total Outstanding: **₹{data['total_outstanding_amount']:,.2f}** across {data['total_unpaid_invoices_count']} invoices\n"
                        f"• Overdue Amount: **₹{data['total_overdue_amount']:,.2f}** ({data['overdue_invoices_count']} overdue invoices)"
                    )
            else:
                fin_res = self.finance_agent.execute("get_outstanding", {})
                execution_logs.extend(fin_res["trace"])
                final_response["agent_results"]["finance"] = fin_res["data"]
                final_response["summary_text"] = fin_res["data"].get("summary_message", "Ledger records retrieved.")

        # ── ROUTE 3: SUPPLIER SEARCH & MARKET BENCHMARK ───────────────────────
        elif workflow == "SUPPLIER_SEARCH":
            prod_name = intent["product_name"]
            qty = intent["quantity"]
            pref = intent["preference"]

            # Query real market wholesale benchmarks
            market_data = search_live_market_prices(prod_name, required_qty=qty)
            final_response["market_benchmark"] = market_data

            inv_res = self.inventory_agent.execute("compare_suppliers", {
                "product_name": prod_name,
                "quantity": qty,
                "preference": pref
            })
            execution_logs.extend(inv_res["trace"])
            final_response["agent_results"]["inventory"] = inv_res["data"]

            data = inv_res["data"]
            if data.get("found"):
                opts = data["options"]
                table_lines = ["| Supplier | Unit Price | MOQ | Available | Delivery Lead Time | Rating | Verified Source |", "|---|---|---|---|---|---|---|"]
                for o in opts:
                    table_lines.append(f"| {o['name']} | ₹{o['unit_price']:,.2f} | {o['moq']} | {o['available_quantity']} | {o['delivery_days']} days | {o['rating']}/5.0 | {o['source']} |")

                final_response["summary_text"] = (
                    f"**Wholesale Market Sourcing for {qty} units of '{prod_name}':**\n"
                    f"• Prevailing Market Benchmark: **{market_data['market_price_range']}** (Average: ₹{market_data['average_benchmark_price']:,.2f})\n\n"
                    + "\n".join(table_lines) + "\n\n"
                    f"**Procurement Recommendation:** Selected **{data['selected_supplier']['name']}** at **₹{data['selected_supplier']['unit_price']:,.2f}/unit** (Total Cost: ₹{data['total_purchase_cost']:,.2f})."
                )
            else:
                final_response["summary_text"] = f"No wholesale suppliers found for '{prod_name}'."

        # ── ROUTE 4: FULL END-TO-END PROCUREMENT & CERTIFIED QUOTATION ────────
        elif workflow == "FULL_QUOTATION_WORKFLOW":
            prod_name = intent["product_name"]
            qty = intent["quantity"]
            margin_pct = intent["margin_pct"]
            customer_name = intent["customer_name"]

            # 1. Fetch real customer CRM context
            cust_ctx = get_or_create_customer_context(customer_name)
            final_response["customer_context"] = cust_ctx
            execution_logs.append(f"[CUSTOMER CRM] Context loaded for {cust_ctx['name']} ({cust_ctx['company']}) | Credit Status: {cust_ctx['credit_rating']}")

            # 2. Inventory check
            stock_check = self.inventory_agent.execute("check_stock", {"product_name": prod_name, "quantity": qty})
            execution_logs.extend(stock_check["trace"])
            current_stock = stock_check["data"]["current_stock"]
            shortage = stock_check["data"]["shortage"]

            # 3. Live wholesale market discovery & supplier comparison
            market_data = search_live_market_prices(prod_name, required_qty=qty)
            final_response["market_benchmark"] = market_data

            supp_comp = self.inventory_agent.execute("compare_suppliers", {
                "product_name": prod_name,
                "quantity": qty,
                "preference": intent["preference"]
            })
            execution_logs.extend(supp_comp["trace"])
            selected_supp = supp_comp["data"]["selected_supplier"]
            supplier_unit_price = selected_supp["unit_price"]

            # 4. Product GST determination
            prod_info = get_product(prod_name)
            gst_rate = prod_info["gst_rate"] if prod_info else 18.0

            # 5. Deterministic financial calculations
            fin_calc = self.finance_agent.execute("calculate_quotation", {
                "unit_cost": supplier_unit_price,
                "quantity": qty,
                "margin_pct": margin_pct,
                "gst_rate": gst_rate,
                "discount_pct": 0.0
            })
            execution_logs.extend(fin_calc["trace"])
            pricing_data = fin_calc["data"]

            # 6. Independent cross-verification
            context_to_verify = {
                "product_name": prod_name,
                "quantity": qty,
                "shortage": shortage,
                "supplier_name": selected_supp["name"],
                "unit_cost": supplier_unit_price,
                "purchase_cost": pricing_data["purchase_cost"],
                "desired_margin_pct": margin_pct,
                "unit_selling_price": pricing_data["unit_selling_price"],
                "subtotal": pricing_data["subtotal"],
                "discount_amount": pricing_data["discount_amount"],
                "taxable_amount": pricing_data["taxable_amount"],
                "gst_rate": gst_rate,
                "gst_amount": pricing_data["gst_amount"],
                "final_amount": pricing_data["final_amount"]
            }
            ver_res = self.verification_agent.verify_transaction(context_to_verify)
            execution_logs.extend(ver_res["trace"])
            final_response["verification"] = ver_res

            # 7. Persist quotation & generate professional PDF
            session = SessionLocal()
            quotation_number = f"QUOT-{datetime.now().strftime('%Y%m')}-{session.query(Quotation).count() + 101}"
            
            quot_dict = {
                "quotation_number": quotation_number,
                "customer_name": cust_ctx["name"],
                "customer_company": cust_ctx["company"],
                "customer_address": cust_ctx["address"],
                "customer_gstin": cust_ctx["gstin"],
                "product_name": prod_name,
                "quantity": qty,
                "unit_cost": supplier_unit_price,
                "desired_margin_pct": margin_pct,
                "unit_price": pricing_data["unit_selling_price"],
                "subtotal": pricing_data["subtotal"],
                "discount_pct": 0.0,
                "discount_amount": 0.0,
                "taxable_amount": pricing_data["taxable_amount"],
                "gst_rate": gst_rate,
                "gst_amount": pricing_data["gst_amount"],
                "final_amount": pricing_data["final_amount"],
                "validity_days": 15,
                "payment_terms": "Standard Net 30 Commercial Terms",
                "purchase_cost": pricing_data["purchase_cost"],
                "account_manager": cust_ctx["account_manager"]
            }

            pdf_path = generate_quotation_pdf(quot_dict)
            quot_dict["pdf_path"] = pdf_path

            db_quot = Quotation(
                quotation_number=quotation_number,
                customer_id=cust_ctx["customer_id"],
                customer_name=cust_ctx["name"],
                product_name=prod_name,
                quantity=qty,
                unit_cost=supplier_unit_price,
                desired_margin_pct=margin_pct,
                unit_price=pricing_data["unit_selling_price"],
                subtotal=pricing_data["subtotal"],
                discount_pct=0.0,
                discount_amount=0.0,
                taxable_amount=pricing_data["taxable_amount"],
                gst_rate=gst_rate,
                gst_amount=pricing_data["gst_amount"],
                final_amount=pricing_data["final_amount"],
                validity_days=15,
                payment_terms=quot_dict["payment_terms"],
                status="ISSUED",
                pdf_path=pdf_path,
                verified_by_agent=(ver_res["status"] == "VERIFIED")
            )
            session.add(db_quot)
            session.commit()
            session.close()

            execution_logs.append(f"[ACCOUNTS] Quotation #{quotation_number} registered in ledger. PDF generated.")

            final_response["agent_results"]["inventory"] = stock_check["data"]
            final_response["agent_results"]["supplier_comparison"] = supp_comp["data"]
            final_response["agent_results"]["finance"] = pricing_data
            final_response["quotation"] = quot_dict

            # Construct clean, professional structured business response
            final_response["summary_text"] = (
                f"### Commercial Quotation #{quotation_number}\n\n"
                f"**1. Customer Profile & Credit Context:**\n"
                f"• Client: **{cust_ctx['name']}** ({cust_ctx['company']})\n"
                f"• Location: {cust_ctx['address']} | GSTIN: `{cust_ctx['gstin']}`\n"
                f"• Credit Rating: **{cust_ctx['credit_rating']}** (Limit: ₹{cust_ctx['credit_limit']:,.2f})\n\n"
                f"**2. Inventory Assessment:**\n"
                f"• Requested: **{qty} units** of **{prod_name}** | Warehouse Stock: **{current_stock} units** (Shortage: **{shortage} units**)\n\n"
                f"**3. Wholesale Procurement & Market Sourcing:**\n"
                f"• Selected Supplier: **{selected_supp['name']}** ({selected_supp['location']})\n"
                f"• Procurement Unit Price: **₹{supplier_unit_price:,.2f}** (Delivery: {selected_supp['delivery_days']} days, Rating: {selected_supp['rating']}/5.0)\n"
                f"• Total Procurement Benchmark: **₹{pricing_data['purchase_cost']:,.2f}**\n\n"
                f"**4. Commercial Pricing & Tax Breakdown:**\n"
                f"• Selling Price per Unit ({margin_pct:.0f}% Margin Markup): **₹{pricing_data['unit_selling_price']:,.2f}**\n"
                f"• Taxable Subtotal: **₹{pricing_data['taxable_amount']:,.2f}**\n"
                f"• GST ({gst_rate:.0f}% rate): **₹{pricing_data['gst_amount']:,.2f}**\n"
                f"• **Final Quotation Total: ₹{pricing_data['final_amount']:,.2f}** (Projected Gross Margin: ₹{pricing_data['gross_profit']:,.2f})\n\n"
                f"**5. Compliance & Departmental Sign-off:**\n"
                f"• Verification Audit: **{ver_res['status']}** ({ver_res['passed_checks']}/{ver_res['total_checks']} validation checks passed)\n"
                f"• Department Lead: **{cust_ctx['account_manager']}**"
            )

        else:
            final_response["summary_text"] = "Operations Assistant online. Ask for stock availability, supplier comparisons, receivables audit, or commercial quotations."

        return final_response
