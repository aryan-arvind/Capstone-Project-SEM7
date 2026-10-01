"""
Domain Tools for Finance and Inventory AI Agents.
Provides callable real-world calculation and inspection tools for agents.
"""

from typing import Dict, Any, List
import math


# ============================================================================
# FINANCE AGENT TOOLS
# ============================================================================

def tool_check_liquidity_runway(available_cash: float, daily_burn_rate: float = 1200.0) -> Dict[str, Any]:
    """
    Computes liquidity runway in days and evaluates working capital health.
    """
    runway_days = round(available_cash / max(1.0, daily_burn_rate), 1)
    if runway_days < 5.0:
        health = "CRITICAL_DEFICIT"
    elif runway_days < 15.0:
        health = "TIGHT_LIQUIDITY"
    else:
        health = "HEALTHY_LIQUIDITY"
        
    return {
        "tool_name": "tool_check_liquidity_runway",
        "available_cash": available_cash,
        "daily_burn_rate": daily_burn_rate,
        "runway_days": runway_days,
        "liquidity_health": health,
        "summary": f"Available liquid cash of ₹{available_cash:,.2f} provides {runway_days} days of operational runway ({health})."
    }


def tool_verify_statutory_tax_obligations(
    upcoming_gst_liability: float,
    due_in_days: float = 3.0,
    daily_penalty_rate_pct: float = 0.05
) -> Dict[str, Any]:
    """
    Calculates statutory compliance liabilities (GST, TDS) and estimated penalty costs if delayed.
    """
    estimated_penalty_per_day = round(upcoming_gst_liability * (daily_penalty_rate_pct / 100.0), 2)
    compliance_risk = "HIGH" if due_in_days <= 3.0 else "MEDIUM"
    
    return {
        "tool_name": "tool_verify_statutory_tax_obligations",
        "upcoming_gst_liability": upcoming_gst_liability,
        "due_in_days": due_in_days,
        "daily_penalty_inr": estimated_penalty_per_day,
        "compliance_risk": compliance_risk,
        "is_legal_mandate": True,
        "summary": f"GST statutory liability of ₹{upcoming_gst_liability:,.2f} due in {due_in_days} days. Daily delay penalty: ₹{estimated_penalty_per_day:,.2f}."
    }


def tool_simulate_cash_balance(current_cash: float, expense_amount: float, mandatory_reserve: float = 2000.0) -> Dict[str, Any]:
    """
    Simulates the post-transaction balance and checks if it breaches mandatory payroll/operating reserves.
    """
    remaining = current_cash - expense_amount
    buffer = remaining - mandatory_reserve
    breach = buffer < 0
    
    return {
        "tool_name": "tool_simulate_cash_balance",
        "current_cash": current_cash,
        "expense_amount": expense_amount,
        "post_expense_cash": round(remaining, 2),
        "mandatory_reserve": mandatory_reserve,
        "reserve_buffer": round(buffer, 2),
        "breaches_safety_reserve": breach,
        "summary": f"Post-expense balance: ₹{remaining:,.2f}. Mandatory reserve buffer: ₹{buffer:,.2f} (Reserve Breach: {breach})."
    }


# ============================================================================
# INVENTORY AGENT TOOLS
# ============================================================================

def tool_calculate_stockout_risk(
    sku_name: str,
    current_stock: float,
    daily_sales_velocity: float,
    lead_time_days: float,
    unit_sale_price: float,
    unit_cost: float
) -> Dict[str, Any]:
    """
    Evaluates stockout probability and calculates estimated revenue loss from stockout during supplier lead time.
    """
    days_to_stockout = round(current_stock / max(0.1, daily_sales_velocity), 1)
    lead_time_demand = daily_sales_velocity * lead_time_days
    stock_deficit = max(0.0, lead_time_demand - current_stock)
    
    # Stockout probability curve
    if stock_deficit > 0:
        stockout_prob = min(0.98, 0.60 + (stock_deficit / max(1.0, lead_time_demand)) * 0.38)
    else:
        stockout_prob = max(0.05, 0.50 - (current_stock / max(1.0, lead_time_demand * 2.0)) * 0.45)
        
    estimated_lost_revenue = round(stock_deficit * unit_sale_price, 2)
    profit_margin_loss = round(stock_deficit * (unit_sale_price - unit_cost), 2)
    
    return {
        "tool_name": "tool_calculate_stockout_risk",
        "sku_name": sku_name,
        "current_stock": current_stock,
        "daily_velocity": daily_sales_velocity,
        "days_to_stockout": days_to_stockout,
        "lead_time_days": lead_time_days,
        "stockout_probability": round(stockout_prob, 2),
        "estimated_lost_revenue_inr": estimated_lost_revenue,
        "profit_margin_loss_inr": profit_margin_loss,
        "summary": f"SKU '{sku_name}' will stock out in {days_to_stockout} days (Lead time: {lead_time_days} days). Stockout risk: {stockout_prob*100:.0f}%, Lost Revenue: ₹{estimated_lost_revenue:,.2f}."
    }


def tool_fetch_supplier_procurement_batch(
    sku_name: str,
    reorder_quantity: float,
    unit_cost: float,
    festival_surge_pct: float = 0.0,
    bulk_discount_threshold: float = 100.0,
    bulk_discount_pct: float = 10.0
) -> Dict[str, Any]:
    """
    Fetches wholesale supplier quotation with surge-adjusted order quantities and volume discounts.
    """
    adjusted_qty = reorder_quantity * (1.0 + (festival_surge_pct / 100.0))
    raw_cost = adjusted_qty * unit_cost
    
    discount_applied = 0.0
    if adjusted_qty >= bulk_discount_threshold:
        discount_applied = raw_cost * (bulk_discount_pct / 100.0)
        
    final_required_cash = round(raw_cost - discount_applied, 2)
    
    return {
        "tool_name": "tool_fetch_supplier_procurement_batch",
        "sku_name": sku_name,
        "recommended_reorder_qty": round(adjusted_qty, 0),
        "unit_cost": unit_cost,
        "festival_surge_pct": festival_surge_pct,
        "raw_cost_inr": round(raw_cost, 2),
        "discount_applied_inr": round(discount_applied, 2),
        "final_required_cash_inr": final_required_cash,
        "summary": f"Supplier quote for {adjusted_qty:.0f} units of '{sku_name}' (Surge: +{festival_surge_pct}%): Total ₹{final_required_cash:,.2f} (Savings: ₹{discount_applied:,.2f})."
    }


def tool_calculate_split_batch_option(
    sku_name: str,
    original_reorder_qty: float,
    unit_cost: float,
    emergency_split_ratio: float = 0.5
) -> Dict[str, Any]:
    """
    Calculates a minimum viable emergency restock batch to conserve cash during liquidity crunches.
    """
    split_qty = math.ceil(original_reorder_qty * emergency_split_ratio)
    split_cost = round(split_qty * unit_cost, 2)
    
    return {
        "tool_name": "tool_calculate_split_batch_option",
        "sku_name": sku_name,
        "emergency_batch_qty": split_qty,
        "emergency_batch_cost_inr": split_cost,
        "cash_saved_inr": round((original_reorder_qty - split_qty) * unit_cost, 2),
        "summary": f"Emergency 50% split batch for '{sku_name}': {split_qty} units at ₹{split_cost:,.2f} (Saves ₹{(original_reorder_qty - split_qty) * unit_cost:,.2f} liquidity)."
    }
