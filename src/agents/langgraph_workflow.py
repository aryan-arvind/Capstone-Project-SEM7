"""
Production LangGraph Multi-Agent Workflow for MSME Operations & Arbitration.
Built using LangGraph StateGraph, conditional edges, and Gemini 3.8 Flash.
"""

import time
import uuid
import re
from typing import TypedDict, Dict, Any, List, Optional, Literal
from langgraph.graph import StateGraph, START, END

from src.schemas import SystemState, Recommendation, AgentType, ExecutionTier
from src.agents.ai_agent_runtime import (
    FinanceAIAgent,
    InventoryAIAgent,
    AIAgentExecutionTrace,
    call_llm_if_available
)
from src.arbitration import ArbitrationEngine


class MSMEAgentState(TypedDict):
    # Business Inputs & Constraints
    natural_language_event: str
    available_cash: float
    time_window_days: float
    upcoming_gst_liability: float
    gst_due_days: float
    upcoming_payroll_reserve: float
    sku_name: str
    current_stock: float
    daily_sales_velocity: float
    supplier_lead_time_days: float
    unit_sale_price: float
    unit_cost: float
    festival_surge_pct: float
    base_reorder_qty: float

    # Multi-Agent State Outputs
    finance_trace: Dict[str, Any]
    inventory_trace: Dict[str, Any]
    recommendations: List[Dict[str, Any]]
    inter_agent_messages: List[Dict[str, Any]]
    conflict_diagnosis: Dict[str, Any]
    arbitration_result: Dict[str, Any]
    alternative_tradeoffs: List[Dict[str, Any]]
    execution_tier: str
    simulation_id: str
    timestamp: float
    status: str


def parse_natural_language_prompt(state: MSMEAgentState) -> Dict[str, Any]:
    """
    Parses natural language prompts to extract dynamic numbers (e.g. GST notice 10000, cash 25000).
    """
    prompt = state.get("natural_language_event", "")
    updates = {}

    if prompt and len(prompt) > 4:
        # Regex check for GST / Tax amount
        gst_match = re.search(r'(?:gst|tax|notice|demand)[\D]*?([\d,]+)', prompt, re.IGNORECASE)
        if gst_match:
            try:
                val = float(gst_match.group(1).replace(',', ''))
                if val > 100:
                    updates["upcoming_gst_liability"] = val
            except Exception:
                pass

        # Regex check for Cash amount
        cash_match = re.search(r'(?:cash|liquidity|balance|capital)[\D]*?([\d,]+)', prompt, re.IGNORECASE)
        if cash_match:
            try:
                val = float(cash_match.group(1).replace(',', ''))
                if val > 100:
                    updates["available_cash"] = val
            except Exception:
                pass

        # Regex check for Surge %
        surge_match = re.search(r'(?:surge|demand|festival|increase)[\D]*?([\d]+)\s*%', prompt, re.IGNORECASE)
        if surge_match:
            try:
                val = float(surge_match.group(1))
                updates["festival_surge_pct"] = val
            except Exception:
                pass

    return updates


# ============================================================================
# LANGGRAPH NODE IMPLEMENTATIONS
# ============================================================================

