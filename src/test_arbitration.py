"""
Test script simulating the ₹40,000 Cash Conflict Example from Capstone Proposal.
Verifies Arbitration Engine priority scoring and constraint allocation.
"""

from src.schemas import Recommendation, SystemState, AgentType, ExecutionTier
from src.arbitration import ArbitrationEngine


def test_worked_example():
    print("==================================================")
    print(" RUNNING CAPSTONE WORKED EXAMPLE CONFLICT TEST ")
    print("==================================================")

    # 1. Setup shared system state (Liquid cash: ₹40,000)
    state = SystemState(
        available_cash=40000.0,
        time_window_days=7.0
    )
    print(f"\nInitial System Cash: ₹{state.available_cash:,.2f}")

    # 2. Inventory Agent Recommendation (Festival season stock reorder)
    inventory_rec = Recommendation(
        recommendation_id="REC_INV_001",
        agent_type=AgentType.INVENTORY,
        title="Reorder Inventory Batch #A42 (Festival Demand)",
        description="Reorder fast-moving stock to prevent stockout during upcoming festival.",
        required_cash=45000.0,
        urgency_score=0.85,
        expected_roi_or_impact=0.90,
        risk_score=0.25,
        deadline_days=5.0
    )

    # 3. Compliance Agent Recommendation (GST Liability Payment due in 3 days)
    compliance_rec = Recommendation(
        recommendation_id="REC_CMP_001",
        agent_type=AgentType.COMPLIANCE,
        title="Pay Statutory GST Liability (Due in 3 Days)",
        description="Pay GST tax liability to avoid statutory interest & penalties.",
        required_cash=20000.0,
        urgency_score=0.95,
        expected_roi_or_impact=0.80,
        risk_score=0.10,
        deadline_days=3.0
    )

    recommendations = [inventory_rec, compliance_rec]

    print("\nCompeting Agent Recommendations:")
    for r in recommendations:
        print(f" - [{r.agent_type.value}] {r.title} | Cash Req: ₹{r.required_cash:,.2f} | Urgency: {r.urgency_score}")

    total_demanded = sum(r.required_cash for r in recommendations)
    print(f"\nTotal Cash Required: ₹{total_demanded:,.2f}")
    print(f"Cash Deficit: ₹{total_demanded - state.available_cash:,.2f} (CONFLICT DETECTED)")

    # 4. Initialize Arbitration Engine and Run Arbitration
    engine = ArbitrationEngine()
    result = engine.arbitrate(recommendations, state)

    print("\n==================================================")
    print(" ARBITRATION RESULT ")
    print("==================================================")
    print(f"Arbitration ID       : {result.arbitration_id}")
    print(f"Total Cash Allocated : ₹{result.total_cash_allocated:,.2f}")
    print(f"Remaining Cash Balance: ₹{result.remaining_cash:,.2f}")
    print(f"Execution Tier       : {result.execution_tier.value}")
    print(f"\nPriority Scores:")
    for rec_id, score in result.priority_scores.items():
        print(f" - {rec_id}: {score}")

    print(f"\nApproved Recommendations ({len(result.approved_recommendations)}):")
    for r in result.approved_recommendations:
        print(f"  [APPROVED] {r.title} (Cash: ₹{r.required_cash:,.2f})")

    print(f"\nRejected/Deferred Recommendations ({len(result.rejected_recommendations)}):")
    for r in result.rejected_recommendations:
        print(f"  [DEFERRED] {r.title} (Cash: ₹{r.required_cash:,.2f})")

    print(f"\nDecision Rationale:\n{result.decision_rationale}")
    print("==================================================\n")


if __name__ == "__main__":
    test_worked_example()
