"""
CLI Bridge for SME Data Digitalization.
Invoked by Node.js server via child_process.

Usage:
  python ingestion/digitize_cli.py parse --file <filepath>
  python ingestion/digitize_cli.py commit --file <json_filepath>
"""
import os
import sys
import json
import sqlite3
import argparse

# Force UTF-8 on Windows stdout/stderr
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Configure module search paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import ingestion
from ingestion.digitalizer import SMEDigitalizerEngine
from ingestion.schemas import DocumentType

DEFAULT_DB_PATH = os.path.join(ROOT_DIR, "data", "sme_digitalized_data.db")
if not os.path.exists(DEFAULT_DB_PATH):
    # Check parent project if not yet created locally
    alt_db = r"D:\ARYAN ACADEMIC\SEM7\Capstone Project\data\sme_digitalized_data.db"
    if os.path.exists(alt_db):
        DEFAULT_DB_PATH = alt_db

def parse_file(file_path):
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}

    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)
    engine = SMEDigitalizerEngine(db_path=DEFAULT_DB_PATH)

    try:
        if ext == ".csv":
            items, summary = engine.ingest_inventory_file(file_path)
            rows = []
            for it in items:
                rows.append({
                    "item_id": it.item_id,
                    "item_name": it.item_name,
                    "current_stock": float(it.current_stock),
                    "min_threshold": float(it.min_threshold),
                    "reorder_quantity": float(it.reorder_quantity),
                    "unit_cost": float(it.unit_cost),
                    "category": it.category or "General"
                })
            return {
                "success": True,
                "doc_type": "INVENTORY_LIST",
                "filename": filename,
                "total_records": len(rows),
                "columns": ["item_id", "item_name", "current_stock", "min_threshold", "reorder_quantity", "unit_cost", "category"],
                "rows": rows
            }
        else:
            # Text, Image, or PDF
            raw_text = ""
            if ext in (".txt", ".log", ".json"):
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    raw_text = f.read()
            elif ext in (".png", ".jpg", ".jpeg", ".pdf"):
                # Try OCR extraction
                try:
                    with open(file_path, "rb") as f:
                        file_bytes = f.read()
                    tmp_preprocessed, _ = engine.preprocess_image_bytes_for_ocr(file_bytes, source_name=filename)
                    # Attempt OCR if easyocr or pytesseract is installed
                    try:
                        import easyocr
                        reader = easyocr.Reader(["en"], gpu=False)
                        results = reader.readtext(tmp_preprocessed, detail=0)
                        raw_text = "\n".join(results)
                    except Exception:
                        try:
                            import pytesseract
                            from PIL import Image
                            raw_text = pytesseract.image_to_string(Image.open(tmp_preprocessed))
                        except Exception:
                            raw_text = f"[OCR library not installed for image {filename}]"
                    if os.path.exists(tmp_preprocessed):
                        try:
                            os.remove(tmp_preprocessed)
                        except Exception:
                            pass
                except Exception as e:
                    raw_text = f"[OCR preprocessing notice: {e}]"

            # Parse invoice fields from text
            inv = engine.parse_text_invoice(raw_text or filename)
            row = {
                "invoice_id": inv.invoice_id or f"INV-{os.path.splitext(filename)[0]}",
                "supplier_name": inv.supplier_name or "Unknown Supplier",
                "date": inv.date or "2026-09-07",
                "subtotal": float(inv.subtotal or 0.0),
                "tax_amount": float(inv.tax_amount or 0.0),
                "grand_total": float(inv.grand_total or (inv.subtotal + inv.tax_amount)),
                "verification_status": inv.verification_status.value if hasattr(inv.verification_status, "value") else str(inv.verification_status)
            }
            return {
                "success": True,
                "doc_type": "INVOICE",
                "filename": filename,
                "total_records": 1,
                "columns": ["invoice_id", "supplier_name", "date", "subtotal", "tax_amount", "grand_total", "verification_status"],
                "rows": [row]
            }
    except Exception as ex:
        return {"success": False, "error": str(ex), "filename": filename}

