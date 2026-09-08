"""
Unified Arbitration Core Engine for Multi-Agent Decision Coordination.

Combines:
  1. Pairwise & Resource Conflict Detection (Liquid buffer bounds).
  2. Multi-Criteria Decision Making (MCDM / SAW) priority scoring across:
     - Urgency (deadline pressure / days to stockout)
     - Revenue Impact (sales velocity * price or expected gain)
     - Cost Efficiency / Cash Headroom (stretching constrained liquidity)
     - Confidence / Risk Safety (downside mitigation)
  3. Solvency Guardrails & Amount Capping (e.g., hard Rs. 20,000 restock cap when cash < Rs. 40,000).
  4. Dynamic Confidence & Risk Gating (AUTO_EXECUTE, AUTO_LOG, ESCALATE).
  5. Action Card generation with explainable payment notes (Razorpay test mode payload).
"""

from __future__ import annotations

import sys
import uuid
from typing import List, Dict, Any, Optional, Tuple, Union

from src.schemas import (
    Recommendation,
    SystemState,
    ArbitrationResult,
    ActionCard,
    ExecutionTier,
    AgentType,
)

HARD_CASH_THRESHOLD = 40000.0
HARD_RESTOCK_CAP = 20000.0
DEFAULT_MINIMUM_CASH_RESERVE = 10000.0

DEFAULT_WEIGHTS = {
    "urgency": 0.40,
    "revenue_impact": 0.30,
    "cost_efficiency": 0.20,
    "confidence_or_safety": 0.10,
}


def _format_currency(amount: float) -> str:
    """Safely formats currency for consoles with or without UTF-8 support."""
    formatted = f"{amount:,.2f}"
    # Check stdout encoding to prevent UnicodeEncodeError on Windows cp1252
    encoding = getattr(sys.stdout, "encoding", "utf-8") or "utf-8"
    try:
        "₹".encode(encoding)
        return f"₹{formatted}"
    except (UnicodeEncodeError, LookupError):
        return f"Rs. {formatted}"