def finance_agent_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 1: Executes Finance Solvency Intelligence Agent (Gemini 3.8 Flash).
    """
    # Parse any prompt updates
    updates = parse_natural_language_prompt(state)
    active_cash = updates.get("available_cash", state["available_cash"])
    active_gst = updates.get("upcoming_gst_liability", state["upcoming_gst_liability"])

    agent = FinanceAIAgent()
    sys_state = SystemState(
        available_cash=active_cash,
        time_window_days=state["time_window_days"]
    )
    context = {
        "daily_burn_rate": 1500.0,
        "upcoming_gst_liability": active_gst,
        "gst_due_days": state["gst_due_days"],
        "upcoming_payroll_reserve": state["upcoming_payroll_reserve"],
        "event_prompt": state["natural_language_event"]
    }
    trace = agent.run(sys_state, context)

    rec_dict = None
    if trace.final_recommendation:
        r = trace.final_recommendation
        rec_dict = {
            "recommendation_id": r.recommendation_id,
            "agent_type": r.agent_type.value,
            "title": r.title,
            "description": r.description,
            "required_cash": r.required_cash,
            "urgency_score": r.urgency_score,
            "expected_roi_or_impact": r.expected_roi_or_impact,
            "risk_score": r.risk_score,
            "deadline_days": r.deadline_days,
            "metadata": r.metadata,
            "mcdm_priority_score": 0.0
        }

    trace_dict = {
        "agent_id": trace.agent_id,
        "agent_name": trace.agent_name,
        "agent_type": trace.agent_type,
        "role": trace.role,
        "goal": trace.goal,
        "thoughts": trace.thoughts,
        "tool_calls": [
            {
                "tool_name": tc.tool_name,
                "arguments": tc.arguments,
                "output": tc.output,
                "timestamp": tc.timestamp
            }
            for tc in trace.tool_calls
        ],
        "execution_time_ms": trace.execution_time_ms,
        "model_used": trace.model_used
    }

    t_now = time.strftime("%H:%M:%S")
    msg = {
        "message_id": f"MSG-FIN-{uuid.uuid4().hex[:6].upper()}",
        "timestamp_str": t_now,
        "sender_agent": "Finance-Solvency-Agent (AGT-FIN-01)",
        "receiver_agent": "Arbitration-Engine (AGT-ARB-01)",
        "message_type": "STATUTORY_CLAIM",
        "content": f"STATUTORY PRIORITY: Remit INR {active_gst:,.2f} GST liability due in {state['gst_due_days']:.0f} days to prevent CGST Section 50 daily penalty compounding.",
        "payload": {"required_cash": active_gst, "due_days": state["gst_due_days"]}
    }

    recs = [rec_dict] if rec_dict else []
    msgs = [msg]

    ret_dict = {
        "finance_trace": trace_dict,
        "recommendations": recs,
        "inter_agent_messages": msgs,
        "upcoming_gst_liability": active_gst,
        "available_cash": active_cash
    }
    return ret_dict


def inventory_agent_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 2: Executes Supply Chain Intelligence Agent (Gemini 3.8 Flash).
    """
    updates = parse_natural_language_prompt(state)
    active_surge = updates.get("festival_surge_pct", state["festival_surge_pct"])
    active_cash = state.get("available_cash", state["available_cash"])

    agent = InventoryAIAgent()
    sys_state = SystemState(
        available_cash=active_cash,
        time_window_days=state["time_window_days"]
    )
    context = {
        "sku_name": state["sku_name"],
        "current_stock": state["current_stock"],
        "daily_sales_velocity": state["daily_sales_velocity"],
        "supplier_lead_time_days": state["supplier_lead_time_days"],
        "unit_sale_price": state["unit_sale_price"],
        "unit_cost": state["unit_cost"],
        "festival_surge_pct": active_surge,
        "base_reorder_qty": state["base_reorder_qty"],
        "event_prompt": state["natural_language_event"]
    }
    trace = agent.run(sys_state, context)

    rec_dict = None
    if trace.final_recommendation:
        r = trace.final_recommendation
        rec_dict = {
            "recommendation_id": r.recommendation_id,
            "agent_type": r.agent_type.value,
            "title": r.title,
            "description": r.description,
            "required_cash": r.required_cash,
            "urgency_score": r.urgency_score,
            "expected_roi_or_impact": r.expected_roi_or_impact,
            "risk_score": r.risk_score,
            "deadline_days": r.deadline_days,
            "metadata": r.metadata,
            "mcdm_priority_score": 0.0
        }

    trace_dict = {
        "agent_id": trace.agent_id,
        "agent_name": trace.agent_name,
        "agent_type": trace.agent_type,
        "role": trace.role,
        "goal": trace.goal,
        "thoughts": trace.thoughts,
        "tool_calls": [
            {
                "tool_name": tc.tool_name,
                "arguments": tc.arguments,
                "output": tc.output,
                "timestamp": tc.timestamp
            }
            for tc in trace.tool_calls
        ],
        "execution_time_ms": trace.execution_time_ms,
        "model_used": trace.model_used
    }

    t_now = time.strftime("%H:%M:%S")
    demanded = rec_dict["required_cash"] if rec_dict else 0.0
    msg = {
        "message_id": f"MSG-INV-{uuid.uuid4().hex[:6].upper()}",
        "timestamp_str": t_now,
        "sender_agent": "Inventory-Logistics-Agent (AGT-INV-02)",
        "receiver_agent": "Arbitration-Engine (AGT-ARB-01)",
        "message_type": "RESTOCK_PROPOSAL",
        "content": f"RESTOCK BID: Procure batch of {state['sku_name']}. Demanded Capital: INR {demanded:,.2f} to protect against stockout risk.",
        "payload": {"required_cash": demanded}
    }

    recs = state.get("recommendations", [])
    if rec_dict:
        recs = recs + [rec_dict]

    msgs = state.get("inter_agent_messages", []) + [msg]

    return {
        "inventory_trace": trace_dict,
        "recommendations": recs,
        "inter_agent_messages": msgs,
        "festival_surge_pct": active_surge
    }


