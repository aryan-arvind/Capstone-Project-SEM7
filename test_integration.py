"""
Comprehensive Integration Test Suite for Capstone Multi-Agent Decision Intelligence Platform.

Validates all 9 core milestones end-to-end:
  1. Schemas & Data Structures (Serialization / Deserialization)
  2. Data Loader & Basic Stats
  3. SQLite Database Layer & Schema Migrations
  4. 30-Day Synthetic Store Ledger Generation (Seed Data)
  5. Read-Only Domain Agents (FinanceAgent & InventoryAgent)
  6. Deterministic Arbitration Engine (MCDM + Solvency Guardrails + Action Cards)
  7. SHA-256 Cryptographic Hash Chain Audit Trail
  8. Master Multi-Agent Orchestrator Pipeline
  9. FastAPI Route Handlers (/onboard, /business, /agent-query, /audit-trail, /action/confirm)
"""

import sys
import os

# Ensure project root is in sys.path so 'src' is always importable
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Safe UTF-8 encoding for Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import pandas as pd
from src.schemas import (
    Recommendation,
    SystemState,
    ArbitrationResult,
    ActionCard,
    ExecutionTier,
    AgentType,
)
from src.data_loader import get_basic_stats
from src.core import database as db
from src.core.audit import calculate_decision_hash, verify_hash_chain, GENESIS_HASH
from src.core.arbitration import (
    ArbitrationEngine,
    conflict_check,
    priority_rank,
    decision_router,
    HARD_CASH_THRESHOLD,
    HARD_RESTOCK_CAP,
)
from src.agents.finance_agent import FinanceAgent
from src.agents.inventory_agent import InventoryAgent
from src.seed_data import generate_seed_data, CATALOG
from src.orchestrator import orchestrator
from src.api import (
    onboard,
    get_business_details,
    agent_query,
    get_audit_trail,
    confirm_action,
    OnboardRequest,
    AgentQueryRequest,
    ActionConfirmRequest,
)