def _normalize(values: List[float], higher_is_better: bool) -> List[float]:
    """Min-max normalization to [0.0, 1.0]. Falls back to 1.0 if all values equal."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [1.0] * len(values)
    if higher_is_better:
        return [(v - lo) / (hi - lo) for v in values]
    return [(hi - v) / (hi - lo) for v in values]


def conflict_check(
    inventory_rec: Union[dict, List[Recommendation]],
    finance_rec: Union[dict, SystemState],
    minimum_cash_reserve: float = DEFAULT_MINIMUM_CASH_RESERVE
) -> Dict[str, Any]:
    """
    Algorithm 1: Checks whether requested spending exceeds the liquid buffer.
    Accepts either raw agent dicts or standardized schema objects.
    """
    if isinstance(inventory_rec, dict):
        requested = float(inventory_rec.get("total_requested_cost", 0.0))
    elif isinstance(inventory_rec, list):
        requested = float(sum(r.required_cash for r in inventory_rec))
    else:
        requested = 0.0

    if isinstance(finance_rec, dict):
        avail = float(finance_rec.get("available_cash", 0.0))
        cash_balance = float(finance_rec.get("cash_balance", avail))
    elif isinstance(finance_rec, SystemState):
        avail = finance_rec.available_cash
        cash_balance = finance_rec.available_cash
    else:
        avail = 0.0
        cash_balance = 0.0

    liquid_buffer = max(0.0, cash_balance - minimum_cash_reserve)
    has_conflict = requested > avail or (cash_balance < HARD_CASH_THRESHOLD and requested > HARD_RESTOCK_CAP)
    shortfall = max(0.0, requested - avail)

    return {
        "conflict": has_conflict,
        "requested_cost": round(requested, 2),
        "available_cash": round(avail, 2),
        "cash_balance": round(cash_balance, 2),
        "liquid_buffer": round(liquid_buffer, 2),
        "shortfall": round(shortfall, 2),
    }


def priority_rank(
    items: List[Dict[str, Any]],
    weights: Optional[Dict[str, float]] = None
) -> List[Dict[str, Any]]:
    """
    Algorithm 2: Multi-Criteria Decision Making (MCDM) ranking using SAW.
    Scores items on urgency, revenue impact, and cost efficiency.
    """
    if not items:
        return []

    w = weights or DEFAULT_WEIGHTS

    days_remaining = [
        0.0 if item.get("days_of_stock_remaining") is None else float(item["days_of_stock_remaining"])
        for item in items
    ]
    revenue_impact = [
        float(item.get("avg_daily_sales", 1.0)) * float(item.get("unit_price", 1.0))
        for item in items
    ]
    restock_cost = [float(item.get("restock_cost", 1.0)) for item in items]

    urgency_scores = _normalize(days_remaining, higher_is_better=False)
    revenue_scores = _normalize(revenue_impact, higher_is_better=True)
    cost_scores = _normalize(restock_cost, higher_is_better=False)

    ranked = []
    for item, urg, rev, cost in zip(items, urgency_scores, revenue_scores, cost_scores):
        score = (
            w.get("urgency", 0.4) * urg
            + w.get("revenue_impact", 0.3) * rev
            + w.get("cost_efficiency", 0.2) * cost
            + w.get("confidence_or_safety", 0.1) * 0.9 # Baseline high confidence for tool data
        )
        ranked.append({**item, "priority_score": round(score, 4)})

    ranked.sort(key=lambda x: x["priority_score"], reverse=True)
    return ranked


def decision_router(
    inventory_rec: Dict[str, Any],
    finance_rec: Dict[str, Any],
    weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Algorithm 3: Functional decision router.
    Reconciles agent dicts and applies hard solvency caps.
    """
    conflict = conflict_check(inventory_rec, finance_rec)
    cash_balance = finance_rec.get("cash_balance", 0.0)
    avail_cash = finance_rec.get("available_cash", 0.0)

    if cash_balance < HARD_CASH_THRESHOLD:
        budget_cap = min(HARD_RESTOCK_CAP, avail_cash)
        cap_reason = (
            f"Cash balance {_format_currency(cash_balance)} is below {_format_currency(HARD_CASH_THRESHOLD)} "
            f"solvency threshold; restock spend is hard-capped at {_format_currency(HARD_RESTOCK_CAP)}."
        )
    else:
        budget_cap = avail_cash
        cap_reason = (
            f"Cash balance {_format_currency(cash_balance)} is healthy; restock spend is capped at "
            f"reported available cash of {_format_currency(budget_cap)}."
        )

    raw_items = inventory_rec.get("low_stock_items", [])
    ranked_items = priority_rank(raw_items, weights)

    approved, deferred = [], []
    remaining_budget = budget_cap
    for item in ranked_items:
        cost = float(item.get("restock_cost", 0.0))
        if cost <= remaining_budget:
            approved.append(item)
            remaining_budget -= cost
        else:
            deferred.append(item)

    total_approved_cost = round(sum(i["restock_cost"] for i in approved), 2)

    # Determine execution tier
    max_risk = 0.20  # Routine inventory restocking has low risk
    utilization = (total_approved_cost / budget_cap) if budget_cap > 0 else 0.0
    if utilization > 0.85 or cash_balance < HARD_CASH_THRESHOLD:
        execution_tier = ExecutionTier.AUTO_LOG.value
    else:
        execution_tier = ExecutionTier.AUTO_EXECUTE.value

    if not ranked_items:
        rationale = "No SKUs are below reorder level; no restock action required."
    elif deferred:
        rationale = (
            f"{cap_reason} Approved {len(approved)} of {len(ranked_items)} restock request(s) "
            f"totalling {_format_currency(total_approved_cost)} via MCDM priority ranking. "
            f"{len(deferred)} item(s) deferred to the next cycle."
        )
    else:
        rationale = (
            f"{cap_reason} All {len(approved)} restock request(s) fit within budget "
            f"({_format_currency(total_approved_cost)} of {_format_currency(budget_cap)})."
        )

    # Generate Action Cards
    action_cards = []
    for item in approved:
        action_cards.append({
            "card_id": f"ACT_{item.get('sku', 'GEN')}_{uuid.uuid4().hex[:6]}",
            "title": f"Restock {item.get('product_name')} ({item.get('recommended_restock_qty')} units)",
            "agent_type": "INVENTORY",
            "status": "APPROVED",
            "priority_score": item.get("priority_score", 0.5),
            "cost_inr": item.get("restock_cost", 0.0),
            "urgency_score": round(max(0.0, 1.0 - (item.get("days_of_stock_remaining") or 0.0) / 14.0), 2),
            "execution_tier": execution_tier,
            "summary_rationale": f"Stock runway is {item.get('days_of_stock_remaining')} days. Restock to prevent stockout.",
            "evidence": {
                "sku": item.get("sku"),
                "stock_on_hand": item.get("stock_on_hand"),
                "reorder_level": item.get("reorder_level"),
                "avg_daily_sales": item.get("avg_daily_sales"),
            },
            "razorpay_order_payload": {
                "amount": int(item.get("restock_cost", 0.0) * 100), # in paise
                "currency": "INR",
                "receipt": f"RCP_{item.get('sku')}_{uuid.uuid4().hex[:6]}",
                "notes": {
                    "sku": item.get("sku"),
                    "action": "inventory_restock",
                    "bounded_by": "MCDM_Arbitration_Guardrail",
                    "explanation": f"Approved restock for {item.get('product_name')} within {_format_currency(budget_cap)} cap."
                }
            }
        })

    return {
        "business_id": inventory_rec.get("business_id"),
        "conflict": conflict,
        "budget_cap_applied": round(budget_cap, 2),
        "execution_tier": execution_tier,
        "approved_items": approved,
        "deferred_items": deferred,
        "total_approved_cost": total_approved_cost,
        "remaining_budget": round(remaining_budget, 2),
        "rationale": rationale,
        "action_cards": action_cards,
    }


