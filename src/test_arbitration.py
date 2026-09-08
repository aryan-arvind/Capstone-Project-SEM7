"""
Test script simulating the ₹40,000 Cash Conflict Example from Capstone Proposal.
Verifies Arbitration Engine priority scoring and constraint allocation.
"""

import sys
import os

# Ensure project root is in sys.path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Configure UTF-8 stdout if available to prevent cp1252 UnicodeEncodeErrors
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from src.schemas import Recommendation, SystemState, AgentType, ExecutionTier
from src.arbitration import ArbitrationEngine


def test_worked_example():
    print("==================================================")
    print(" RUNNING CAPSTONE WORKED EXAMPLE CONFLICT TEST ")
    print("==================================================")

    # 1. Setup shared system state (Liquid cash: Rs. 40,000)
    state = SystemState(
        available_cash=40000.0,
        time_window_days=7.0
    )
    print(f"\nInitial System Cash: Rs. {state.available_cash:,.2f}")

    # 2. Inventory Agent Recommendation (Festival season stock reorder: Rs. 45,000)
    inventory_rec = Recommendation(
        recommendation_id="REC_INV_001",
        agent_type=AgentType.INVENTORY,
        title="Reorder Inventory Batch #A42 (Festival Demand)",
        description="Reorder fast-moving stock to prevent stockout during upcoming festival.",
        required_cash=45000.0,
        urgency_score=0.85,
        expected_roi_or_impact=0.90,
        risk_score=0.25,
        deadline_days=5.0,
        metadata={"category": "inventory", "sku": "A42"}
    )

    # 3. Compliance Agent Recommendation (GST Liability Payment: Rs. 20,000 due in 3 days)
    compliance_rec = Recommendation(
        recommendation_id="REC_CMP_001",
        agent_type=AgentType.COMPLIANCE,
        title="Pay Statutory GST Liability (Due in 3 Days)",
        description="Pay GST tax liability to avoid statutory interest & penalties.",
        required_cash=20000.0,
        urgency_score=0.95,
        expected_roi_or_impact=0.80,
        risk_score=0.10,
        deadline_days=3.0,
        metadata={"category": "compliance", "penalty_rate": 0.18}
    )

    recommendations = [inventory_rec, compliance_rec]

    print("\nCompeting Agent Recommendations:")
    for r in recommendations:
        print(f" - [{r.agent_type.value}] {r.title} | Cash Req: Rs. {r.required_cash:,.2f} | Urgency: {r.urgency_score}")

    total_demanded = sum(r.required_cash for r in recommendations)
    print(f"\nTotal Cash Required: Rs. {total_demanded:,.2f}")
    print(f"Cash Deficit: Rs. {total_demanded - state.available_cash:,.2f} (CONFLICT DETECTED)")

    # 4. Initialize Arbitration Engine and Run Arbitration
    engine = ArbitrationEngine()
    result = engine.arbitrate(recommendations, state)

    print("\n==================================================")
    print(" ARBITRATION RESULT ")
    print("==================================================")
    print(f"Arbitration ID        : {result.arbitration_id}")
    print(f"Total Cash Allocated  : Rs. {result.total_cash_allocated:,.2f}")
    print(f"Remaining Cash Balance: Rs. {result.remaining_cash:,.2f}")
    print(f"Execution Tier        : {result.execution_tier.value}")
    print(f"\nPriority Scores:")
    for rec_id, score in result.priority_scores.items():
        print(f" - {rec_id}: {score}")

    print(f"\nApproved Recommendations ({len(result.approved_recommendations)}):")
    for r in result.approved_recommendations:
        print(f"  [APPROVED] {r.title} (Cash: Rs. {r.required_cash:,.2f})")

    print(f"\nRejected/Deferred Recommendations ({len(result.rejected_recommendations)}):")
    for r in result.rejected_recommendations:
        print(f"  [DEFERRED] {r.title} (Cash: Rs. {r.required_cash:,.2f})")

    print(f"\nAction Cards Generated ({len(result.action_cards)}):")
    for c in result.action_cards:
        print(f"  - Card #{c.card_id}: {c.title} (Status: {c.status}, Tier: {c.execution_tier})")

    print(f"\nDecision Rationale:\n{result.decision_rationale}")
    print("==================================================\n")

    # Assertions to ensure algorithmic correctness
    assert len(result.approved_recommendations) == 1, "Expected exactly 1 approved recommendation"
    assert result.approved_recommendations[0].recommendation_id == "REC_CMP_001", "Compliance should be prioritized"
    assert len(result.rejected_recommendations) == 1, "Expected exactly 1 deferred recommendation"
    assert result.rejected_recommendations[0].recommendation_id == "REC_INV_001", "Inventory should be deferred"
    assert result.total_cash_allocated == 20000.0, "Total allocated should be Rs. 20,000"
    assert result.remaining_cash == 20000.0, "Remaining cash should be Rs. 20,000"
    assert result.priority_scores["REC_CMP_001"] > result.priority_scores["REC_INV_001"], "Compliance priority > Inventory"
    assert len(result.action_cards) == 1, "Expected 1 ActionCard for the approved action"

    print("ALL ASSERTIONS PASSED: Worked Example Arbitration Verified.")


if __name__ == "__main__":
    test_worked_example()
