"""
Live HTTP Integration Verification Script.
Queries http://127.0.0.1:8000 directly over network socket.
"""

import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def test_status():
    print("[1/6] Testing GET /api/agents/status ...")
    req = urllib.request.Request(f"{BASE_URL}/api/agents/status")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        print(f"      Status: {data['status']}, Engine: {data['engine']}")
        assert data["status"] == "healthy"
    print("      PASS: Status endpoint verified.")

def test_live_conflict():
    print("[2/6] Testing POST /api/agents/evaluate (Test 1: Budget Conflict Rs. 50,000 vs Rs. 20,000) ...")
    payload = json.dumps({"bank_cash": 50000.0, "payroll_reserve": 30000.0}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/agents/evaluate",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        inv = data["inventory"]
        fin = data["finance"]
        arb = data["arbitration"]
        print(f"      Inventory Requested: Rs. {inv['requested_amount']:,.2f} for {inv['sku']}")
        print(f"      Finance Budget Ceiling: Rs. {fin['max_spend_allowed']:,.2f}")
        print(f"      Arbitration Decision: {arb['decision']} -> Approved Rs. {arb['approved_amount']:,.2f}")
        print(f"      Conflict Detected: {arb['conflict_detected']}")
        assert inv["requested_amount"] == 50000.0
        assert fin["max_spend_allowed"] == 20000.0
        assert arb["approved_amount"] == 20000.0
        assert arb["conflict_detected"] is True
    print("      PASS: Test 1 Conflict scenario verified over live HTTP.")

def test_live_static_component():
    print("[3/6] Testing GET /static/js/agent_component.js ...")
    req = urllib.request.Request(f"{BASE_URL}/static/js/agent_component.js")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8")
        assert "AgentComponent" in content
        assert "renderInventoryCard" in content
        assert "renderFinanceCard" in content
        assert "renderArbitratedCard" in content
        print(f"      Component Size: {len(content)} bytes")
    print("      PASS: Frontend static component served correctly.")

def test_live_ui_index():
    print("[4/6] Testing GET / (Served index.html) ...")
    req = urllib.request.Request(f"{BASE_URL}/")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8")
        assert "agent_component.js" in content
        print(f"      Index Size: {len(content)} bytes")
    print("      PASS: UI root served and includes agent_component.js.")

def test_live_error_handling():
    print("[5/6] Testing POST /api/agents/evaluate with invalid db_path (Test 5: Error Handling) ...")
    payload = json.dumps({"db_path": "totally_invalid_path_404/missing.db"}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/agents/evaluate",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=5)
        raise AssertionError("Expected HTTP 500 error but request succeeded!")
    except urllib.error.HTTPError as e:
        assert e.code == 500
        body = json.loads(e.read().decode("utf-8"))
        print(f"      Received expected HTTP 500: {body.get('detail')}")
        assert "Agent evaluation pipeline failed" in body.get("detail", "")
    print("      PASS: Test 5 Error handling verified over live HTTP.")

def test_live_decision_log():
    print("[6/6] Verifying SQLite decision_logs table after live calls ...")
    import sqlite3
    conn = sqlite3.connect("data/sme_digitalized_data.db")
    try:
        c = conn.cursor()
        c.execute("SELECT id, timestamp, sku, requested_amount, budget_limit, approved_amount, conflict_detected, decision, reason FROM decision_logs ORDER BY id DESC LIMIT 1")
        row = c.fetchone()
        print(f"      Latest Log ID {row[0]}: SKU={row[2]}, Req=Rs. {row[3]:,}, Budget=Rs. {row[4]:,}, Approved=Rs. {row[5]:,}, Conflict={bool(row[6])}, Decision={row[7]}")
        assert row[3] == 50000.0
        assert row[4] == 20000.0
        assert row[5] == 20000.0
        assert row[6] == 1
        assert row[7] == "APPROVE_CAPPED"
    finally:
        conn.close()
    print("      PASS: SQLite decision logging audit verified.")

if __name__ == "__main__":
    test_status()
    test_live_conflict()
    test_live_static_component()
    test_live_ui_index()
    test_live_error_handling()
    test_live_decision_log()
    print("\nALL 6 LIVE NETWORK INTEGRATION TESTS PASSED!")
