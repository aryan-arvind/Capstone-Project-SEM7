import os
import json
import sqlite3
import urllib.request
import urllib.parse

BASE_URL = "http://127.0.0.1:8001"
DB_PATH = os.path.join("data", "ingestion_standalone.db")
FILE_A = os.path.join("test_data", "inventory_a.csv")
FILE_B = os.path.join("test_data", "inventory_b.csv")

def run_e2e():
    print("=" * 80)
    print("STEP 1: POST /ingestion/upload (Multi-file upload of inventory_a.csv & inventory_b.csv)")
    print("=" * 80)

    # Multipart form-data payload construction
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = []

    # File A
    with open(FILE_A, "rb") as f:
        content_a = f.read()
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="files"; filename="inventory_a.csv"')
    body.append(b'Content-Type: text/csv')
    body.append(b'')
    body.append(content_a)

    # File B
    with open(FILE_B, "rb") as f:
        content_b = f.read()
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="files"; filename="inventory_b.csv"')
    body.append(b'Content-Type: text/csv')
    body.append(b'')
    body.append(content_b)

    # Business ID
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="business_id"')
    body.append(b'')
    body.append(b'1')
    body.append(f"--{boundary}--".encode())
    body.append(b'')

    payload_bytes = b"\r\n".join(body)

    req = urllib.request.Request(
        f"{BASE_URL}/ingestion/upload",
        data=payload_bytes,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        upload_res = json.loads(resp.read().decode())
        print(json.dumps(upload_res, indent=2))

    batch_ids = [b["import_batch_id"] for b in upload_res["batches"]]

    print("\n" + "=" * 80)
    print(f"STEP 2: POST /ingestion/resolve (Global resolution for batch IDs: {batch_ids})")
    print("=" * 80)

    resolve_data = json.dumps({"import_batch_ids": batch_ids}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/ingestion/resolve",
        data=resolve_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        resolve_res = json.loads(resp.read().decode())
        print(json.dumps(resolve_res, indent=2))

    print("\n" + "=" * 80)
    print(f"STEP 3: POST /ingestion/commit (Committing batch IDs: {batch_ids})")
    print("=" * 80)

    commit_data = json.dumps({"import_batch_ids": batch_ids}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/ingestion/commit",
        data=commit_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req) as resp:
        commit_res = json.loads(resp.read().decode())
        print(json.dumps(commit_res, indent=2))

    print("\n" + "=" * 80)
    print("STEP 4: DIRECT RAW SQLITE QUERY ON data/ingestion_standalone.db")
    print("Query: SELECT item_id, item_name, current_stock, unit_cost FROM inventory_items;")
    print("=" * 80)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT item_id, item_name, current_stock, unit_cost FROM inventory_items;")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()

    print(json.dumps(rows, indent=2))
    print("=" * 80)

if __name__ == "__main__":
    run_e2e()