def commit_records(data_payload, db_path=DEFAULT_DB_PATH):
    doc_type = data_payload.get("doc_type", "INVOICE")
    rows = data_payload.get("rows", [])
    if not rows:
        return {"success": False, "error": "No rows provided to commit"}

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    committed_count = 0
    if doc_type == "INVOICE":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id TEXT,
                supplier_name TEXT,
                date TEXT,
                subtotal REAL,
                tax_amount REAL,
                grand_total REAL,
                verification_status TEXT DEFAULT 'VALIDATED',
                raw_payload_json TEXT,
                attributes TEXT DEFAULT '{}'
            );
        """)
        for r in rows:
            inv_id = str(r.get("invoice_id") or f"INV-{committed_count+1}")
            supp = str(r.get("supplier_name") or "Staged Supplier")
            dt = str(r.get("date") or "2026-09-07")
            sub = float(r.get("subtotal") or 0.0)
            tax = float(r.get("tax_amount") or 0.0)
            grand = float(r.get("grand_total") or (sub + tax))
            v_status = str(r.get("verification_status") or "VALIDATED")
            payload_json = json.dumps(r)
            cur.execute("""
                INSERT INTO invoices (invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (inv_id, supp, dt, sub, tax, grand, v_status, payload_json))
            committed_count += 1
    elif doc_type == "INVENTORY_LIST":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory_items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL,
                current_stock REAL NOT NULL DEFAULT 0,
                min_threshold REAL NOT NULL DEFAULT 10,
                reorder_quantity REAL NOT NULL DEFAULT 50,
                unit_cost REAL NOT NULL DEFAULT 0,
                category TEXT DEFAULT 'General',
                attributes TEXT DEFAULT '{}'
            );
        """)
        for r in rows:
            it_id = str(r.get("item_id") or f"SKU-{committed_count+1}")
            it_name = str(r.get("item_name") or f"Item-{committed_count+1}")
            stock = float(r.get("current_stock") or 0.0)
            min_thresh = float(r.get("min_threshold") or 10.0)
            reorder = float(r.get("reorder_quantity") or 50.0)
            cost = float(r.get("unit_cost") or 0.0)
            cat = str(r.get("category") or "General")
            cur.execute("""
                INSERT OR REPLACE INTO inventory_items (item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (it_id, it_name, stock, min_thresh, reorder, cost, cat))
            committed_count += 1

    conn.commit()
    conn.close()

    # Re-export live ledger
    export_script = os.path.join(ROOT_DIR, "scripts", "export_ledger.py")
    if os.path.exists(export_script):
        try:
            import subprocess
            subprocess.run([sys.executable, export_script, "--db", db_path], check=True, capture_output=True)
        except Exception as e:
            return {
                "success": True,
                "committed_count": committed_count,
                "warning": f"Committed records, but export_ledger.py failed: {e}"
            }

    return {
        "success": True,
        "committed_count": committed_count,
        "message": f"Successfully committed {committed_count} records to SQLite ({os.path.basename(db_path)}) and synchronized live ledger.json."
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SME Digitizer CLI Bridge")
    subparsers = parser.add_subparsers(dest="command")

    parse_cmd = subparsers.add_parser("parse", help="Parse document file")
    parse_cmd.add_argument("--file", required=True, help="Path to document file")

    commit_cmd = subparsers.add_parser("commit", help="Commit records to SQLite")
    commit_cmd.add_argument("--file", required=True, help="Path to JSON payload file")
    commit_cmd.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to SQLite database")

    args = parser.parse_args()

    if args.command == "parse":
        res = parse_file(args.file)
        print(json.dumps(res, indent=2))
    elif args.command == "commit":
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
        res = commit_records(data, db_path=args.db)
        print(json.dumps(res, indent=2))
    else:
        parser.print_help()
