import requests
import json
import sqlite3

BASE_URL = "http://127.0.0.1:8001"
DB_PATH = "data/ingestion_standalone.db"

# 1. Reset invoices table in standalone DB with new schema
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("DROP TABLE IF EXISTS invoices")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT,
        supplier_name TEXT,
        date TEXT,
        subtotal REAL,
        tax_amount REAL,
        grand_total REAL,
        verification_status TEXT DEFAULT 'VALIDATED',
        raw_payload_json TEXT
    );
""")
cursor.execute("UPDATE staged_records SET committed = 0 WHERE import_batch_id IN (4, 5, 6)")
conn.commit()
conn.close()

# 2. Call /ingestion/resolve on batches 4, 5, 6
batch_ids = [4, 5, 6]
print("--- 1. Calling /ingestion/resolve for Batches [4, 5, 6] ---")
resolve_res = requests.post(f"{BASE_URL}/ingestion/resolve", json={"import_batch_ids": batch_ids})
assert resolve_res.status_code == 200, f"Resolve failed: {resolve_res.text}"
resolve_data = resolve_res.json()

# Collect resolution details
records = {}
for item in resolve_data.get("unified_preview", []):
    rec_id = item["staged_record_id"]
    if rec_id not in records:
        records[rec_id] = {
            "batch_id": item["import_batch_id"],
            "status": item["validation_status"],
            "notes": item["validation_notes"],
            "fields": {}
        }
    records[rec_id]["fields"][item["original_header"]] = {
        "mapped_field": item["mapped_field"],
        "value": item["value"],
        "confidence": item["confidence"],
        "needs_review": item["needs_manual_review"]
    }

print("\n--- RESOLUTION TABLE BY RECORD ---")
for rec_id, rec in sorted(records.items()):
    print(f"\n=======================================================")
    print(f"Record #{rec_id} | Import Batch #{rec['batch_id']} | Status: {rec['status']}")
    print(f"Notes: {rec['notes']}")
    print(f"-------------------------------------------------------")
    print(f"{'Original Header':<22} | {'Mapped Field':<18} | {'Value'}")
    print(f"-------------------------------------------------------")
    for col, meta in rec["fields"].items():
        v = str(meta['value'])
        if col == "document_text":
            v = v[:50].replace('\n', ' ') + "..."
        elif len(v) > 40:
            v = v[:37] + "..."
        print(f"{col:<22} | {str(meta['mapped_field']):<18} | {v}")

# 3. Unmapped columns verification
all_headers = {}
for item in resolve_data.get("unified_preview", []):
    all_headers[item["original_header"]] = item["mapped_field"]

system_cols = {"document_text", "verification_status", "[system]"}
unmapped = [c for c, m in all_headers.items() if m is None and c not in system_cols]
print(f"\n=======================================================")
print(f"Unmapped columns count: {len(unmapped)}")
print(f"Unmapped columns list: {unmapped}")
print(f"=======================================================")

# 4. Call /ingestion/commit
print("\n--- 2. Calling /ingestion/commit for Batches [4, 5, 6] ---")
commit_res = requests.post(f"{BASE_URL}/ingestion/commit", json={"import_batch_ids": batch_ids})
print("Commit status:", commit_res.status_code)
print("Commit response:", commit_res.json())

# 5. Direct DB Query
print("\n--- 3. Direct Query from Production DB: table 'invoices' ---")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT * FROM invoices ORDER BY id ASC")
cols = [desc[0] for desc in cursor.description]
rows = cursor.fetchall()
print(f"Total Rows in 'invoices': {len(rows)}")

for idx, r in enumerate(rows, 1):
    row_dict = dict(zip(cols, r))
    print(f"\n--- Committed Row #{idx} (DB id={row_dict['id']}) ---")
    for k, v in row_dict.items():
        if k == "raw_payload_json":
            # show that structured fields are in the payload
            payload = json.loads(v)
            print(f"  {k}: [JSON keys: {list(payload.keys())}]")
        else:
            print(f"  {k}: {v}")
conn.close()