def conflict_diagnosis_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 3: Detects liquidity deficit between aggregate proposals and working capital.
    """
    recs = state.get("recommendations", [])
    total_demanded = sum(r.get("required_cash", 0.0) for r in recs)
    available = state["available_cash"]
    deficit = max(0.0, total_demanded - available)
    has_conflict = deficit > 0.0

    if has_conflict:
        summary = f"🚨 RESOURCE CONFLICT DETECTED: Total capital demanded by Finance & Inventory agents (INR {total_demanded:,.2f}) exceeds available liquid working capital (INR {available:,.2f}) by a deficit of INR {deficit:,.2f}."
    else:
        summary = f"✅ SUFFICIENT LIQUIDITY: Total demanded capital (INR {total_demanded:,.2f}) is fully covered by available liquid cash (INR {available:,.2f})."

    diag = {
        "has_conflict": has_conflict,
        "available_cash": available,
        "total_demanded_cash": total_demanded,
        "deficit_amount": deficit,
        "conflict_summary": summary
    }

    return {"conflict_diagnosis": diag}


def mcdm_arbitration_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 4: Executes MCDM Knapsack Priority Scoring and determines Execution Tier.
    Formula: P = 0.45*Urgency + 0.35*Impact + 0.20*(1 - Risk)
    """
    arbitrator = ArbitrationEngine()
    recs_raw = state.get("recommendations", [])

    rec_objs: List[Recommendation] = []
    for r in recs_raw:
        rec_objs.append(Recommendation(
            recommendation_id=r["recommendation_id"],
            agent_type=AgentType(r["agent_type"]),
            title=r["title"],
            description=r["description"],
            required_cash=r["required_cash"],
            urgency_score=r["urgency_score"],
            expected_roi_or_impact=r["expected_roi_or_impact"],
            risk_score=r["risk_score"],
            deadline_days=r["deadline_days"],
            metadata=r.get("metadata", {})
        ))

    sys_state = SystemState(
        available_cash=state["available_cash"],
        time_window_days=state["time_window_days"]
    )
    result = arbitrator.arbitrate(rec_objs, sys_state)

    # Force Tier 3 ESCALATE if there is ANY deficit
    diag = state.get("conflict_diagnosis", {})
    if diag.get("has_conflict", False) or diag.get("deficit_amount", 0) > 0:
        execution_tier_str = "ESCALATE"
    else:
        execution_tier_str = result.execution_tier.value

    updated_recs = []
    for r in recs_raw:
        score = result.priority_scores.get(r["recommendation_id"], 0.0)
        r_copy = dict(r)
        r_copy["mcdm_priority_score"] = score
        updated_recs.append(r_copy)

    arb_dict = {
        "arbitration_id": result.arbitration_id,
        "approved_recommendations": [r.recommendation_id for r in result.approved_recommendations],
        "rejected_recommendations": [r.recommendation_id for r in result.rejected_recommendations],
        "total_cash_allocated": result.total_cash_allocated,
        "remaining_cash": result.remaining_cash,
        "execution_tier": execution_tier_str,
        "decision_rationale": result.decision_rationale,
        "priority_scores": result.priority_scores
    }

    t_now = time.strftime("%H:%M:%S")
    msg = {
        "message_id": f"MSG-ARB-{uuid.uuid4().hex[:6].upper()}",
        "timestamp_str": t_now,
        "sender_agent": "Arbitration-Engine (AGT-ARB-01)",
        "receiver_agent": "Broadcast-All-Agents",
        "message_type": "DIRECTIVE",
        "content": f"ARBITRATION RESULT: {result.decision_rationale} Routing to {execution_tier_str}.",
        "payload": {"allocated": result.total_cash_allocated, "tier": execution_tier_str}
    }

    msgs = state.get("inter_agent_messages", []) + [msg]

    return {
        "recommendations": updated_recs,
        "arbitration_result": arb_dict,
        "execution_tier": execution_tier_str,
        "inter_agent_messages": msgs
    }


