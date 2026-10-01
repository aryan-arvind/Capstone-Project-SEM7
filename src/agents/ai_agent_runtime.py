"""
Autonomous AI Agent Execution Runtime with Dynamic LLM & ReAct Support.
Fully dynamic agent execution loop:
1. Context & Business State Ingestion
2. Real-time Domain Tool Invocations
3. Dynamic LLM Prompting & Reasoning Synthesis (Google Gemini 3.8 Flash / OpenAI)
4. Structured Recommendation Output Generation
"""

import os
import json
import uuid
import time
import requests
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

# Auto-load .env from project root
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
    except Exception:
        pass

from src.schemas import Recommendation, AgentType, SystemState
from src.agents.tools import (
    tool_check_liquidity_runway,
    tool_verify_statutory_tax_obligations,
    tool_simulate_cash_balance,
    tool_calculate_stockout_risk,
    tool_fetch_supplier_procurement_batch,
    tool_calculate_split_batch_option
)


@dataclass
class ToolExecutionRecord:
    tool_name: str
    arguments: Dict[str, Any]
    output: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)


@dataclass
class AIAgentExecutionTrace:
    agent_id: str
    agent_name: str
    agent_type: str
    role: str
    goal: str
    thoughts: List[str]
    tool_calls: List[ToolExecutionRecord]
    final_recommendation: Optional[Recommendation]
    execution_time_ms: float
    model_used: str


