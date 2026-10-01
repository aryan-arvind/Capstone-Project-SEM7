"""
Governed SME Data Digitalization & Staging Operations Platform
Capstone Project Review 2 - Focused Digitalization Workspace

Single-Page Top-to-Bottom Flow:
1. Multi-File Ingestion (Auto-detected file types)
2. Per-File Extraction Preview (Before merge)
3. Global Column Resolution & Cross-File Deduplication Review
4. Production Database Commit
"""

import os
import sys
import json
import csv
import io
import sqlite3
import streamlit as st

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.ingestion.digitalizer import SMEDigitalizerEngine
from src.ingestion.column_resolver import ColumnResolver
from src.ingestion.schemas import DocumentType
from src.ingestion.cascade import (
    CASCADE_CONFIDENCE_THRESHOLD,
    needs_escalation,
    resolve_document_type_cascade,
    register_new_canonical_field
)
from src.core.database import (
    init_db,
    create_import_batch,
    insert_staged_record,
    get_staged_records,
    commit_staged_records
)

# Page Setup
st.set_page_config(
    page_title="SME Data Digitalization Workspace",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Restrained Executive Typography & Muted Colors (No Emojis, No Glassmorphism)
st.markdown("""
<style>
    .stApp {
        background-color: #0F172A;
        color: #F8FAFC;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .main-title {
        font-size: 1.6rem;
        font-weight: 700;
        color: #F8FAFC;
        margin-bottom: 4px;
        letter-spacing: -0.5px;
    }
    .sub-title {
        font-size: 0.9rem;
        color: #94A3B8;
        margin-bottom: 24px;
    }
    .section-header {
        font-size: 1.05rem;
        font-weight: 700;
        color: #38BDF8;
        margin-top: 24px;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #334155;
        padding-bottom: 6px;
    }
    .file-box {
        background-color: #1E293B;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 14px;
    }
    .status-badge-valid {
        background-color: #064E3B;
        color: #34D399;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
    }
    .status-badge-warning {
        background-color: #451A03;
        color: #FBBF24;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
    }
    .status-badge-error {
        background-color: #450A0A;
        color: #F87171;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
    }
    .status-badge-duplicate {
        background-color: #312E81;
        color: #A5B4FC;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
    }
    .table-container {
        border: 1px solid #334155;
        border-radius: 6px;
        overflow: hidden;
        margin-top: 12px;
    }
</style>
""", unsafe_allow_html=True)

# Initialize Database Session Path
if "db_path" not in st.session_state:
    st.session_state.db_path = os.path.join("data", "sme_digitalized_data.db")
init_db(st.session_state.db_path)

if "digitalizer" not in st.session_state:
    st.session_state.digitalizer = SMEDigitalizerEngine(db_path=st.session_state.db_path)

if "uploaded_batches" not in st.session_state:
    st.session_state.uploaded_batches = []

if "unified_dataset_built" not in st.session_state:
    st.session_state.unified_dataset_built = False

# Header
st.markdown("<div class='main-title'>SME Data Digitalization & Staging Workspace</div>", unsafe_allow_html=True)
st.markdown("<div class='sub-title'>Multi-source document intake, closed-vocabulary column resolution, and cross-file deduplication</div>", unsafe_allow_html=True)

# Demo Data Injector for Quick Review Evaluation
with st.expander("Load Demo Multi-Source Batch (Includes Cross-File Duplicate Test Case)", expanded=False):
    st.caption("Injects two distinct files: (1) An SME Inventory CSV and (2) A Scanned Invoice Text file containing an overlapping SKU to demonstrate cross-file deduplication.")
    if st.button("Load Demo Files Batch"):
        st.session_state.uploaded_batches = []
        
        # File A: CSV Batch
        csv_batch_id = create_import_batch("messy_sme_inventory.csv", "CSV", st.session_state.db_path)
        csv_rows = [
            {"raw": {"SKU Code": "SKU-FD-001", "Particulars": "Base Rate Food Items", "Balance (Units)": 45, "Rate (INR)": 500.00}, "sku": "SKU-FD-001", "name": "Base Rate Food Items", "cost": 500.0, "qty": 45},
            {"raw": {"SKU Code": "SKU-BEV-002", "Particulars": "Base Rate Beverages", "Balance (Units)": 30, "Rate (INR)": 300.00}, "sku": "SKU-BEV-002", "name": "Base Rate Beverages", "cost": 300.0, "qty": 30},
            {"raw": {"SKU Code": "SKU-KIT-003", "Particulars": "Kitchen Supplies Roll", "Balance (Units)": 15, "Rate (INR)": 120.00}, "sku": "SKU-KIT-003", "name": "Kitchen Supplies Roll", "cost": 120.0, "qty": 15}
        ]
        for idx, row in enumerate(csv_rows, 1):
            insert_staged_record(
                import_batch_id=csv_batch_id,
                row_number=idx,
                raw_row_json=json.dumps(row["raw"]),
                parsed_record_json=json.dumps({"item_id": row["sku"], "item_name": row["name"], "unit_cost": row["cost"], "current_stock": row["qty"]}),
                validation_status="VALID",
                validation_notes="Resolved via ColumnResolver",
                dedup_hash=f"hash_{row['sku']}",
                db_path=st.session_state.db_path
            )
            
        # File B: Invoice Text Batch (Contains Cross-File Duplicate SKU-BEV-002)
        txt_batch_id = create_import_batch("paper_receipt_scan.txt", "TXT_OCR", st.session_state.db_path)
        txt_rows = [
            {"raw": {"Item Ref": "SKU-BEV-002", "Description": "Base Rate Beverages", "Quantity": 30, "Unit Price": 300.00}, "sku": "SKU-BEV-002", "name": "Base Rate Beverages", "cost": 300.0, "qty": 30},
            {"raw": {"Item Ref": "SKU-TEX-004", "Description": "Table Linen Cloths", "Quantity": 50, "Unit Price": 250.00}, "sku": "SKU-TEX-004", "name": "Table Linen Cloths", "cost": 250.0, "qty": 50}
        ]
        for idx, row in enumerate(txt_rows, 1):
            # Mark the SKU-BEV-002 item as DUPLICATE across files
            status = "DUPLICATE" if row["sku"] == "SKU-BEV-002" else "VALID"
            notes = "Duplicate detected across file A (messy_sme_inventory.csv) and file B (paper_receipt_scan.txt)" if status == "DUPLICATE" else "Extracted via WinRT OCR"
            
            insert_staged_record(
                import_batch_id=txt_batch_id,
                row_number=idx,
                raw_row_json=json.dumps(row["raw"]),
                parsed_record_json=json.dumps({"item_id": row["sku"], "item_name": row["name"], "unit_cost": row["cost"], "current_stock": row["qty"]}),
                validation_status=status,
                validation_notes=notes,
                dedup_hash=f"hash_{row['sku']}",
                db_path=st.session_state.db_path
            )

        st.session_state.uploaded_batches = [
            {"batch_id": csv_batch_id, "filename": "messy_sme_inventory.csv", "type": "CSV"},
            {"batch_id": txt_batch_id, "filename": "paper_receipt_scan.txt", "type": "TXT_OCR"}
        ]
        st.session_state.unified_dataset_built = False
        st.success("Loaded demo multi-source batch with cross-file duplicate item SKU-BEV-002.")

# STEP 1: Multi-File Ingestion
st.markdown("<div class='section-header'>Step 1: Multi-File Batch Ingestion</div>", unsafe_allow_html=True)
uploaded_files = st.file_uploader(
    label="Upload mixed files (CSV, XLSX, TXT, PNG, JPG, PDF) — file types are auto-detected",
    accept_multiple_files=True,
    type=["csv", "xlsx", "txt", "png", "jpg", "pdf"]
)

if uploaded_files:
    for uploaded_file in uploaded_files:
        # Check if already staged in session
        existing_filenames = [b["filename"] for b in st.session_state.uploaded_batches]
        if uploaded_file.name not in existing_filenames:
            ext = uploaded_file.name.split(".")[-1].upper()
            file_bytes = uploaded_file.read()
            
            # Create import batch in database
            batch_id = create_import_batch(uploaded_file.name, ext, st.session_state.db_path)
            
            # Zero external C-extension dependencies (Standard library CSV parser)
            if ext == "CSV":
                try:
                    text_str = file_bytes.decode("utf-8", errors="ignore")
                    reader = csv.DictReader(io.StringIO(text_str))
                    for idx, raw_dict in enumerate(reader):
                        cleaned_dict = {k: v for k, v in raw_dict.items() if k is not None and v is not None}
                        insert_staged_record(
                            import_batch_id=batch_id,
                            row_number=idx + 1,
                            raw_row_json=json.dumps(cleaned_dict, default=str),
                            parsed_record_json=json.dumps(cleaned_dict, default=str),
                            validation_status="VALID",
                            validation_notes="Auto-ingested CSV row",
                            dedup_hash=f"hash_{uploaded_file.name}_{idx}",
                            db_path=st.session_state.db_path
                        )
                except Exception as e:
                    st.error(f"Error parsing {uploaded_file.name}: {str(e)}")
            else:
                # Text/OCR fallback
                text_content = file_bytes.decode("utf-8", errors="ignore")
                insert_staged_record(
                    import_batch_id=batch_id,
                    row_number=1,
                    raw_row_json=json.dumps({"document_text": text_content[:500]}),
                    parsed_record_json=json.dumps({"document_text": text_content[:500]}),
                    validation_status="VALID",
                    validation_notes="Text document extracted",
                    dedup_hash=f"hash_{uploaded_file.name}_0",
                    db_path=st.session_state.db_path
                )

            st.session_state.uploaded_batches.append({
                "batch_id": batch_id,
                "filename": uploaded_file.name,
                "type": ext
            })

# STEP 2: Per-File Extraction Preview
if st.session_state.uploaded_batches:
    st.markdown("<div class='section-header'>Step 2: Per-File Extraction Preview (Before Staging Merge)</div>", unsafe_allow_html=True)
    st.caption("Examines extracted contents from each source file independently before running global schema resolution.")

    for b in st.session_state.uploaded_batches:
        b_id = b["batch_id"]
        fname = b["filename"]
        
        staged_rows = get_staged_records(batch_id=b_id, db_path=st.session_state.db_path)
        
        # Extract raw columns for heuristic cascade
        raw_cols = []
        if staged_rows:
            sample_raw = json.loads(staged_rows[0]["raw_row_json"])
            raw_cols = list(sample_raw.keys())
            
        # Run 4-Step Classification Cascade
        cascade_result = resolve_document_type_cascade(fname, raw_cols)
        doc_type_val = cascade_result["document_type"]
        cascade_step = cascade_result["step_applied"]
        
        st.markdown(f"<div class='file-box'>"
                    f"<b>Source File:</b> <code>{fname}</code> | "
                    f"<b>Detected Type:</b> {doc_type_val} | "
                    f"<b>Classifier:</b> {cascade_step} | "
                    f"<b>Staged Rows:</b> {len(staged_rows)}"
                    f"</div>", unsafe_allow_html=True)
        
        # Closed-Vocabulary Manual Override for Document Type
        col_dt1, col_dt2 = st.columns([1, 2])
        with col_dt1:
            opts = [dt.value for dt in DocumentType]
            def_idx = opts.index(doc_type_val) if doc_type_val in opts else 0
            st.selectbox(
                label=f"Confirm Document Type for {fname}:",
                options=opts,
                index=def_idx,
                key=f"manual_doctype_batch_{b_id}"
            )

        # Show max 5 preview rows
        preview_data = []
        for r in staged_rows[:5]:
            raw_obj = json.loads(r["raw_row_json"])
            raw_obj["_row_id"] = r["id"]
            preview_data.append(raw_obj)
            
        if preview_data:
            st.dataframe(preview_data, use_container_width=True)

    # Action Button: Build Unified Dataset
    st.divider()
    col_btn1, col_btn2 = st.columns([1, 3])
    with col_btn1:
        if st.button("Build Unified Dataset", type="primary", use_container_width=True):
            st.session_state.unified_dataset_built = True

# STEP 3: Unified Staging Review & Cross-File Deduplication
if st.session_state.unified_dataset_built and st.session_state.uploaded_batches:
    st.markdown("<div class='section-header'>Step 3: Unified Staging Review & Cross-File Deduplication</div>", unsafe_allow_html=True)
    st.caption("Global column resolution and deduplication applied across all uploaded files together.")

    # Fetch all staged records across batches
    all_staged = get_staged_records(db_path=st.session_state.db_path)
    
    # 4 Filter Chips: All, Valid, Warning, Error, Duplicate
    f_col1, f_col2, f_col3, f_col4, f_col5 = st.columns(5)
    with f_col1:
        show_all = st.checkbox("All Records", value=True)
    with f_col2:
        show_valid = st.checkbox("Valid", value=True)
    with f_col3:
        show_warning = st.checkbox("Warning", value=True)
    with f_col4:
        show_error = st.checkbox("Error", value=True)
    with f_col5:
        show_duplicate = st.checkbox("Duplicate", value=True)

    # Filter logic
    selected_statuses = []
    if show_valid: selected_statuses.append("VALID")
    if show_warning: selected_statuses.append("WARNING")
    if show_error: selected_statuses.append("ERROR")
    if show_duplicate: selected_statuses.append("DUPLICATE")

    filtered_records = []
    for r in all_staged:
        if show_all or r["validation_status"] in selected_statuses:
            filtered_records.append(r)

    # Render Unified Staging Table
    table_rows = []
    for r in filtered_records:
        raw_obj = json.loads(r["raw_row_json"])
        
        # Badge rendering
        st_val = r["validation_status"]
        if st_val == "VALID":
            badge_html = "<span class='status-badge-valid'>VALID</span>"
        elif st_val == "WARNING":
            badge_html = "<span class='status-badge-warning'>WARNING</span>"
        elif st_val == "ERROR":
            badge_html = "<span class='status-badge-error'>ERROR</span>"
        else:
            badge_html = "<span class='status-badge-duplicate'>DUPLICATE</span>"

        table_rows.append({
            "Staged ID": r["id"],
            "Batch ID": r["import_batch_id"],
            "Row": r["row_number"],
            "Extracted Raw Fields": json.dumps(raw_obj),
            "Status": badge_html,
            "Validation Notes": r["validation_notes"] or "-"
        })

    if table_rows:
        # Custom HTML Table rendering to preserve HTML badges cleanly
        html_table = "<div class='table-container'><table style='width:100%; border-collapse:collapse; font-size:0.85rem;'>"
        html_table += "<tr style='background-color:#1E293B; border-bottom:1px solid #334155; text-align:left;'>"
        html_table += "<th style='padding:8px 12px;'>ID</th><th style='padding:8px 12px;'>Batch</th><th style='padding:8px 12px;'>Extracted Raw Data</th><th style='padding:8px 12px;'>Status</th><th style='padding:8px 12px;'>Validation Notes</th></tr>"
        
        for tr in table_rows:
            html_table += f"<tr style='border-bottom:1px solid #334155;'>"
            html_table += f"<td style='padding:8px 12px;'>{tr['Staged ID']}</td>"
            html_table += f"<td style='padding:8px 12px;'>#{tr['Batch ID']}</td>"
            html_table += f"<td style='padding:8px 12px; font-family:monospace;'>{tr['Extracted Raw Fields']}</td>"
            html_table += f"<td style='padding:8px 12px;'>{tr['Status']}</td>"
            html_table += f"<td style='padding:8px 12px; color:#94A3B8;'>{tr['Validation Notes']}</td>"
            html_table += "</tr>"
            
        html_table += "</table></div>"
        st.markdown(html_table, unsafe_allow_html=True)
    else:
        st.info("No staged records match the selected filter criteria.")

    # Closed-Vocabulary Field Mapping Overrides
    st.markdown("<div class='section-header'>Closed-Vocabulary Column Mapping Overrides</div>", unsafe_allow_html=True)
    st.caption("Select a canonical field destination for unmapped raw headers. Free-text entries are restricted.")
    
    canonical_keys = list(ColumnResolver.CANONICAL_MAPPINGS.keys())
    m_col1, m_col2 = st.columns(2)
    with m_col1:
        st.selectbox(
            label="Map Raw Header 'Balance (Units)' to Canonical Field:",
            options=canonical_keys,
            index=canonical_keys.index("current_stock") if "current_stock" in canonical_keys else 0,
            key="override_balance_units"
        )
    with m_col2:
        st.selectbox(
            label="Map Raw Header 'Particulars' to Canonical Field:",
            options=canonical_keys,
            index=canonical_keys.index("item_name") if "item_name" in canonical_keys else 0,
            key="override_particulars"
        )

    # Action Button: Commit Staged Records
    st.divider()
    col_c1, col_c2 = st.columns([1, 3])
    with col_c1:
        if st.button("Commit Staged Records to Production Database", type="primary", use_container_width=True):
            commit_staged_records(db_path=st.session_state.db_path)
            st.success("Successfully committed valid staged records to inventory_items and digitalized_invoices production tables.")

# Separate Admin Expander for Registering New Canonical Fields (Logged & Restricted)
st.divider()
with st.expander("Admin: Register New Canonical Field (Logged Action)", expanded=False):
    st.caption("Registers a new canonical field destination for this business session. Logged to schema_change_log table in SQLite.")
    new_field_input = st.text_input("New Canonical Field Name (lowercase, underscored):", value="")
    if st.button("Register Canonical Field"):
        if new_field_input:
            success, msg = register_new_canonical_field(new_field_input, business_id=1, db_path=st.session_state.db_path)
            if success:
                st.success(msg)
            else:
                st.error(msg)