def run_all_tests():
    print("=" * 65)
    print(" CAPSTONE MULTI-AGENT PLATFORM: FULL INTEGRATION TEST ")
    print("=" * 65)

    # -------------------------------------------------------------
    # 1. Schemas & Data Structures
    # -------------------------------------------------------------
    print("\n[TEST 1/9] Testing Schemas & Models...")
    rec = Recommendation(
        recommendation_id="REC_TEST_01",
        agent_type=AgentType.INVENTORY,
        title="Test Restock",
        description="Test Restock Description",
        required_cash=5000.0,
        urgency_score=0.75,
        expected_roi_or_impact=0.80,
        risk_score=0.10,
        deadline_days=4.0,
        metadata={"sku": "SKU001"},
    )
    rec_dict = rec.to_dict()
    assert rec_dict["recommendation_id"] == "REC_TEST_01"
    assert rec_dict["agent_type"] == "INVENTORY"

    rec_reconstructed = Recommendation.from_dict(rec_dict)
    assert rec_reconstructed.title == "Test Restock"
    assert rec_reconstructed.agent_type == AgentType.INVENTORY

    sys_state = SystemState(available_cash=50000.0, time_window_days=7.0, minimum_cash_reserve=10000.0)
    assert sys_state.liquid_buffer == 40000.0
    print(" ✓ Schemas and serialization verified.")

    # -------------------------------------------------------------
    # 2. Data Loader
    # -------------------------------------------------------------
    print("\n[TEST 2/9] Testing Data Loader utilities...")
    df_sample = pd.DataFrame({
        "sales": [100.0, 250.0, 400.0],
        "quantity": [2, 5, 8]
    })
    stats = get_basic_stats(df_sample)
    assert stats is not None and "sales" in stats
    print(" ✓ Data loader statistics calculation verified.")

    # -------------------------------------------------------------
    # 3. Database Layer & Read-Only Enforcement
    # -------------------------------------------------------------
    print("\n[TEST 3/9] Testing Database initialization & read-only guardrails...")
    db.init_db()
    test_biz_id = db.create_business(
        business_name="Integration Test Mart",
        business_type="Retail - Supermarket",
        owner_name="Test Owner",
        cash_balance=35000.0,
    )
    assert test_biz_id > 0
    biz_row = db.get_business(test_biz_id)
    assert biz_row["business_name"] == "Integration Test Mart"

    # Verify agent read-only guardrail blocks non-SELECT queries
    try:
        db.run_readonly_query("DELETE FROM business_profile WHERE id = ?", (test_biz_id,))
        assert False, "run_readonly_query should have rejected DELETE"
    except ValueError:
        pass  # Expected behavior
    print(" ✓ Database read-only enforcement and CRUD verified.")

    # -------------------------------------------------------------
    # 4. 30-Day Store Ledger Generation (Seed Data)
    # -------------------------------------------------------------
    print(f"\n[TEST 4/9] Seeding 30-day operational history for business #{test_biz_id}...")
    final_cash = generate_seed_data(test_biz_id, starting_cash=35000.0, seed=123)
    db.update_cash_balance(test_biz_id, final_cash)
    assert final_cash > 0

    rows = db.run_readonly_query(
        "SELECT COUNT(*) AS total FROM operational_data WHERE business_id = ?",
        (test_biz_id,)
    )
    total_records = rows[0]["total"]
    assert total_records > 50, f"Expected >50 operational records, got {total_records}"
    print(f" ✓ Seed data verified ({total_records} records inserted, final cash: Rs. {final_cash:,.2f}).")

    # -------------------------------------------------------------
    # 5. Domain Agents
    # -------------------------------------------------------------
    print("\n[TEST 5/9] Testing FinanceAgent & InventoryAgent reasoning...")
    fin_agent = FinanceAgent()
    fin_data = fin_agent.analyze(test_biz_id)
    assert fin_data["agent"] == "finance"
    assert "available_cash" in fin_data
    assert "burn_rate_daily" in fin_data

    inv_agent = InventoryAgent()
    inv_data = inv_agent.analyze(test_biz_id)
    assert inv_data["agent"] == "inventory"
    assert "low_stock_items" in inv_data

    inv_recs = inv_agent.generate_recommendations(test_biz_id)
    assert isinstance(inv_recs, list)
    print(f" ✓ Domain agents verified (Finance available: Rs. {fin_data['available_cash']:,.2f}, Inventory low stock SKUs: {len(inv_recs)}).")

    # -------------------------------------------------------------
    # 6. Deterministic Arbitration Engine
    # -------------------------------------------------------------
    print("\n[TEST 6/9] Testing Arbitration Engine (MCDM + Solvency Caps)...")
    arb_engine = ArbitrationEngine()
    state = fin_agent.get_system_state(test_biz_id)
    arb_result = arb_engine.arbitrate(inv_recs, state)

    assert isinstance(arb_result, ArbitrationResult)
    assert arb_result.total_cash_allocated <= state.available_cash
    if state.available_cash < HARD_CASH_THRESHOLD:
        assert arb_result.total_cash_allocated <= HARD_RESTOCK_CAP

    print(f" ✓ Arbitration Engine verified: {len(arb_result.approved_recommendations)} approved, {len(arb_result.rejected_recommendations)} deferred. Total allocated: Rs. {arb_result.total_cash_allocated:,.2f}.")

    # -------------------------------------------------------------
    # 7. SHA-256 Cryptographic Audit Trail
    # -------------------------------------------------------------
    print("\n[TEST 7/9] Testing SHA-256 Audit Trail and Tamper Verification...")
    h1 = calculate_decision_hash(
        previous_hash=GENESIS_HASH,
        timestamp="2026-09-07T10:00:00Z",
        business_id=test_biz_id,
        total_allocated_cost=15000.0,
        decision_summary="Approved batch restock",
        execution_tier="AUTO_EXECUTE",
    )
    h2 = calculate_decision_hash(
        previous_hash=h1,
        timestamp="2026-09-07T10:05:00Z",
        business_id=test_biz_id,
        total_allocated_cost=8000.0,
        decision_summary="Approved emergency oil order",
        execution_tier="AUTO_LOG",
    )
    chain = [
        {"id": 1, "previous_hash": GENESIS_HASH, "entry_hash": h1, "timestamp": "2026-09-07T10:00:00Z", "business_id": test_biz_id, "total_allocated_cost": 15000.0, "rationale": "Approved batch restock", "execution_tier": "AUTO_EXECUTE"},
        {"id": 2, "previous_hash": h1, "entry_hash": h2, "timestamp": "2026-09-07T10:05:00Z", "business_id": test_biz_id, "total_allocated_cost": 8000.0, "rationale": "Approved emergency oil order", "execution_tier": "AUTO_LOG"},
    ]
    verification = verify_hash_chain(chain)
    assert verification["is_valid"] is True, "Valid chain should verify successfully"

    # Test tampering detection
    tampered_chain = [
        {"id": 1, "previous_hash": GENESIS_HASH, "entry_hash": h1, "timestamp": "2026-09-07T10:00:00Z", "business_id": test_biz_id, "total_allocated_cost": 15000.0, "rationale": "TAMPERED RATIONALE", "execution_tier": "AUTO_EXECUTE"},
        {"id": 2, "previous_hash": h1, "entry_hash": h2, "timestamp": "2026-09-07T10:05:00Z", "business_id": test_biz_id, "total_allocated_cost": 8000.0, "rationale": "Approved emergency oil order", "execution_tier": "AUTO_LOG"},
    ]
    tamper_result = verify_hash_chain(tampered_chain)
    assert tamper_result["is_valid"] is False, "Tampered entry should be detected"
    print(" ✓ SHA-256 hash chaining and tamper detection verified.")

    # -------------------------------------------------------------
    # 8. Master Multi-Agent Orchestrator Pipeline
    # -------------------------------------------------------------
    print("\n[TEST 8/9] Testing MultiAgentOrchestrator full decision cycle...")
    cycle_out = orchestrator.run_cycle(
        business_id=test_biz_id,
        query="End-of-week liquidity and restock check"
    )
    assert cycle_out["business_id"] == test_biz_id
    assert "arbitration_result" in cycle_out
    assert "action_cards" in cycle_out
    assert "audit_trail" in cycle_out
    assert cycle_out["audit_trail"]["entry_hash"] is not None

    chain_ver = orchestrator.verify_business_audit_trail(test_biz_id)
    assert chain_ver["is_valid"] is True
    print(f" ✓ Orchestrator pipeline verified ({len(cycle_out['action_cards'])} action cards generated, Audit valid: {chain_ver['is_valid']}).")

    # -------------------------------------------------------------
    # 9. FastAPI Route Handlers
    # -------------------------------------------------------------
    print("\n[TEST 9/9] Testing API route handlers (/onboard, /business, /agent-query, /audit-trail, /action/confirm)...")
    onboard_req = OnboardRequest(
        business_name="Gupta Provisions",
        business_type="Retail - Kirana",
        owner_name="Sunil Gupta",
        starting_cash=30000.0,
    )
    onboard_res = onboard(onboard_req)
    assert onboard_res.business_id > 0
    new_biz_id = onboard_res.business_id

    biz_details = get_business_details(new_biz_id)
    assert biz_details["business"]["owner_name"] == "Sunil Gupta"

    query_req = AgentQueryRequest(business_id=new_biz_id, query="Weekly Restock Review")
    query_res = agent_query(query_req)
    assert "decision" in query_res
    assert "action_cards" in query_res

    audit_res = get_audit_trail(new_biz_id)
    assert audit_res["decision_count"] >= 1
    assert audit_res["chain_verification"]["is_valid"] is True

    # Test Action Confirmation - Graceful Failure Simulation
    fail_req = ActionConfirmRequest(
        business_id=new_biz_id,
        card_id="ACT_TEST_FAIL",
        amount=1200.0,
        simulate_failure=True,
    )
    fail_res = confirm_action(fail_req)
    assert fail_res["status"] == "HELD_IN_AUDIT_STATE"
    assert fail_res["deducted_amount"] == 0.0

    # Test Action Confirmation - Successful Execution
    success_req = ActionConfirmRequest(
        business_id=new_biz_id,
        card_id="ACT_TEST_SUCCESS",
        amount=500.0,
        simulate_failure=False,
    )
    success_res = confirm_action(success_req)
    assert success_res["status"] == "EXECUTED"
    assert success_res["amount_disbursed"] == 500.0
    assert "payment_reference" in success_res
    print(" ✓ All API route handlers and failure simulation verified.")

    print("\n" + "=" * 65)
    print(" ALL 9 INTEGRATION TEST MILESTONES PASSED SUCCESSFULLY! ")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