class ArbitrationEngine:
    """
    Coordinates and reconciles competing recommendations under liquidity & urgency constraints.
    Supports both typed Recommendation objects and raw agent dicts.
    """

    def __init__(
        self,
        weight_urgency: float = 0.40,
        weight_impact: float = 0.30,
        weight_risk: float = 0.20,
        weight_confidence: float = 0.10,
        auto_execute_risk_threshold: float = 0.30,
        escalate_financial_ratio: float = 0.60,
    ):
        self.w_urgency = weight_urgency
        self.w_impact = weight_impact
        self.w_risk = weight_risk
        self.w_conf = weight_confidence
        self.risk_threshold = auto_execute_risk_threshold
        self.escalate_ratio = escalate_financial_ratio

    def calculate_priority_score(self, rec: Recommendation) -> float:
        """
        Computes normalized priority score in [0.0, 1.0].
        Score = w_u * Urgency + w_i * Impact + w_r * (1 - Risk) + w_c * Confidence
        """
        risk_safety = max(0.0, 1.0 - rec.risk_score)
        conf = float(rec.metadata.get("confidence", 0.90))

        score = (
            (self.w_urgency * rec.urgency_score)
            + (self.w_impact * rec.expected_roi_or_impact)
            + (self.w_risk * risk_safety)
            + (self.w_conf * conf)
        )
        return round(score, 4)

    def arbitrate(
        self,
        recommendations: List[Recommendation],
        state: SystemState
    ) -> ArbitrationResult:
        """
        Reconciles list of agent recommendations against state.available_cash and solvency floors.
        """
        arbitration_id = str(uuid.uuid4())

        if not recommendations:
            return ArbitrationResult(
                arbitration_id=arbitration_id,
                approved_recommendations=[],
                rejected_recommendations=[],
                total_cash_allocated=0.0,
                remaining_cash=state.available_cash,
                execution_tier=ExecutionTier.AUTO_EXECUTE,
                decision_rationale="No recommendations provided to arbitrate.",
                priority_scores={},
                budget_cap_applied=state.available_cash,
                action_cards=[]
            )

        # 1. Check solvency threshold cap (e.g. if cash < 40k, cap spend to 20k or available cash)
        if state.available_cash < HARD_CASH_THRESHOLD:
            effective_cap = min(HARD_RESTOCK_CAP, state.available_cash)
            cap_note = f"Solvency guardrail applied: spend capped at {_format_currency(effective_cap)}."
        else:
            effective_cap = state.available_cash
            cap_note = f"Standard liquidity budget applied: {_format_currency(effective_cap)}."

        # 2. Calculate priority scores
        scored_recs: List[Tuple[Recommendation, float]] = []
        scores_map: Dict[str, float] = {}

        for rec in recommendations:
            score = self.calculate_priority_score(rec)
            scored_recs.append((rec, score))
            scores_map[rec.recommendation_id] = score

        # Sort descending by priority score
        scored_recs.sort(key=lambda x: x[1], reverse=True)

        # 3. Greedy Knapsack allocation under effective budget cap
        approved: List[Recommendation] = []
        rejected: List[Recommendation] = []
        allocated_cash = 0.0
        current_budget = effective_cap

        for rec, score in scored_recs:
            if rec.required_cash <= current_budget:
                approved.append(rec)
                allocated_cash += rec.required_cash
                current_budget -= rec.required_cash
            else:
                rejected.append(rec)

        remaining_cash = round(state.available_cash - allocated_cash, 2)

        # 4. Determine Confidence / Risk Execution Tier
        execution_tier = self._determine_execution_tier(approved, state.available_cash, allocated_cash)

        # 5. Formulate Decision Rationale
        rationale = self._build_rationale(approved, rejected, state.available_cash, allocated_cash, cap_note)

        # 6. Generate Action Cards
        action_cards: List[ActionCard] = []
        for rec in approved:
            action_cards.append(
                ActionCard(
                    card_id=f"ACT_{rec.recommendation_id}",
                    title=rec.title,
                    agent_type=rec.agent_type.value if isinstance(rec.agent_type, AgentType) else str(rec.agent_type),
                    status="APPROVED",
                    priority_score=scores_map.get(rec.recommendation_id, 0.5),
                    cost_inr=rec.required_cash,
                    urgency_score=rec.urgency_score,
                    execution_tier=execution_tier.value,
                    summary_rationale=rec.description,
                    evidence=rec.metadata,
                    razorpay_order_payload={
                        "amount": int(rec.required_cash * 100),
                        "currency": "INR",
                        "receipt": f"RCP_{rec.recommendation_id[:10]}",
                        "notes": {
                            "decision_id": arbitration_id,
                            "recommendation_id": rec.recommendation_id,
                            "explanation": f"Approved under {execution_tier.value} tier."
                        }
                    }
                )
            )

        return ArbitrationResult(
            arbitration_id=arbitration_id,
            approved_recommendations=approved,
            rejected_recommendations=rejected,
            total_cash_allocated=round(allocated_cash, 2),
            remaining_cash=remaining_cash,
            execution_tier=execution_tier,
            decision_rationale=rationale,
            priority_scores=scores_map,
            budget_cap_applied=round(effective_cap, 2),
            action_cards=action_cards
        )

    def _determine_execution_tier(
        self,
        approved: List[Recommendation],
        initial_cash: float,
        allocated_cash: float
    ) -> ExecutionTier:
        if not approved:
            return ExecutionTier.AUTO_EXECUTE

        max_risk = max(rec.risk_score for rec in approved)
        cash_utilization = allocated_cash / initial_cash if initial_cash > 0 else 1.0

        if cash_utilization > self.escalate_ratio or max_risk > 0.60:
            return ExecutionTier.ESCALATE
        elif max_risk > self.risk_threshold:
            return ExecutionTier.AUTO_LOG
        else:
            return ExecutionTier.AUTO_EXECUTE

    def _build_rationale(
        self,
        approved: List[Recommendation],
        rejected: List[Recommendation],
        initial_cash: float,
        allocated_cash: float,
        cap_note: str,
    ) -> str:
        summary = (
            f"Allocated {_format_currency(allocated_cash)} out of {_format_currency(initial_cash)} available cash. "
            f"{cap_note} "
        )
        if approved:
            app_titles = [f"'{r.title}' (Urgency: {r.urgency_score})" for r in approved]
            summary += f"Approved {len(approved)} action(s): {', '.join(app_titles)}. "
        if rejected:
            rej_titles = [f"'{r.title}' (Req: {_format_currency(r.required_cash)})" for r in rejected]
            summary += f"Deferred/Rejected {len(rejected)} action(s) due to liquidity bounds: {', '.join(rej_titles)}."
        return summary