def human_escalation_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 5: Generates ranked Pareto trade-off options for Owner Sign-off.
    """
    gst_amt = state.get("upcoming_gst_liability", 20000.0)
    avail = state.get("available_cash", 40000.0)
    unit_cost = state.get("unit_cost", 900.0)
    base_qty = state.get("base_reorder_qty", 50.0)
    surge = state.get("festival_surge_pct", 25.0)

    # Reorder quantity with surge
    adjusted_qty = round(base_qty * (1.0 + (surge / 100.0)), 0)
    full_inv_cost = round(adjusted_qty * unit_cost, 2)
    split_qty = round(adjusted_qty * 0.5, 0)
    split_inv_cost = round(split_qty * unit_cost, 2)
    combo_cost = round(gst_amt + split_inv_cost, 2)
    remaining_after_combo = max(0.0, avail - combo_cost)

    tradeoffs = [
        {
            "option_id": "OPT-A",
            "name": f"Option A (AI Recommended): Prioritize GST Compliance (INR {gst_amt:,.2f}) + Defer Restock",
            "description": f"Pay full INR {gst_amt:,.2f} GST immediately to eliminate legal penalty. Defer inventory restocking. Remaining cash buffer: INR {max(0.0, avail - gst_amt):,.2f}.",
            "cash_required": gst_amt,
            "pros": ["Zero statutory tax penalties / compounding interest", "Preserves GSTIN validity", f"Maintains INR {max(0.0, avail - gst_amt):,.2f} liquid reserve"],
            "cons": ["Stockout risk remains for high-velocity SKU in 2-3 days"],
            "recommended": True
        },
        {
            "option_id": "OPT-B",
            "name": f"Option B: Settle GST (INR {gst_amt:,.2f}) + Order Emergency 50% Split Batch ({split_qty:.0f} units @ INR {split_inv_cost:,.2f})",
            "description": f"Pay INR {gst_amt:,.2f} GST + Order {split_qty:.0f} units bridge stock (INR {split_inv_cost:,.2f}). Total Capital: INR {combo_cost:,.2f}. Remaining liquidity: INR {remaining_after_combo:,.2f}.",
            "cash_required": combo_cost,
            "pros": ["100% tax statutory compliance", "Prevents stockout by providing bridge inventory", f"Fits within INR {avail:,.2f} liquidity limit (Leaves INR {remaining_after_combo:,.2f})"],
            "cons": ["Forfeits bulk discount tier on supplier order"],
            "recommended": False
        },
        {
            "option_id": "OPT-C",
            "name": f"Option C: Restock Full Inventory Batch ({adjusted_qty:.0f} units @ INR {full_inv_cost:,.2f}) + Delay GST",
            "description": f"Allocate full INR {full_inv_cost:,.2f} to inventory restocking. Delay GST tax payment by 7 days.",
            "cash_required": full_inv_cost,
            "pros": ["Maximizes festival sales revenue and customer fulfillment"],
            "cons": ["Incurs compounding daily GST penalty notices under Section 50"],
            "recommended": False
        }
    ]
    return {"alternative_tradeoffs": tradeoffs, "status": "ESCALATED_TO_OWNER"}


def auto_execution_node(state: MSMEAgentState) -> Dict[str, Any]:
    """
    LangGraph Node 6: Confirms autonomous execution for low-risk, unconstrained operations.
    """
    total_req = sum(r.get("required_cash", 0.0) for r in state.get("recommendations", []))
    tradeoffs = [
        {
            "option_id": "OPT-FULL",
            "name": "Standard Autonomous Multi-Agent Clearance",
            "description": "Execute both Finance statutory remittance and Inventory reorder simultaneously.",
            "cash_required": total_req,
            "pros": ["Complete tax compliance + full inventory coverage", "Zero liquidity deficit"],
            "cons": ["Standard operational cash outflow"],
            "recommended": True
        }
    ]
    return {"alternative_tradeoffs": tradeoffs, "status": "AUTO_EXECUTED"}


def route_decision_tier(state: MSMEAgentState) -> Literal["human_escalation", "auto_execution"]:
    """
    LangGraph Conditional Edge: Strictly routes to human escalation if any liquidity deficit or high risk exists.
    """
    diag = state.get("conflict_diagnosis", {})
    if diag.get("has_conflict", False) or diag.get("deficit_amount", 0) > 0 or state.get("execution_tier") == "ESCALATE":
        return "human_escalation"
    return "auto_execution"


# ============================================================================
# COMPOSE LANGGRAPH STATEGRAPH
# ============================================================================

def build_msme_langgraph() -> Any:
    workflow = StateGraph(MSMEAgentState)

    workflow.add_node("finance_agent", finance_agent_node)
    workflow.add_node("inventory_agent", inventory_agent_node)
    workflow.add_node("conflict_diagnosis", conflict_diagnosis_node)
    workflow.add_node("mcdm_arbitration", mcdm_arbitration_node)
    workflow.add_node("human_escalation", human_escalation_node)
    workflow.add_node("auto_execution", auto_execution_node)

    workflow.add_edge(START, "finance_agent")
    workflow.add_edge("finance_agent", "inventory_agent")
    workflow.add_edge("inventory_agent", "conflict_diagnosis")
    workflow.add_edge("conflict_diagnosis", "mcdm_arbitration")

    workflow.add_conditional_edges(
        "mcdm_arbitration",
        route_decision_tier,
        {
            "human_escalation": "human_escalation",
            "auto_execution": "auto_execution"
        }
    )

    workflow.add_edge("human_escalation", END)
    workflow.add_edge("auto_execution", END)

    return workflow.compile()


msme_langgraph_app = build_msme_langgraph()
