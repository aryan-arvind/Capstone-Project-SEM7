import requests
import json
import sqlite3
import os

BASE_URL = "http://127.0.0.1:8001"
DB_PATH = "data/ingestion_standalone.db"

print("=================================================================")
print("TEST: 3-Tier Domain-Agnostic Ingestion Architecture Verification")
print("=================================================================")

# 1. Upload Synthetic Fashion CSV
print("\n[Step 1] Uploading synthetic_fashion_invoice.csv...")
files = [
    ("files", ("synthetic_fashion_invoice.csv", open("data/synthetic_fashion_invoice.csv", "rb"), "text/csv"))
]
upload_res = requests.post(f"{BASE_URL}/ingestion/upload", files=files)
assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
upload_data = upload_res.json()
batches = upload_data.get("batches", [])
assert len(batches) == 1, "Expected 1 batch uploaded"
batch_id = batches[0]["import_batch_id"]
print(f"Uploaded successfully as Batch #{batch_id}")

# 2. Call /ingestion/resolve
print(f"\n[Step 2] Resolving Batch #{batch_id}...")
resolve_res = requests.post(f"{BASE_URL}/ingestion/resolve", json={"import_batch_ids": [batch_id]})
assert resolve_res.status_code == 200, f"Resolve failed: {resolve_res.text}"
resolve_data = resolve_res.json()

detected_vertical = resolve_data.get("batch_verticals", {}).get(str(batch_id)) or resolve_data.get("batch_verticals", {}).get(batch_id)
print(f"Authoritative Detected Vertical: '{detected_vertical}'")

# Check unified preview mappings
unified = resolve_data.get("unified_preview", [])
headers_mapped = {}
for item in unified:
    headers_mapped[item["original_header"]] = item["mapped_field"]

print("\nResolved Header Mapping:")
for raw_col, mapped in sorted(headers_mapped.items()):
    print(f"  {raw_col:<20} -> {mapped}")

# ── ASSERTION A: Non-obvious HSN header resolved to core canonical hsn_sac ──
assert headers_mapped.get("Tariff Code") == "hsn_sac", (
    f"Expected 'Tariff Code' to resolve to 'hsn_sac', got {headers_mapped.get('Tariff Code')}"
)
print("[PASS] Assertion A: 'Tariff Code' resolved to core canonical 'hsn_sac'")

# ── ASSERTION B: Detected Vertical inferred as 'fashion' via majority HSN vote ──
assert detected_vertical == "fashion", (
    f"Expected detected_vertical to be 'fashion' from HSN Chapter 61, got '{detected_vertical}'"
)
print("[PASS] Assertion B: Batch vertical correctly identified as 'fashion' via majority HSN Chapter 61 vote")

# ── ASSERTION C: Extension fields resolved into DOMAIN_EXTENSIONS['fashion'] ──
assert headers_mapped.get("Fabric") == "material", f"Expected 'Fabric' -> 'material', got {headers_mapped.get('Fabric')}"
assert headers_mapped.get("Size") == "size", f"Expected 'Size' -> 'size', got {headers_mapped.get('Size')}"
assert headers_mapped.get("Colour") == "color", f"Expected 'Colour' -> 'color', got {headers_mapped.get('Colour')}"
assert headers_mapped.get("Season") == "season", f"Expected 'Season' -> 'season', got {headers_mapped.get('Season')}"
print("[PASS] Assertion C: Fashion extension fields ('Fabric'->material, 'Size'->size, 'Colour'->color, 'Season'->season) resolved via Tier 2")

# ── ASSERTION D: Catch-all attribute resolved with attr: prefix ──
assert headers_mapped.get("Loom Number") == "attr:loom_number", (
    f"Expected 'Loom Number' -> 'attr:loom_number', got {headers_mapped.get('Loom Number')}"
)
print("[PASS] Assertion D: Weird column 'Loom Number' resolved as catch-all 'attr:loom_number'")

# ── ASSERTION E: Noise filter rejected pure punctuation garbage header ──
assert headers_mapped.get("###---###") is None, (
    f"Expected noise column '###---###' to be excluded (None), got {headers_mapped.get('###---###')}"
)
print("[PASS] Assertion E: Noise column '###---###' successfully filtered out by alphanumeric guard")

# 3. Commit the batch
print(f"\n[Step 3] Committing Batch #{batch_id} to operational tables...")
commit_res = requests.post(f"{BASE_URL}/ingestion/commit", json={"import_batch_ids": [batch_id]})
assert commit_res.status_code == 200, f"Commit failed: {commit_res.text}"
commit_data = commit_res.json()
print(f"Commit response: {commit_data}")

# 4. Directly query database tables
print("\n[Step 4] Querying Production SQLite DB (data/ingestion_standalone.db)...")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Verify import_batch.detected_vertical
cursor.execute("SELECT id, detected_vertical, status FROM import_batch WHERE id = ?", (batch_id,))
batch_row = cursor.fetchone()
print(f"import_batch row: id={batch_row[0]}, detected_vertical='{batch_row[1]}', status='{batch_row[2]}'")
assert batch_row[1] == "fashion", f"Expected import_batch.detected_vertical == 'fashion', got '{batch_row[1]}'"
print("[PASS] Database Assertion: import_batch.detected_vertical successfully persisted as 'fashion'")

# Verify invoices table rows and attributes JSON
cursor.execute("SELECT id, invoice_id, supplier_name, date, grand_total, attributes FROM invoices WHERE invoice_id LIKE 'FASH-2026%' ORDER BY id ASC")
rows = cursor.fetchall()
print(f"\nCommitted {len(rows)} fashion invoice records into 'invoices' table:")
assert len(rows) == 2, f"Expected 2 rows committed, found {len(rows)}"

for idx, r in enumerate(rows, 1):
    inv_db_id, inv_no, supp, dt, total, attrs_json = r
    print(f"\n--- Invoice Record #{idx} (DB id={inv_db_id}) ---")
    print(f"  invoice_id: {inv_no}")
    print(f"  supplier_name: {supp}")
    print(f"  date: {dt}")
    print(f"  grand_total: {total}")
    print(f"  attributes JSON string: {attrs_json}")
    
    attrs = json.loads(attrs_json)
    
    # ── CRITICAL ASSERTION: BOTH catch-all AND extension fields must exist in attributes JSON ──
    assert "loom_number" in attrs, f"Catch-all 'loom_number' missing from committed attributes JSON: {attrs}"
    assert "material" in attrs, f"Extension field 'material' missing from committed attributes JSON: {attrs}"
    assert "size" in attrs, f"Extension field 'size' missing from committed attributes JSON: {attrs}"
    assert "color" in attrs, f"Extension field 'color' missing from committed attributes JSON: {attrs}"
    assert "season" in attrs, f"Extension field 'season' missing from committed attributes JSON: {attrs}"
    assert "###---###" not in attrs and "noise" not in str(attrs), "Garbage noise value leaked into attributes JSON!"
    
    print(f"  [PASS] Verified attributes contents for row #{idx}:")
    print(f"      - Catch-all field: loom_number='{attrs['loom_number']}'")
    print(f"      - Extension field: material='{attrs['material']}'")
    print(f"      - Extension field: size='{attrs['size']}'")
    print(f"      - Extension field: color='{attrs['color']}'")
    print(f"      - Extension field: season='{attrs['season']}'")

conn.close()

print("\n=================================================================")
print("ALL ASSERTIONS PASSED! 3-Tier Architecture is 100% Verified.")
print("=================================================================")
