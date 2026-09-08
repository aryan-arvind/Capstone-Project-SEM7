import os
import json
import sqlite3
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np
import logging

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_csv_data(filepath):
    """
    Utility function to load CSV data and perform basic validation.
    """
    try:
        logger.info(f"Attempting to load data from {filepath}...")
        df = pd.read_csv(filepath)
        logger.info(f"Data loaded successfully. Shape: {df.shape}")
        
        # Basic data cleaning: strip whitespace from column names
        df.columns = df.columns.str.strip()
        
        return df
    except FileNotFoundError:
        logger.error(f"File not found: {filepath}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error loading data: {e}")
        return None

def get_basic_stats(df):
    """
    Returns basic descriptive statistics for the numerical columns.
    """
    if df is not None and not df.empty:
        return df.describe()
    return None


def load_financial_sample_dataframe(csv_path: Optional[str] = None) -> pd.DataFrame:
    """
    Loads and standardizes the user-provided Financial Sample sales dataset.
    """
    from src.data_cleaning import load_clean_financial_sample
    return load_clean_financial_sample(csv_path)


def resolve_ingestion_db_path(custom_path: Optional[str] = None) -> str:
    """
    Resolves the SQLite database path according to the Data Digitalization & Ingestion contract:
      1. Primary SQLite DB: data/ingestion_standalone.db
      2. Fallback / Shared DB: data/capstone.db
      3. Legacy fallback: data/sme_digitalized_data.db
    """
    if custom_path and custom_path.strip() and custom_path.strip().lower() != "string":
        if os.path.exists(custom_path):
            return os.path.abspath(custom_path)

    project_data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

    # Strict contract priority:
    # 1. Primary: data/ingestion_standalone.db
    # 2. Fallback / Shared: data/capstone.db
    # 3. Legacy: data/sme_digitalized_data.db
    filenames = [
        "ingestion_standalone.db",
        "capstone.db",
        "sme_digitalized_data.db",
    ]

    for fname in filenames:
        cwd_cand = os.path.join("data", fname)
        if os.path.exists(cwd_cand):
            return os.path.abspath(cwd_cand)
        proj_cand = os.path.join(project_data_dir, fname)
        if os.path.exists(proj_cand):
            return os.path.abspath(proj_cand)

    # If neither exists yet, default to Primary DB location in project data directory
    return os.path.abspath(os.path.join(project_data_dir, "ingestion_standalone.db"))


