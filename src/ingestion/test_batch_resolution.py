import requests
import json
import sqlite3
import os

BASE_URL = "http://127.0.0.1:8001"

existing_batches = []
try:
    conn_check = sqlite3.connect("data/ingestion_standalone.db")
    c_check = conn_check.cursor()
    c_check.execute("SELECT id FROM import_batch")
    existing_batches = [r[0] for r in c_check.fetchall()]
    conn_check.close()
except Exception as e:
    pass

if existing_batches:
    print(f"Using existing batches in database: {existing_batches}")
    batch_ids = existing_batches
else:
    print("--- 1. Uploading 3 files ---")
    files = [
        ("files", ("invoices_dataset.csv", open("data/invoices_dataset.csv", "rb"), "text/csv")),
        ("files", ("invoice_dell_international.jpg", open("data/invoice_dell_international.jpg", "rb"), "image/jpeg")),
        ("files", ("invoice_vigil_safety.jpg", open("data/invoice_vigil_safety.jpg", "rb"), "image/jpeg"))
    ]
    res = requests.post(f"{BASE_URL}/ingestion/upload", files=files)
    print("Upload status:", res.status_code)
    upload_data = res.json()
    batch_ids = [b["import_batch_id"] for b in upload_data.get("batches", [])]
print("Batch IDs to resolve/commit:", batch_ids)

print("\n--- 2. Calling /ingestion/resolve ---")
resolve_res = requests.post(f"{BASE_URL}/ingestion/resolve", json={"import_batch_ids": batch_ids})
print("Resolve status:", resolve_res.status_code)
resolve_data = resolve_res.json()

# Inspect resolution items by staged_record_id
records_by_id = {}
for item in resolve_data.get("unified_preview", []):
    rec_id = item["staged_record_id"]
    if rec_id not in records_by_id:
        records_by_id[rec_id] = {
            "batch_id": item["import_batch_id"],
            "status": item["validation_status"],
            "notes": item["validation_notes"],
            "fields": {}
        }
    records_by_id[rec_id]["fields"][item["original_header"]] = {
        "mapped_field": item["mapped_field"],
        "value": item["value"],
        "confidence": item["confidence"],
        "needs_review": item["needs_manual_review"]
    }

print(f"\nTotal staged records resolved: {len(records_by_id)}")
for rec_id, rec in sorted(records_by_id.items()):
    print(f"\nRecord #{rec_id} (Batch {rec['batch_id']}) Status: {rec['status']}")
    print(f"Notes: {rec['notes']}")
    for col, meta in rec["fields"].items():
        if col == "document_text":
            val_snippet = (str(meta["value"])[:60] + "...") if meta["value"] else "None"
            print(f"  - {col} -> {meta['mapped_field']}: {val_snippet}")
        else:
            print(f"  - {col} -> {meta['mapped_field']}: {meta['value']}")

# Check unmapped columns count
all_headers = {}
for item in resolve_data.get("unified_preview", []):
    col = item["original_header"]
    mapped = item["mapped_field"]
    all_headers[col] = mapped

system_cols = {"document_text", "verification_status", "[system]"}
unmapped = [c for c, m in all_headers.items() if m is None and c not in system_cols]
print(f"\nUnmapped columns count: {len(unmapped)} (Unmapped list: {unmapped})")

print("\n--- 3. Calling /ingestion/commit ---")
commit_res = requests.post(f"{BASE_URL}/ingestion/commit", json={"import_batch_ids": batch_ids})
print("Commit status:", commit_res.status_code)
print("Commit response:", commit_res.json())

print("\n--- 4. Directly Querying Production Database (data/ingestion_standalone.db) ---")
conn = sqlite3.connect("data/ingestion_standalone.db")
cursor = conn.cursor()

# Check tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"Tables in DB: {tables}")

# Query invoices table
cursor.execute("SELECT * FROM invoices")
cols = [desc[0] for desc in cursor.description]
rows = cursor.fetchall()
print(f"\nInvoices Table ({len(rows)} rows):")
print(f"Columns: {cols}")
for idx, r in enumerate(rows, 1):
    row_dict = dict(zip(cols, r))
    # print cleanly without huge raw_payload_json
    print(f"\nRow #{idx}:")
    for k, v in row_dict.items():
        if k == "raw_payload_json":
            print(f"  {k}: {str(v)[:100]}...")
        else:
            print(f"  {k}: {v}")

# Query inventory_items table
cursor.execute("SELECT * FROM inventory_items")
inv_cols = [desc[0] for desc in cursor.description]
inv_rows = cursor.fetchall()
print(f"\nInventory Items Table ({len(inv_rows)} rows):")
for idx, r in enumerate(inv_rows, 1):
    print(f"  Row #{idx}: {dict(zip(inv_cols, r))}")

conn.close()
