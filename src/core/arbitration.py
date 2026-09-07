"""
Arbitration Engine.

Pure Python — takes the structured outputs of InventoryAgent and
FinanceAgent (plain dicts) and reconciles them into one final decision. Has
no database or I/O dependency, which keeps it deterministic and easy to unit
test in isolation from the agents that feed it.

Three responsibilities:
  - conflict_check()   : does inventory want to spend more than finance can spare?
  - priority_rank()    : MCDM (weighted-sum / SAW) ranking of restock candidates
  - decision_router()  : reconciles both agents into an approved action list,
                          enforcing the hard policy that restock spend is capped
                          at Rs. 20,000 whenever cash balance is under Rs. 40,000
"""

HARD_CASH_THRESHOLD = 40000.0
HARD_RESTOCK_CAP = 20000.0

# MCDM (Simple Additive Weighting) criteria weights for ranking restock candidates.
# Higher urgency and revenue impact push a SKU up the list; higher cost efficiency
# (i.e. cheaper to restock) also helps it fit inside a constrained budget.
DEFAULT_WEIGHTS = {
    "urgency": 0.5,
    "revenue_impact": 0.3,
    "cost_efficiency": 0.2,
}


def conflict_check(inventory_rec: dict, finance_rec: dict) -> dict:
    """Flags whether inventory's total restock ask exceeds finance's
    reported available cash.
    """
    requested = inventory_rec.get("total_requested_cost", 0.0)
    available = finance_rec.get("available_cash", 0.0)
    has_conflict = requested > available

    return {
        "conflict": has_conflict,
        "requested_cost": requested,
        "available_cash": available,
        "shortfall": round(requested - available, 2) if has_conflict else 0.0,
    }


def _normalize(values: list[float], higher_is_better: bool) -> list[float]:
    """Min-max normalization to [0, 1]. Falls back to a flat 1.0 for every
    item when all values are equal (avoids a divide-by-zero).
    """
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [1.0] * len(values)
    if higher_is_better:
        return [(v - lo) / (hi - lo) for v in values]
    return [(hi - v) / (hi - lo) for v in values]


def priority_rank(low_stock_items: list[dict], weights: dict = None) -> list[dict]:
    """MCDM ranking of restock candidates using Simple Additive Weighting.

    Criteria per item:
      - urgency          : fewer days_of_stock_remaining -> more urgent (None/inf treated as most urgent)
      - revenue_impact    : avg_daily_sales * unit_price -> higher is better
      - cost_efficiency   : lower restock_cost -> better (stretches a capped budget further)

    Returns the same items with a `priority_score` field, sorted descending
    (highest priority first).
    """
    if not low_stock_items:
        return []

    weights = weights or DEFAULT_WEIGHTS

    # Treat "no sales history" (None) as maximally urgent: 0 days of runway.
    days_remaining = [
        0.0 if item["days_of_stock_remaining"] is None else float(item["days_of_stock_remaining"])
        for item in low_stock_items
    ]
    revenue_impact = [item["avg_daily_sales"] * item["unit_price"] for item in low_stock_items]
    restock_cost = [item["restock_cost"] for item in low_stock_items]

    urgency_scores = _normalize(days_remaining, higher_is_better=False)
    revenue_scores = _normalize(revenue_impact, higher_is_better=True)
    cost_scores = _normalize(restock_cost, higher_is_better=False)

    ranked = []
    for item, urgency, revenue, cost in zip(low_stock_items, urgency_scores, revenue_scores, cost_scores):
        score = (
            weights["urgency"] * urgency
            + weights["revenue_impact"] * revenue
            + weights["cost_efficiency"] * cost
        )
        ranked.append({**item, "priority_score": round(score, 4)})

    ranked.sort(key=lambda x: x["priority_score"], reverse=True)
    return ranked


def decision_router(inventory_rec: dict, finance_rec: dict, weights: dict = None) -> dict:
    """Reconciles InventoryAgent and FinanceAgent output into one decision.

    Policy: if cash_balance < Rs. 40,000, total approved restock spend is
    hard-capped at Rs. 20,000 regardless of how much finance reports as
    "available" (a solvency floor beneath the softer available-cash figure).
    Otherwise the cap is whatever finance reports as available cash.
    """
    conflict = conflict_check(inventory_rec, finance_rec)
    cash_balance = finance_rec.get("cash_balance", 0.0)

    if cash_balance < HARD_CASH_THRESHOLD:
        budget_cap = min(HARD_RESTOCK_CAP, finance_rec.get("available_cash", 0.0))
        cap_reason = (
            f"Cash balance Rs. {cash_balance:,.2f} is below the Rs. {HARD_CASH_THRESHOLD:,.2f} "
            f"solvency threshold, so restock spend is hard-capped at Rs. {HARD_RESTOCK_CAP:,.2f}."
        )
    else:
        budget_cap = finance_rec.get("available_cash", 0.0)
        cap_reason = (
            f"Cash balance Rs. {cash_balance:,.2f} is healthy; restock spend is capped at "
            f"finance's reported available cash of Rs. {budget_cap:,.2f}."
        )

    ranked_items = priority_rank(inventory_rec.get("low_stock_items", []), weights)

    approved, deferred = [], []
    remaining_budget = budget_cap
    for item in ranked_items:
        if item["restock_cost"] <= remaining_budget:
            approved.append(item)
            remaining_budget -= item["restock_cost"]
        else:
            deferred.append(item)

    total_approved_cost = round(sum(i["restock_cost"] for i in approved), 2)

    if not ranked_items:
        rationale = "No SKUs are below reorder level; no restock action required."
    elif deferred:
        rationale = (
            f"{cap_reason} Approved {len(approved)} of {len(ranked_items)} restock request(s) "
            f"totalling Rs. {total_approved_cost:,.2f}, ranked by urgency, revenue impact, and cost "
            f"efficiency (MCDM/SAW). {len(deferred)} item(s) deferred to the next cycle."
        )
    else:
        rationale = (
            f"{cap_reason} All {len(approved)} restock request(s) fit within budget "
            f"(Rs. {total_approved_cost:,.2f} of Rs. {budget_cap:,.2f})."
        )

    return {
        "business_id": inventory_rec.get("business_id"),
        "conflict": conflict,
        "budget_cap_applied": budget_cap,
        "approved_items": approved,
        "deferred_items": deferred,
        "total_approved_cost": total_approved_cost,
        "remaining_budget": round(remaining_budget, 2),
        "rationale": rationale,
    }