def init_ingestion_standalone_db(db_path: Optional[str] = None) -> str:
    """
    Initializes the primary standalone ingestion database (data/ingestion_standalone.db)
    with the exact DDL schema and committed operational seed records matching the contract.
    """
    if not db_path:
        project_data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
        db_path = os.path.join(project_data_dir, "ingestion_standalone.db")

    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        # 1. Create invoices table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id TEXT NOT NULL,
                supplier_name TEXT NOT NULL,
                date TEXT NOT NULL,
                subtotal REAL NOT NULL,
                tax_amount REAL NOT NULL,
                grand_total REAL NOT NULL,
                verification_status TEXT NOT NULL,
                raw_payload_json TEXT NOT NULL
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(verification_status);")

        # 2. Create inventory_items table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS inventory_items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL,
                current_stock REAL NOT NULL,
                min_threshold REAL NOT NULL,
                reorder_quantity REAL NOT NULL,
                unit_cost REAL NOT NULL,
                category TEXT
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);")

        # Seed inventory_items if empty
        cursor.execute("SELECT COUNT(*) FROM inventory_items")
        if cursor.fetchone()[0] == 0:
            cursor.executemany("""
                INSERT INTO inventory_items (item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                ("SKU-1001", "4U Rack 500 D", 4.0, 10.0, 15.0, 2500.0, "Hardware"),
                ("SKU-001", "Industrial Bearing Model X", 5.0, 20.0, 50.0, 1000.0, "Mechanical"),
                ("SKU-002", "High-Temp Synthetic Lubricant", 60.0, 30.0, 40.0, 250.0, "Consumables"),
                ("SKU-003", "Hydraulic Seal Ring", 45.0, 40.0, 100.0, 120.0, "Mechanical"),
            ])

        # Seed invoices if empty
        cursor.execute("SELECT COUNT(*) FROM invoices")
        if cursor.fetchone()[0] == 0:
            sample_invoices = [
                (
                    "1410515599",
                    "Dell International Services India Pvt. Ltd.",
                    "2024-01-15",
                    150000.0,
                    27000.0,
                    177000.0,
                    "VALIDATED",
                    json.dumps({
                        "supplier_gstin": "29AABCD1234E1Z5",
                        "customer_gstin": "27AAACW1234P1Z1",
                        "po_number": "PO-2024-0891",
                        "payment_terms": "Net 30",
                        "item_name": "PowerEdge Server R750",
                        "quantity": 1.0,
                        "unit_price": 150000.0,
                        "tax_rate_pct": 18.0,
                        "document_text": "Dell invoice 1410515599 dated 2024-01-15 for PowerEdge Server R750",
                    })
                ),
                (
                    "INV-2024-002",
                    "Apex Industrial Supplies Ltd.",
                    "2024-01-20",
                    50000.0,
                    9000.0,
                    59000.0,
                    "VALIDATED",
                    json.dumps({
                        "supplier_gstin": "07AAACR4567B1Z2",
                        "customer_gstin": "27AAACW1234P1Z1",
                        "po_number": "PO-2024-0892",
                        "payment_terms": "Immediate",
                        "item_name": "Industrial Bearing Model X",
                        "quantity": 50.0,
                        "unit_price": 1000.0,
                        "tax_rate_pct": 18.0,
                        "document_text": "Apex Industrial Supplies Invoice INV-2024-002",
                    })
                ),
            ]
            cursor.executemany("""
                INSERT INTO invoices (invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, sample_invoices)

        conn.commit()
    finally:
        conn.close()

    return os.path.abspath(db_path)


def parse_invoice_payload(raw_payload_json: Any) -> Dict[str, Any]:
    """
    Parses and normalizes raw JSON payload from an invoice record into
    the schema contract dictionary.
    """
    if not raw_payload_json:
        return {}
    if isinstance(raw_payload_json, dict):
        return raw_payload_json
    try:
        data = json.loads(raw_payload_json)
        if isinstance(data, dict):
            return data
    except Exception as e:
        logger.warning(f"Failed to parse invoice raw_payload_json: {e}")
    return {}


def get_digitalized_inventory(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Queries committed operational inventory records from the resolved SQLite database.
    Guarantees typed dictionary output matching the contract.
    """
    resolved_db = resolve_ingestion_db_path(db_path)
    if not os.path.exists(resolved_db):
        return []

    items = []
    conn = None
    try:
        conn = sqlite3.connect(resolved_db)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_items'")
        if not cursor.fetchone():
            return []
        cursor.execute("""
            SELECT item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category
            FROM inventory_items
            ORDER BY item_id ASC
        """)
        for r in cursor.fetchall():
            items.append({
                "item_id": str(r["item_id"]),
                "item_name": str(r["item_name"]),
                "current_stock": float(r["current_stock"]),
                "min_threshold": float(r["min_threshold"]),
                "reorder_quantity": float(r["reorder_quantity"]),
                "unit_cost": float(r["unit_cost"]),
                "category": str(r["category"] or "General"),
            })
    except Exception as e:
        logger.error(f"Error querying inventory_items from {resolved_db}: {e}")
    finally:
        if conn:
            conn.close()
    return items


def get_digitalized_invoices(
    db_path: Optional[str] = None,
    verification_status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Queries committed operational invoice records from the resolved SQLite database.
    Guarantees typed dictionary output matching the contract.
    """
    resolved_db = resolve_ingestion_db_path(db_path)
    if not os.path.exists(resolved_db):
        return []

    invoices = []
    conn = None
    try:
        conn = sqlite3.connect(resolved_db)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'")
        if not cursor.fetchone():
            return []

        if verification_status:
            cursor.execute("""
                SELECT id, invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json
                FROM invoices
                WHERE verification_status = ?
                ORDER BY id ASC
            """, (verification_status,))
        else:
            cursor.execute("""
                SELECT id, invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status, raw_payload_json
                FROM invoices
                ORDER BY id ASC
            """)

        for r in cursor.fetchall():
            raw_json = r["raw_payload_json"] or "{}"
            invoices.append({
                "id": int(r["id"]),
                "invoice_id": str(r["invoice_id"]),
                "supplier_name": str(r["supplier_name"]),
                "date": str(r["date"]),
                "subtotal": float(r["subtotal"]),
                "tax_amount": float(r["tax_amount"]),
                "grand_total": float(r["grand_total"]),
                "verification_status": str(r["verification_status"]),
                "raw_payload_json": str(raw_json),
            })
    except Exception as e:
        logger.error(f"Error querying invoices from {resolved_db}: {e}")
    finally:
        if conn:
            conn.close()
    return invoices


def get_digitalized_business_context(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Data Loader Interface (Data Ingestion Contract):
    Extracts committed operational records:
      - inventory_items: stock master records
      - invoices: verified invoices (digital PDFs, OCR images, CSVs)
    """
    resolved_db = resolve_ingestion_db_path(db_path)
    inventory = get_digitalized_inventory(resolved_db)
    invoices = get_digitalized_invoices(resolved_db)

    return {
        "inventory_items": inventory,
        "invoices": invoices,
        "db_source": resolved_db
    }


if __name__ == "__main__":
    logger.info("Data loader module initialized. Ready for ingestion.")
    ctx = get_digitalized_business_context()
    logger.info(f"Loaded {len(ctx['inventory_items'])} inventory items and {len(ctx['invoices'])} invoices from {ctx['db_source']}.")
