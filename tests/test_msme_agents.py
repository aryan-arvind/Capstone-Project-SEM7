import pytest
from src.tools.finance_tools import (
    calculate_gst,
    calculate_discount,
    calculate_profit,
    calculate_margin,
    calculate_selling_price_from_margin
)
from src.tools.inventory_tools import check_stock, calculate_stock_shortage
from src.tools.supplier_tools import compare_suppliers
from src.agents.orchestrator import MultiAgentOrchestrator

def test_calculate_gst():
    res = calculate_gst(100000.0, 18.0)
    assert res["taxable_amount"] == 100000.0
    assert res["gst_rate"] == 18.0
    assert res["gst_amount"] == 18000.0
    assert res["total_amount"] == 118000.0

def test_calculate_discount():
    res = calculate_discount(50000.0, 10.0)
    assert res["discount_amount"] == 5000.0
    assert res["discounted_amount"] == 45000.0

def test_calculate_profit():
    res = calculate_profit(cost_price=3200.0, selling_price=3840.0, quantity=100)
    assert res["unit_profit"] == 640.0
    assert res["total_cost"] == 320000.0
    assert res["total_revenue"] == 384000.0
    assert res["total_profit"] == 64000.0
    assert res["is_profitable"] is True

def test_calculate_margin():
    res = calculate_margin(cost_price=3200.0, selling_price=4000.0)
    assert res["markup_pct"] == 25.0
    assert res["margin_pct"] == 20.0

def test_main_quotation_financial_calculation():
    """
    Validates exact prompt specification:
    Supplier price = ₹3,200
    Quantity = 100
    Purchase Cost = ₹3,20,000
    Desired Margin = 20%
    Selling Price = ₹3,84,000
    GST (18%) = ₹69,120
    Final Amount = ₹4,53,120
    """
    res = calculate_selling_price_from_margin(
        unit_cost=3200.0,
        margin_pct=20.0,
        quantity=100,
        gst_rate=18.0,
        discount_pct=0.0
    )
    assert res["purchase_cost"] == 320000.0
    assert res["unit_selling_price"] == 3840.0
    assert res["subtotal"] == 384000.0
    assert res["taxable_amount"] == 384000.0
    assert res["gst_amount"] == 69120.0
    assert res["final_amount"] == 453120.0
    assert res["gross_profit"] == 64000.0

def test_stock_shortage():
    res = check_stock("Office Chair", 100)
    assert res["found"] is True
    assert res["current_stock"] == 35
    assert res["requested_quantity"] == 100
    assert res["shortage"] == 65
    assert res["needs_procurement"] is True

def test_supplier_comparison():
    res = compare_suppliers("Office Chair", 100, "cheapest")
    assert res["found"] is True
    assert res["total_suppliers_found"] >= 2
    assert res["selected_supplier"]["unit_price"] <= 3200.0

def test_orchestrator_main_demo_pipeline():
    orchestrator = MultiAgentOrchestrator()
    prompt = "A customer wants 100 office chairs. Check our stock, find supplier options if necessary, compare them, calculate the selling price with a 20% margin and applicable GST, and prepare a quotation."
    
    response = orchestrator.process_request(prompt)
    assert response["workflow"] == "FULL_QUOTATION_WORKFLOW"
    assert "Inventory Agent" in response["required_agents"]
    assert "Finance Agent" in response["required_agents"]
    assert "Verification Agent" in response["required_agents"]
    
    assert response["verification"] is not None
    assert response["verification"]["status"] == "VERIFIED"
    assert response["verification"]["is_valid"] is True
    
    assert response["quotation"] is not None
    assert response["quotation"]["quantity"] == 100
    assert response["quotation"]["purchase_cost"] >= 295000.0
    assert response["quotation"]["final_amount"] > 0