def call_llm_if_available(system_prompt: str, user_prompt: str) -> Optional[str]:
    """
    Queries Google Gemini (gemini-3.8-flash) using requests with fallback.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"System Instructions:\n{system_prompt}\n\nTask Context:\n{user_prompt}"}
                        ]
                    }
                ],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 250}
            }
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                res_data = resp.json()
                return res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            print(f"[Gemini API Warning] {e}")

    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 250
            }
            resp = requests.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {openai_key}"},
                timeout=8
            )
            if resp.status_code == 200:
                res_data = resp.json()
                return res_data["choices"][0]["message"]["content"].strip()
        except Exception:
            pass

    return None


class BaseAutonomousAIAgent:
    def __init__(self, agent_name: str, agent_type: AgentType, role: str, goal: str, backstory: str):
        self.agent_name = agent_name
        self.agent_type = agent_type
        self.role = role
        self.goal = goal
        self.backstory = backstory

    def run(self, state: SystemState, context: Dict[str, Any]) -> AIAgentExecutionTrace:
        raise NotImplementedError


class FinanceAIAgent(BaseAutonomousAIAgent):
    """
    Autonomous Finance Intelligence Agent.
    """

    def __init__(self):
        super().__init__(
            agent_name="Finance Intelligence Agent",
            agent_type=AgentType.FINANCE,
            role="Chief Financial Risk & Liquidity Officer",
            goal="Preserve MSME liquid solvency, protect mandatory payroll reserve buffers, and eliminate statutory GST non-compliance penalties.",
            backstory="You are an autonomous corporate finance agent dedicated to protecting Indian MSMEs from insolvency and statutory defaults."
        )

    def run(self, state: SystemState, context: Dict[str, Any]) -> AIAgentExecutionTrace:
        start_time = time.time()
        thoughts: List[str] = []
        tool_records: List[ToolExecutionRecord] = []
        model_name = "Dynamic-Autonomous-ReAct-Engine"

        # 1. Real-time Liquidity Runway Tool
        daily_burn = float(context.get("daily_burn_rate", 1500.0))
        runway_res = tool_check_liquidity_runway(state.available_cash, daily_burn_rate=daily_burn)
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_check_liquidity_runway",
            arguments={"available_cash": state.available_cash, "daily_burn_rate": daily_burn},
            output=runway_res
        ))
        thoughts.append(f"Audited liquid capital of INR {state.available_cash:,.2f}. Operational burn rate allows {runway_res['runway_days']} days of runway ({runway_res['liquidity_health']}).")

        # 2. Real-time Statutory Tax Obligations Tool
        gst_liability = float(context.get("upcoming_gst_liability", 20000.0))
        gst_due_days = float(context.get("gst_due_days", 3.0))
        tax_res = tool_verify_statutory_tax_obligations(gst_liability, due_in_days=gst_due_days)
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_verify_statutory_tax_obligations",
            arguments={"upcoming_gst_liability": gst_liability, "due_in_days": gst_due_days},
            output=tax_res
        ))
        thoughts.append(f"Statutory tax check: INR {gst_liability:,.2f} GST due in {gst_due_days:.0f} days. Daily non-compliance penalty is INR {tax_res['daily_penalty_inr']:,.2f}/day.")

        # 3. Real-time Cash Balance Simulation Tool
        payroll_reserve = float(context.get("upcoming_payroll_reserve", 15000.0))
        sim_res = tool_simulate_cash_balance(state.available_cash, gst_liability, mandatory_reserve=payroll_reserve)
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_simulate_cash_balance",
            arguments={"current_cash": state.available_cash, "expense_amount": gst_liability, "mandatory_reserve": payroll_reserve},
            output=sim_res
        ))

        if sim_res["breaches_safety_reserve"]:
            thoughts.append(f"Reserve Assessment: Full remittance leaves INR {sim_res['post_expense_cash']:,.2f}, which breaches mandatory payroll buffer (Deficit: INR {abs(sim_res['reserve_buffer']):,.2f}).")
        else:
            thoughts.append(f"Reserve Assessment: Post-tax liquidity buffer of INR {sim_res['reserve_buffer']:,.2f} remains above payroll safety line.")

        # 4. Live Gemini 3.8 Flash Reasoning Call
        llm_system_prompt = f"You are {self.role}. Backstory: {self.backstory}. Goal: {self.goal}."
        llm_user_prompt = (
            f"Current Cash: INR {state.available_cash}\n"
            f"GST Liability: INR {gst_liability} due in {gst_due_days} days.\n"
            f"Liquidity Tool Output: {runway_res}\n"
            f"Tax Tool Output: {tax_res}\n"
            f"Simulation Output: {sim_res}\n"
            f"State a 1-sentence strategic rationale for remitting or delaying this tax obligation."
        )
        llm_response = call_llm_if_available(llm_system_prompt, llm_user_prompt)
        if llm_response:
            model_name = "Gemini-3.8-Flash (Live LLM)"
            thoughts.append(f"Gemini LLM Reasoning: {llm_response}")

        urgency = 0.95 if gst_due_days <= 3.0 else max(0.60, 1.0 - (gst_due_days / 14.0))
        impact = 0.92
        risk = 0.08

        rec_id = f"REC-FIN-{uuid.uuid4().hex[:6].upper()}"
        recommendation = Recommendation(
            recommendation_id=rec_id,
            agent_type=AgentType.FINANCE,
            title=f"Statutory Compliance: Settle GST Liability (INR {gst_liability:,.2f})",
            description=(
                f"Statutory GST liability of INR {gst_liability:,.2f} is due in {gst_due_days:.0f} days. "
                f"Failing to remit immediately triggers daily compounding penalty (INR {tax_res['daily_penalty_inr']:,.2f}/day) "
                f"and risks GSTIN suspension under CGST Act Section 50. Current runway: {runway_res['runway_days']} days."
            ),
            required_cash=gst_liability,
            urgency_score=round(urgency, 2),
            expected_roi_or_impact=round(impact, 2),
            risk_score=round(risk, 2),
            deadline_days=gst_due_days,
            metadata={
                "gst_liability": gst_liability,
                "due_in_days": gst_due_days,
                "daily_penalty_inr": tax_res["daily_penalty_inr"],
                "runway_days": runway_res["runway_days"],
                "liquidity_health": runway_res["liquidity_health"],
                "payroll_reserve": payroll_reserve
            }
        )

        thoughts.append(f"Synthesized Recommendation {rec_id}: Urgency={urgency:.2f}, Impact={impact:.2f}, Risk={risk:.2f}, Capital Required=INR {gst_liability:,.2f}.")

        elapsed = round((time.time() - start_time) * 1000, 2)
        return AIAgentExecutionTrace(
            agent_id="agent-finance-01",
            agent_name=self.agent_name,
            agent_type=self.agent_type.value,
            role=self.role,
            goal=self.goal,
            thoughts=thoughts,
            tool_calls=tool_records,
            final_recommendation=recommendation,
            execution_time_ms=elapsed,
            model_used=model_name
        )


class InventoryAIAgent(BaseAutonomousAIAgent):
    """
    Autonomous Inventory Intelligence Agent.
    """

    def __init__(self):
        super().__init__(
            agent_name="Inventory Intelligence Agent",
            agent_type=AgentType.INVENTORY,
            role="Head of Supply Chain & Inventory Optimization",
            goal="Prevent high-margin SKU stockouts, capture surge demand opportunities, and secure supplier wholesale discounts.",
            backstory="You are an autonomous supply chain optimization agent that dynamically evaluates lead times and restocking economics."
        )

    def run(self, state: SystemState, context: Dict[str, Any]) -> AIAgentExecutionTrace:
        start_time = time.time()
        thoughts: List[str] = []
        tool_records: List[ToolExecutionRecord] = []
        model_name = "Dynamic-Autonomous-ReAct-Engine"

        sku_name = str(context.get("sku_name", "Raw Steel Alloy Bars #A42"))
        current_stock = float(context.get("current_stock", 4.0))
        daily_velocity = float(context.get("daily_sales_velocity", 3.5))
        lead_time = float(context.get("supplier_lead_time_days", 4.0))
        unit_cost = float(context.get("unit_cost", 900.0))
        unit_sale_price = float(context.get("unit_sale_price", unit_cost * 1.35))
        surge_pct = float(context.get("festival_surge_pct", 25.0))
        base_reorder_qty = float(context.get("base_reorder_qty", 50.0))

        # 1. Real-time Stockout Risk Calculation Tool
        stockout_res = tool_calculate_stockout_risk(
            sku_name=sku_name,
            current_stock=current_stock,
            daily_sales_velocity=daily_velocity,
            lead_time_days=lead_time,
            unit_sale_price=unit_sale_price,
            unit_cost=unit_cost
        )
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_calculate_stockout_risk",
            arguments={
                "sku_name": sku_name,
                "current_stock": current_stock,
                "daily_sales_velocity": daily_velocity,
                "lead_time_days": lead_time
            },
            output=stockout_res
        ))
        thoughts.append(f"Evaluated '{sku_name}': Current stock ({current_stock} units) will deplete in {stockout_res['days_to_stockout']} days vs {lead_time} days supplier lead time. Stockout risk: {stockout_res['stockout_probability']*100:.0f}%. Potential lost revenue: INR {stockout_res['estimated_lost_revenue_inr']:,.2f}.")

        # 2. Real-time Supplier Wholesale Quote Tool
        supplier_res = tool_fetch_supplier_procurement_batch(
            sku_name=sku_name,
            reorder_quantity=base_reorder_qty,
            unit_cost=unit_cost,
            festival_surge_pct=surge_pct
        )
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_fetch_supplier_procurement_batch",
            arguments={
                "sku_name": sku_name,
                "reorder_quantity": base_reorder_qty,
                "unit_cost": unit_cost,
                "festival_surge_pct": surge_pct
            },
            output=supplier_res
        ))
        required_cash = supplier_res["final_required_cash_inr"]
        thoughts.append(f"Supplier batch calculation: Recommended batch of {supplier_res['recommended_reorder_qty']:.0f} units (Surge: +{surge_pct:.0f}%). Total required: INR {required_cash:,.2f} (Discounts: INR {supplier_res['discount_applied_inr']:,.2f}).")

        # 3. Real-time Split Batch Fallback Tool
        split_res = tool_calculate_split_batch_option(sku_name, supplier_res["recommended_reorder_qty"], unit_cost)
        tool_records.append(ToolExecutionRecord(
            tool_name="tool_calculate_split_batch_option",
            arguments={"sku_name": sku_name, "original_reorder_qty": supplier_res["recommended_reorder_qty"], "unit_cost": unit_cost},
            output=split_res
        ))
        thoughts.append(f"Contingency model: Computed emergency 50% split batch ({split_res['emergency_batch_qty']} units @ INR {split_res['emergency_batch_cost_inr']:,.2f}) to protect cash runway if constrained.")

        # 4. Live Gemini 3.8 Flash Reasoning Call
        llm_system_prompt = f"You are {self.role}. Backstory: {self.backstory}. Goal: {self.goal}."
        llm_user_prompt = (
            f"SKU: {sku_name}, Current Stock: {current_stock}, Velocity: {daily_velocity} units/day, Lead Time: {lead_time} days.\n"
            f"Stockout Tool Output: {stockout_res}\n"
            f"Supplier Tool Output: {supplier_res}\n"
            f"State a 1-sentence operational justification for this purchase order."
        )
        llm_response = call_llm_if_available(llm_system_prompt, llm_user_prompt)
        if llm_response:
            model_name = "Gemini-3.8-Flash (Live LLM)"
            thoughts.append(f"Gemini LLM Reasoning: {llm_response}")

        urgency = min(0.95, 0.65 + (stockout_res["stockout_probability"] * 0.30))
        impact = 0.88
        risk = 0.22

        rec_id = f"REC-INV-{uuid.uuid4().hex[:6].upper()}"
        recommendation = Recommendation(
            recommendation_id=rec_id,
            agent_type=AgentType.INVENTORY,
            title=f"Restock Surge Batch: {sku_name} ({supplier_res['recommended_reorder_qty']:.0f} units)",
            description=(
                f"Critical stockout predicted in {stockout_res['days_to_stockout']} days (Lead time: {lead_time} days). "
                f"Reorder {supplier_res['recommended_reorder_qty']:.0f} units to prevent stockout and capture +{surge_pct:.0f}% festival surge. "
                f"Estimated revenue protected: INR {stockout_res['estimated_lost_revenue_inr']:,.2f}. Required Capital: INR {required_cash:,.2f}."
            ),
            required_cash=required_cash,
            urgency_score=round(urgency, 2),
            expected_roi_or_impact=round(impact, 2),
            risk_score=round(risk, 2),
            deadline_days=stockout_res["days_to_stockout"],
            metadata={
                "sku_name": sku_name,
                "current_stock": current_stock,
                "reorder_quantity": supplier_res["recommended_reorder_qty"],
                "stockout_probability": stockout_res["stockout_probability"],
                "estimated_lost_revenue": stockout_res["estimated_lost_revenue_inr"],
                "emergency_split_batch_cost": split_res["emergency_batch_cost_inr"],
                "emergency_split_batch_qty": split_res["emergency_batch_qty"]
            }
        )

        thoughts.append(f"Synthesized Recommendation {rec_id}: Urgency={urgency:.2f}, Impact={impact:.2f}, Risk={risk:.2f}, Capital Required=INR {required_cash:,.2f}.")

        elapsed = round((time.time() - start_time) * 1000, 2)
        return AIAgentExecutionTrace(
            agent_id="agent-inventory-01",
            agent_name=self.agent_name,
            agent_type=self.agent_type.value,
            role=self.role,
            goal=self.goal,
            thoughts=thoughts,
            tool_calls=tool_records,
            final_recommendation=recommendation,
            execution_time_ms=elapsed,
            model_used=model_name
        )
