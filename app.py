"""
Governed Multi-Agent Business Decision Intelligence & Digitalization Platform
Capstone Project Review 2 Interactive Visual Application
Grounded in 12 Peer-Reviewed Papers (2025-2026)
"""

import os
import sys
import json
import tempfile
import sqlite3
from typing import List, Dict, Any
import streamlit as st

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.schemas import SystemState
from src.ingestion.digitalizer import SMEDigitalizerEngine
from src.ingestion.column_resolver import ColumnResolver
from src.agents.inventory_agent import InventoryAgent
from src.agents.market_agent import MarketAgent
from src.agents.procurement_agent import ProcurementAgent
from src.agents.finance_agent import FinanceAgent
from src.agents.operations_agent import OperationsAgent
from src.arbitration import ArbitrationEngine
from src.payment.gateway_client import B2BPaymentGatewayClient, PaymentGatewayError
from src.core.audit import append_entry, verify_chain, get_all_entries, get_connection
from src.core.database import log_decision, get_decision_log, update_action_status, get_all_decision_logs, init_db

# Page Configuration
st.set_page_config(
    page_title="Governed Multi-Agent Business Commerce Platform",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Zero Pandas/PyArrow Dependencies)
st.markdown("""
<style>
    /* Dark / Executive Color Palette */
    .stApp {
        background-color: #0F172A;
        color: #F8FAFC;
    }
    .main-header {
        font-size: 2.1rem;
        font-weight: 800;
        color: #38BDF8;
        letter-spacing: -0.5px;
        margin-bottom: 4px;
    }
    .sub-header {
        font-size: 1.0rem;
        color: #94A3B8;
        margin-bottom: 24px;
    }
    .exec-card {
        background: #1E293B;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .card-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #F1F5F9;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .badge-success {
        background-color: #064E3B;
        color: #34D399;
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid #059669;
    }
    .badge-warning {
        background-color: #451A03;
        color: #FBBF24;
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid #D97706;
    }
    .badge-danger {
        background-color: #450A0A;
        color: #F87171;
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid #DC2626;
    }
    .badge-info {
        background-color: #0C4A6E;
        color: #38BDF8;
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid #0284C7;
    }
    /* HTML Custom Table Styling */
    .custom-table-container {
        width: 100%;
        overflow-x: auto;
        margin-top: 10px;
        margin-bottom: 15px;
        border-radius: 8px;
        border: 1px solid #334155;
    }
    table.custom-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.9rem;
        background-color: #1E293B;
        color: #E2E8F0;
    }
    table.custom-table th {
        background-color: #0F172A;
        color: #38BDF8;
        padding: 12px 16px;
        font-weight: 700;
        border-bottom: 2px solid #334155;
        text-transform: uppercase;
        font-size: 0.78rem;
        letter-spacing: 0.5px;
    }
    table.custom-table td {
        padding: 12px 16px;
        border-bottom: 1px solid #334155;
    }
    table.custom-table tr:hover {
        background-color: #334155;
    }
    .ocr-preview-box {
        background-color: #020617;
        border: 1px dashed #38BDF8;
        border-radius: 8px;
        padding: 16px;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.85rem;
        color: #38BDF8;
        line-height: 1.4;
        white-space: pre-wrap;
    }
</style>
""", unsafe_allow_html=True)


# HTML Table Generator (Avoids Pandas/PyArrow/st.dataframe completely)
def render_html_table(headers: List[str], rows: List[List[Any]]) -> str:
    if not rows:
        return "<div style='color: #94A3B8; padding: 12px;'>No records found in database context.</div>"

    html = "<div class='custom-table-container'><table class='custom-table'><thead><tr>"
    for h in headers:
        html += f"<th>{h}</th>"
    html += "</tr></thead><tbody>"

    for row in rows:
        html += "<tr>"
        for cell in row:
            # Check for badges in cell string
            val_str = str(cell)
            if "VALIDATED" in val_str or "100% VERIFIED" in val_str or "PASSED" in val_str:
                cell_html = f"<span class='badge-success'>{val_str}</span>"
            elif "DISCREPANCY" in val_str or "TAMPERED" in val_str or "FLAGGED" in val_str:
                cell_html = f"<span class='badge-danger'>{val_str}</span>"
            elif "HELD" in val_str or "PENDING" in val_str or "CAPPED" in val_str:
                cell_html = f"<span class='badge-warning'>{val_str}</span>"
            else:
                cell_html = val_str
            html += f"<td>{cell_html}</td>"
        html += "</tr>"

    html += "</tbody></table></div>"
    return html


# Initialize Session State Variables
if "db_path" not in st.session_state:
    st.session_state.db_path = os.path.join("data", "sme_digitalized_data.db")

if "digitalizer" not in st.session_state:
    st.session_state.digitalizer = SMEDigitalizerEngine(db_path=st.session_state.db_path)

if "payment_history" not in st.session_state:
    st.session_state.payment_history = []

if "tamper_simulated" not in st.session_state:
    st.session_state.tamper_simulated = False

# Sidebar Controls & Context Scenario Selector
st.sidebar.image("https://img.icons8.com/isometric/100/security-pass.png", width=65)
st.sidebar.title("Enterprise Control Panel")
st.sidebar.caption("Capstone Project Review 2 Defense")

# Scenario Selection
selected_scenario = st.sidebar.selectbox(
    "Select Evaluation Scenario",
    [
        "Scenario A: Diwali Stockout & Cash Liquidity Crunch",
        "Scenario B: Supplier Lead-Time Delay & Discount Arbitrage",
        "Scenario C: Custom SME Financial Configuration"
    ]
)

if "Scenario A" in selected_scenario:
    total_bank_cash = 8000.0
    payroll_lock_reserve = 2000.0
    demand_surge_val = 40.0
    order_delay_count = 6
elif "Scenario B" in selected_scenario:
    total_bank_cash = 18000.0
    payroll_lock_reserve = 3000.0
    demand_surge_val = 15.0
    order_delay_count = 14
else:
    col_s1, col_s2 = st.sidebar.columns(2)
    with col_s1:
        total_bank_cash = st.number_input("Bank Cash (INR)", value=10000.0, step=1000.0)
    with col_s2:
        payroll_lock_reserve = st.number_input("Payroll Reserve", value=2000.0, step=500.0)
    demand_surge_val = 25.0
    order_delay_count = 5

free_liquid_buffer = max(0.0, total_bank_cash - payroll_lock_reserve)

st.sidebar.divider()
st.sidebar.markdown("### 📚 Peer-Reviewed Grounding")
st.sidebar.info(
    "**12 Literature Papers (2025–2026)**\n"
    "• **P1 (Elsevier)**: Role Agent Decomposition\n"
    "• **P2 (ASME)**: External Numeric Tools\n"
    "• **P4 (Springer)**: SHA-256 Non-Repudiation\n"
    "• **P10 (Elec. Mkts)**: MCDM Arbitration (C3) & Governed UI (C5)"
)

# Header Section
st.markdown("<div class='main-header'>Governed Multi-Agent Business Decision Intelligence</div>", unsafe_allow_html=True)
st.markdown("<div class='sub-header'>Layer 0 SME Data Digitalization • 5-Domain Agent Intelligence • Deterministic MCDM Arbitration • Cryptographic SHA-256 Audit Ledger</div>", unsafe_allow_html=True)

# Top KPI Metric Cards
m_col1, m_col2, m_col3, m_col4 = st.columns(4)
with m_col1:
    st.markdown(
        f"<div class='exec-card'>"
        f"<div class='card-title'>💰 Bank Liquid Cash</div>"
        f"<div style='font-size: 1.6rem; font-weight: 800; color: #38BDF8;'>INR {total_bank_cash:,.2f}</div>"
        f"<div style='font-size: 0.8rem; color: #94A3B8;'>Free Buffer: <b>INR {free_liquid_buffer:,.2f}</b> (Protected Payroll Reserve: INR {payroll_lock_reserve:,.2f})</div>"
        f"</div>",
        unsafe_allow_html=True
    )
with m_col2:
    st.markdown(
        f"<div class='exec-card'>"
        f"<div class='card-title'>🤖 Active Domain Agents</div>"
        f"<div style='font-size: 1.6rem; font-weight: 800; color: #F1F5F9;'>5 Agents</div>"
        f"<div style='font-size: 0.8rem; color: #94A3B8;'>Inventory, Finance, Operations, Market, Procurement</div>"
        f"</div>",
        unsafe_allow_html=True
    )
with m_col3:
    is_valid, err_msg = verify_chain(db_path=st.session_state.db_path)
    status_badge = "<span class='badge-success'>100% VERIFIED</span>" if is_valid else "<span class='badge-danger'>TAMPER DETECTED</span>"
    st.markdown(
        f"<div class='exec-card'>"
        f"<div class='card-title'>🔒 SHA-256 Audit Ledger</div>"
        f"<div style='font-size: 1.3rem; margin-top: 4px;'>{status_badge}</div>"
        f"<div style='font-size: 0.8rem; color: #94A3B8; margin-top: 6px;'>Cryptographic Non-Repudiation Chaining</div>"
        f"</div>",
        unsafe_allow_html=True
    )
with m_col4:
    st.markdown(
        f"<div class='exec-card'>"
        f"<div class='card-title'>⚖️ Governance Model</div>"
        f"<div style='font-size: 1.3rem; margin-top: 4px;'><span class='badge-info'>HUMAN-IN-THE-LOOP</span></div>"
        f"<div style='font-size: 0.8rem; color: #94A3B8; margin-top: 6px;'>Deterministic Capping & Gated Approval</div>"
        f"</div>",
        unsafe_allow_html=True
    )

st.divider()

# Navigation Tabs
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "📁 1. SME Data Digitalization (Layer 0)",
    "🤖 2. 5-Domain Agent Intelligence",
    "⚖️ 3. MCDM Arbitration Engine",
    "💳 4. Governed B2B Settlement",
    "🔒 5. Cryptographic SHA-256 Audit"
])

# =============================================================================
# TAB 1: LAYER 0 - MULTI-MODAL SME DATA DIGITALIZATION & CONTEXT SYNTHESIS
# =============================================================================
with tab1:
    st.subheader("Layer 0: SME Heterogeneous Data Digitalization Studio")
    st.caption("Converts unstructured paper receipts, scanned invoice images, PDF purchase orders, and messy spreadsheets into verified SQLite context databases.")

    digitalizer = st.session_state.digitalizer

    input_mode = st.radio(
        "Select Digitalization Input Channel",
        [
            "📷 Scanned Paper Receipt / Image OCR",
            "📄 B2B PDF Document / Tax Invoice",
            "📊 Messy SME CSV / Excel Column Resolver",
            "📥 Custom File Upload Studio"
        ],
        horizontal=True
    )

    if "Scanned Paper Receipt" in input_mode:
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("<div class='card-title'>📷 Scanned Paper Receipt Optical Preview</div>", unsafe_allow_html=True)
            uploaded_img = st.file_uploader("Upload Receipt Image / Scan (.png, .jpg, .txt)", type=["png", "jpg", "jpeg", "txt"], key="upload_ocr")

            if uploaded_img:
                import hashlib as _hl
                _fb = bytes(uploaded_img.getbuffer())
                _fhash = _hl.sha256(_fb).hexdigest()
                _ext = os.path.splitext(uploaded_img.name)[1].lower()
                # Hash-derived path: prevents stale-file collision when the same filename is re-uploaded with different content
                temp_path = os.path.join("data", f"ocr_{_fhash[:16]}{_ext}")
                with open(temp_path, "wb") as f:
                    f.write(_fb)
                print(f"[OCR-UPLOAD] file={uploaded_img.name!r} | sha256={_fhash} | saved_to={temp_path}")

                # Guard on content hash — NOT filename — so re-uploading a same-named but different file triggers re-OCR
                if st.session_state.get("active_ocr_file_hash") != _fhash:
                    with st.spinner(f"🔍 Running OCR on `{uploaded_img.name}`..."):
                        extracted_txt = digitalizer.extract_text_from_image_or_pdf(temp_path)
                    st.session_state["txt_ocr_box"] = extracted_txt
                    st.session_state["active_ocr_file_hash"] = _fhash
                    st.session_state["active_ocr_filename"] = uploaded_img.name
                    # Pre-seed the display widget key so the text appears immediately after rerun
                    st.session_state["_ocr_display"] = extracted_txt
                    st.rerun()
                st.caption(f"✅ Loaded: `{uploaded_img.name}` · SHA-256: `{_fhash[:12]}…`")
                st.info("ℹ️ **Human-in-the-Loop OCR Inspector**: Extracted text is shown below. Edit any values directly before clicking **Process & Save**.")
            elif "txt_ocr_box" not in st.session_state:
                paper_sample = os.path.join("data", "sample_documents", "paper_receipt_scan.txt")
                if os.path.exists(paper_sample):
                    with open(paper_sample, "r", encoding="utf-8") as f:
                        st.session_state["txt_ocr_box"] = f.read()
                else:
                    st.session_state["txt_ocr_box"] = "Invoice No: INV-2026-889\nSupplier: Apex Metal Suppliers Ltd\nLine Items:\nRaw Steel Alloy Bars | 50.00 | 250.00 | 12500.00\nSubtotal: 12500.00\nTax: 2250.00\nGrand Total: 14750.00"

            # FIX: Streamlit ignores `value=` when `key=` is set (widget is state-controlled).
            # Use a separate display key `_ocr_display` and seed it from `txt_ocr_box` if not yet set.
            if "_ocr_display" not in st.session_state:
                st.session_state["_ocr_display"] = st.session_state.get("txt_ocr_box", "")
            editable_ocr_text = st.text_area("Extracted OCR / Document Text (Editable)", height=220, key="_ocr_display")

        with c2:
            st.markdown("<div class='card-title'>⚡ Dynamic OCR Extraction & 3-Way Math Audit Engine</div>", unsafe_allow_html=True)
            st.markdown("• **OCR Extraction Pipeline**: Active (Heuristic Regex + Arithmetic Audit)")
            st.markdown("• **Live Text Inspector**: Edit any numbers on the left and click below to test math validation!")

            if st.button("🚀 Process & Save to SQLite Context", type="primary", key="btn_ocr"):
                # Read from display widget's session state (the editable content after user edits)
                ocr_text_to_process = st.session_state.get("_ocr_display", editable_ocr_text)
                inv = digitalizer.parse_text_invoice(ocr_text_to_process, source_filename=st.session_state.get("active_ocr_filename", "uploaded_receipt.txt"))
                st.success(f"✅ Ingested Invoice '{inv.invoice_id}' from '{inv.supplier_name}' into SQLite Context!")

                # Step-by-step visual data flow breakdown
                st.markdown(
                    f"<div class='exec-card' style='margin:12px 0; border:1px solid #38BDF8;'>"
                    f"<div class='card-title' style='color:#38BDF8;'>🔄 5-Stage Execution Breakdown</div>"
                    f"<div><b>1. Text Extraction &amp; Regex Parse</b>: Identified Invoice ID <code>{inv.invoice_id}</code> from supplier <b>{inv.supplier_name}</b></div>"
                    f"<div><b>2. 3-Way Arithmetic Validation</b>: Subtotal INR {inv.subtotal:,.2f} + Tax INR {inv.tax_amount:,.2f} = Grand Total <b>INR {inv.grand_total:,.2f}</b></div>"
                    f"<div><b>3. Staging Layer & Deduplication</b>: Staged record in SQLite staging table <code>staged_records</code></div>"
                    f"<div><b>4. Operational DB Commitment</b>: Saved into live table <code>invoices</code> inside <code>sme_digitalized_data.db</code></div>"
                    f"<div><b>5. Multi-Agent Intelligence Sync</b>: Operational context ready for Inventory, Finance & Procurement Agents</div>"
                    f"</div>",
                    unsafe_allow_html=True
                )

                if inv.verification_status.value == "VALIDATED":
                    st.markdown("<span class='badge-success'>✅ 3-Way Arithmetic Validation PASSED! No math discrepancies.</span>", unsafe_allow_html=True)
                else:
                    st.markdown(f"<span class='badge-danger'>⚠️ DISCREPANCY DETECTED: {', '.join(inv.discrepancies)}</span>", unsafe_allow_html=True)

    elif "B2B PDF Document" in input_mode:
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("<div class='card-title'>📄 PDF Document Parser Preview</div>", unsafe_allow_html=True)
            uploaded_pdf = st.file_uploader("Upload B2B PDF / Invoice (.pdf, .txt)", type=["pdf", "txt"], key="upload_pdf")

            if uploaded_pdf:
                temp_path = os.path.join("data", uploaded_pdf.name)
                with open(temp_path, "wb") as f:
                    f.write(uploaded_pdf.getbuffer())
                if st.session_state.get("active_pdf_filename") != uploaded_pdf.name:
                    extracted_po = digitalizer.extract_text_from_image_or_pdf(temp_path)
                    st.session_state["txt_pdf_box"] = extracted_po
                    st.session_state["active_pdf_filename"] = uploaded_pdf.name
                    st.session_state["_pdf_display"] = extracted_po
                    st.rerun()
                st.caption(f"✅ Extracted PDF Text: {uploaded_pdf.name}")
            elif "txt_pdf_box" not in st.session_state:
                po_sample = os.path.join("data", "sample_documents", "b2b_purchase_order.txt")
                if os.path.exists(po_sample):
                    with open(po_sample, "r", encoding="utf-8") as f:
                        st.session_state["txt_pdf_box"] = f.read()
                else:
                    st.session_state["txt_pdf_box"] = "PO # PO-2026-904\nSupplier: Fastener Dynamics India\nHigh-Grade Fasteners | 100.00 | 15.00 | 1500.00\nSubtotal: 1500.00\nTax: 270.00\nGrand Total: 1770.00"

            # FIX: Same pattern as OCR — use separate display key to avoid value= being ignored.
            if "_pdf_display" not in st.session_state:
                st.session_state["_pdf_display"] = st.session_state.get("txt_pdf_box", "")
            editable_pdf_text = st.text_area("PDF Document Text Extract (Editable)", height=220, key="_pdf_display")

        with c2:
            st.markdown("<div class='card-title'>⚡ PDF Structure Extraction Engine</div>", unsafe_allow_html=True)
            st.markdown("• **PDF Extraction**: Extracts PO Number, Supplier, Line Items, and Taxes dynamically.")

            if st.button("🚀 Process & Digitize PDF Document", type="primary", key="btn_pdf"):
                pdf_text_to_process = st.session_state.get("_pdf_display", editable_pdf_text)
                inv = digitalizer.parse_text_invoice(pdf_text_to_process, source_filename=st.session_state.get("active_pdf_filename", "uploaded_pdf.pdf"))
                st.success(f"✅ Ingested PDF Record '{inv.invoice_id}' into SQLite!")
                st.markdown(f"**Grand Total**: INR {inv.grand_total:,.2f}")
                if inv.verification_status.value == "VALIDATED":
                    st.markdown("<span class='badge-success'>✅ 3-Way Arithmetic Validation PASSED!</span>", unsafe_allow_html=True)
                else:
                    st.markdown(f"<span class='badge-danger'>⚠️ DISCREPANCY DETECTED: {', '.join(inv.discrepancies)}</span>", unsafe_allow_html=True)

    elif "Messy SME CSV" in input_mode:
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("<div class='card-title'>📊 Heterogeneous Raw Spreadsheet View</div>", unsafe_allow_html=True)
            uploaded_csv = st.file_uploader("Upload Custom Inventory CSV / Spreadsheet", type=["csv", "json"], key="upload_csv")

            if uploaded_csv:
                temp_csv = os.path.join("data", uploaded_csv.name)
                with open(temp_csv, "wb") as f:
                    f.write(uploaded_csv.getbuffer())
                items, summary = digitalizer.ingest_inventory_file(temp_csv)
                st.caption(f"Parsed uploaded spreadsheet: {uploaded_csv.name}")
            else:
                csv_sample = os.path.join("data", "sample_documents", "messy_sme_inventory.csv")
                if os.path.exists(csv_sample):
                    items, summary = digitalizer.ingest_inventory_file(csv_sample)
                else:
                    default_csv = os.path.join("data", "raw_demo_inventory.csv")
                    with open(default_csv, "w", encoding="utf-8") as f:
                        f.write("Item,Qty Available,Unit Cost,Min Threshold,Reorder Qty\n")
                        f.write("Raw Steel Alloy Bars,4.0,250.00,10.0,50.0\n")
                        f.write("High-Grade Fasteners,120.0,15.00,30.0,100.0\n")
                    items, summary = digitalizer.ingest_inventory_file(default_csv)

            if items:
                raw_headers = list(items[0].model_dump().keys())
            else:
                raw_headers = ["Item Name", "Stock Available", "Unit Price (INR)", "Reorder Limit"]

            st.info(f"Detected Input Headers: `{', '.join(raw_headers)}`")

        with c2:
            st.markdown("<div class='card-title'>⚡ Intelligent Header Synonym Resolver</div>", unsafe_allow_html=True)
            column_mapping = ColumnResolver.resolve_columns(raw_headers)
            st.markdown("**Header Synonym Normalization Mapping:**")
            for raw_col, norm_col in column_mapping.items():
                st.markdown(f"• `{raw_col}` ➔ `<span style='color:#38BDF8;'>{norm_col}</span>`", unsafe_allow_html=True)
            st.markdown(f"**Ingestion Summary**: Parsed {summary.total_records} records ({summary.valid_records} valid).", unsafe_allow_html=True)
            st.markdown(f"**Verification Status**: <span class='badge-success'>{summary.verification_status.value}</span>", unsafe_allow_html=True)

    else:
        st.markdown("<div class='card-title'>📥 Drag and Drop Heterogeneous SME Files</div>", unsafe_allow_html=True)
        uploaded_files = st.file_uploader("Upload Photos (.png, .jpg), PDFs, CSVs, or Text Receipts", type=["csv", "json", "txt", "pdf", "png", "jpg"], accept_multiple_files=True, key="upload_batch")
        if uploaded_files:
            temp_paths = []
            for file in uploaded_files:
                path = os.path.join("data", file.name)
                with open(path, "wb") as f:
                    f.write(file.getbuffer())
                temp_paths.append(path)
            res = digitalizer.ingest_batch_files(temp_paths)
            st.success(f"Batch Digitalized {res['total_files']} files into SQLite context database!")

    st.markdown("---")
    st.markdown("### 🛠️ 5-Stage SME Digitalization Pipeline & Human-in-the-Loop Staging Review")
    st.caption("RAW SOURCE ➔ EXTRACTION ➔ NORMALIZATION ➔ VALIDATION ➔ STAGING ➔ HUMAN REVIEW ➔ COMMIT")

    # If any uploaded file is present, ingest into staging
    active_staging_file = st.session_state.get("active_ocr_filename") or st.session_state.get("active_pdf_filename") or "messy_sme_inventory.csv"
    sample_staging_path = os.path.join("data", active_staging_file) if os.path.exists(os.path.join("data", active_staging_file)) else os.path.join("data", "sample_documents", "messy_sme_inventory.csv")

    if os.path.exists(sample_staging_path):
        batch_id, staged_recs = digitalizer.ingest_file_to_staging(sample_staging_path)

        st.markdown(f"**Import Batch `#${batch_id}`**: Staged `{len(staged_recs)}` records from `{os.path.basename(sample_staging_path)}` for owner review.")

        if staged_recs:
            staged_rows_display = []
            rec_ids = []
            for r in staged_recs:
                status_color = "#34D399" if r["validation_status"] == "VALID" else ("#F59E0B" if r["validation_status"] in ["WARNING", "DUPLICATE"] else "#EF4444")
                badge_html = f"<span style='background-color:{status_color}22; color:{status_color}; padding:2px 8px; border-radius:4px; font-weight:700;'>{r['validation_status']}</span>"
                parsed_dict = json.loads(r["parsed_record_json"]) if r["parsed_record_json"] else {}
                item_desc = parsed_dict.get("item_name") or parsed_dict.get("supplier_name") or f"Record #{r['row_number']}"
                staged_rows_display.append([
                    f"Row {r['row_number']}",
                    item_desc,
                    badge_html,
                    r["validation_notes"],
                    "✅ Committed" if r["committed"] == 1 else "⏳ Pending Review"
                ])
                rec_ids.append(r["id"])

            st.markdown(render_html_table(["Row #", "Record Description", "Validation Status", "Validation / Dedup Notes", "Commit Status"], staged_rows_display), unsafe_allow_html=True)

            c_stg1, c_stg2 = st.columns([3, 1])
            with c_stg1:
                st.caption("🔒 *Staging Layer Guard*: Unconfirmed rows remain in staging and do not touch operational_data or finance cash balance until explicitly committed.")
            with c_stg2:
                if st.button("✅ Confirm & Commit Batch to SQLite", type="primary", key="btn_commit_staging"):
                    from src.core.database import commit_staged_records
                    committed_n = commit_staged_records(batch_id, rec_ids, db_path=st.session_state.db_path)
                    st.success(f"✅ Committed {committed_n} staged records into live SQLite operational tables!")
                    st.rerun()

    st.markdown("---")
    st.markdown("### 🗄️ Unified Digitalized SQLite Database State (No PyArrow / Pandas)")
    st.caption("Live query from `sme_digitalized_data.db` tables: `inventory_items` and `invoices`.")

    with digitalizer.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT item_id, item_name, current_stock, min_threshold, reorder_quantity, unit_cost, category FROM inventory_items")
        inv_db_rows = cursor.fetchall()

        cursor.execute("SELECT invoice_id, supplier_name, date, subtotal, tax_amount, grand_total, verification_status FROM invoices")
        invc_db_rows = cursor.fetchall()

    c_inv, c_invc = st.columns(2)
    with c_inv:
        st.markdown("#### 📦 SQLite Table: `inventory_items`")
        inv_table_rows = [
            [r["item_id"], r["item_name"], f"{r['current_stock']} units", f"{r['min_threshold']} units", f"INR {r['unit_cost']:,.2f}"]
            for r in inv_db_rows
        ]
        st.markdown(render_html_table(["SKU ID", "Item Description", "Current Stock", "Reorder Point", "Unit Cost"], inv_table_rows), unsafe_allow_html=True)

    with c_invc:
        st.markdown("#### 🧾 SQLite Table: `invoices`")
        invc_table_rows = [
            [r["invoice_id"], r["supplier_name"], r["date"], f"INR {r['grand_total']:,.2f}", r["verification_status"]]
            for r in invc_db_rows
        ]
        st.markdown(render_html_table(["Invoice ID", "Supplier", "Date", "Grand Total", "Status"], invc_table_rows), unsafe_allow_html=True)


# =============================================================================
# TAB 2: LAYER 1 - 5-DOMAIN AGENT INTELLIGENCE CONSOLE
# =============================================================================
with tab2:
    st.subheader("Layer 1: Autonomous 5-Domain Agent Intelligence Evaluation")
    st.caption("Specialized agents analyze stockout risk, liquidity limits, operational delays, competitor demand spikes, and vendor discounts.")

    system_state = SystemState(available_cash=free_liquid_buffer, time_window_days=7.0)

    # Context ground
    business_context = {
        "inventory_items": [
            {"item_id": "SKU-STEEL-01", "item_name": "Raw Steel Alloy Bars", "current_stock": 4.0, "min_threshold": 10.0, "reorder_quantity": 50.0, "unit_cost": 250.0},
            {"item_id": "SKU-FAST-02", "item_name": "High-Grade Fasteners", "current_stock": 120.0, "min_threshold": 30.0, "reorder_quantity": 100.0, "unit_cost": 15.0}
        ],
        "upcoming_payroll_reserve": payroll_lock_reserve,
        "market_signals": {
            "demand_surge_pct": demand_surge_val,
            "target_product": "Diwali Steel Stock",
            "recommended_budget": 3500.0
        },
        "procurement_deals": [
            {
                "supplier_name": "Apex Metal Suppliers Ltd",
                "raw_material": "Steel Alloy Bars",
                "discount_pct": 15.0,
                "deal_cost": 2500.0
            }
        ],
        "pending_order_delays": order_delay_count
    }

    agents = [
        InventoryAgent(),
        MarketAgent(),
        ProcurementAgent(),
        FinanceAgent(),
        OperationsAgent()
    ]

    all_recs = []
    for agent in agents:
        all_recs.extend(agent.evaluate(system_state, business_context))

    total_cash_demanded = sum(r.required_cash for r in all_recs)

    if total_cash_demanded > free_liquid_buffer:
        st.markdown(
            f"<div class='badge-danger' style='font-size:1.0rem; padding:12px; margin-bottom:16px; display:block; text-align:center;'>"
            f"⚠️ RESOURCE CONFLICT DETECTED! Total Agent Cash Requested (INR {total_cash_demanded:,.2f}) > Free Liquid Buffer (INR {free_liquid_buffer:,.2f}). "
            f"Requires Deterministic MCDM Arbitration & Capital Capping in Layer 3."
            f"</div>",
            unsafe_allow_html=True
        )

    # Render Agent Cards
    agent_cols = st.columns(len(all_recs))
    for idx, rec in enumerate(all_recs):
        with agent_cols[idx]:
            st.markdown(
                f"<div class='exec-card'>"
                f"<div class='card-title'>🤖 {rec.agent_type.value}</div>"
                f"<div style='font-weight:700; color:#38BDF8; font-size:1.05rem;'>{rec.title}</div>"
                f"<div style='font-size:0.85rem; color:#94A3B8; margin-top:6px; min-height:55px;'>{rec.description}</div>"
                f"<hr style='border-color:#334155; margin:10px 0;'>"
                f"<div><b>Required Cash</b>: INR {rec.required_cash:,.2f}</div>"
                f"<div><b>Urgency Score</b>: <span class='badge-warning'>{rec.urgency_score:.2f} / 1.0</span></div>"
                f"<div><b>Impact ROI</b>: <span class='badge-info'>{rec.expected_roi_or_impact:.2f}</span></div>"
                f"</div>",
                unsafe_allow_html=True
            )


# =============================================================================
# TAB 3: LAYER 2 & 3 - DETERMINISTIC MCDM ARBITRATION ENGINE
# =============================================================================
with tab3:
    st.subheader("Layer 2 & 3: Deterministic Multi-Criteria Decision Making (MCDM) Arbitration Engine")
    st.caption("Mathematically resolves agent conflicts, scores candidates via weighted multi-criteria formula, and caps order capital to protect the payroll reserve.")

    st.markdown("""
    $$\\text{Score}(r_i) = 0.40 \\cdot S_{\\text{rev}}(r_i) + 0.30 \\cdot S_{\\text{urg}}(r_i) + 0.20 \\cdot S_{\\text{cash}}(r_i) + 0.10 \\cdot S_{\\text{conf}}(r_i)$$
    """)

    arbitrator = ArbitrationEngine()
    conflict_detected, total_requested, mcr_used = arbitrator.check_resource_conflicts(all_recs, free_liquid_buffer)
    ranked_recs = arbitrator.rank_recommendations(all_recs, free_liquid_buffer)
    routed_decisions = arbitrator.route_decisions(ranked_recs, free_liquid_buffer)

    st.markdown("### 📊 MCDM Candidate Evaluation Matrix Table")
    mcdm_headers = ["Rank", "Agent Domain", "Recommendation Title", "Required Cash", "Urgency (S_urg)", "ROI/Revenue (S_rev)", "MCDM Final Score"]
    mcdm_rows = []
    for idx, rec in enumerate(ranked_recs, 1):
        urg_s = getattr(rec, "urgency_score", 0.5)
        roi_s = getattr(rec, "expected_roi_or_impact", 0.5)
        mcdm_score = getattr(rec, "mcdm_score", 0.65)
        mcdm_rows.append([
            f"#{idx}",
            rec.agent_type.value,
            rec.title,
            f"INR {rec.required_cash:,.2f}",
            f"{urg_s:.2f}",
            f"{roi_s:.2f}",
            f"<b>{mcdm_score:.4f}</b>"
        ])

    st.markdown(render_html_table(mcdm_headers, mcdm_rows), unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("### 🎯 Arbitrated & Capital-Capped Decision Feed")

    for dec in routed_decisions:
        status_color = "badge-success" if dec.status.value == "APPROVED" else ("badge-warning" if dec.status.value == "MODIFIED_CAP" else "badge-danger")
        st.markdown(
            f"<div class='exec-card'>"
            f"<div style='display:flex; justify-content:space-between; align-items:center;'>"
            f"<div style='font-size:1.1rem; font-weight:800; color:#38BDF8;'>{dec.recommendation.title}</div>"
            f"<div><span class='{status_color}'>{dec.status.value}</span></div>"
            f"</div>"
            f"<div style='font-size:0.9rem; color:#CBD5E1; margin:8px 0;'><b>Arbitration Rationale</b>: {dec.reasoning}</div>"
            f"<div style='display:flex; gap:24px; font-size:0.9rem; margin-top:8px; color:#94A3B8;'>"
            f"<div>Requested Amount: <b>INR {dec.recommendation.required_cash:,.2f}</b></div>"
            f"<div>Approved Amount: <b style='color:#34D399;'>INR {dec.approved_amount:,.2f}</b></div>"
            f"<div>Target SKU/Vendor: <b>{dec.recommendation.target_entity_id}</b></div>"
            f"</div>"
            f"</div>",
            unsafe_allow_html=True
        )


# =============================================================================
# TAB 4: LAYER 4 - GOVERNED B2B ACTION SETTLEMENT GATEWAY
# =============================================================================
with tab4:
    st.subheader("Layer 4: Governed B2B Action Execution & Settlement Gateway")
    st.caption("Enforces 1-click merchant human gating, generates explainable payment order payloads in paise, and gracefully handles gateway failures.")

    if not routed_decisions:
        st.info("No decisions routed for execution.")
    else:
        top_decision = routed_decisions[0]

        # Log decision into SQLite decision_log if not already logged
        dec_payload_str = json.dumps({
            "decision_id": top_decision.decision_id,
            "approved_amount": top_decision.approved_amount,
            "title": top_decision.recommendation.title,
            "agent": top_decision.recommendation.agent_type.value
        })
        try:
            log_id = log_decision(
                final_decision=dec_payload_str,
                rationale=top_decision.reasoning,
                db_path=st.session_state.db_path
            )
        except Exception as e:
            init_db(st.session_state.db_path)
            try:
                log_id = log_decision(
                    final_decision=dec_payload_str,
                    rationale=top_decision.reasoning,
                    db_path=st.session_state.db_path
                )
            except Exception:
                log_id = 1

        c_exec1, c_exec2 = st.columns(2)
        with c_exec1:
            st.markdown("<div class='card-title'>💳 Human-in-the-Loop Settlement Modal</div>", unsafe_allow_html=True)
            st.markdown(
                f"<div class='exec-card'>"
                f"<div><b>Decision Log ID</b>: <code>#{log_id}</code> ({top_decision.decision_id})</div>"
                f"<div><b>Target Action</b>: {top_decision.recommendation.title}</div>"
                f"<div><b>Approved Order Amount</b>: <span style='font-size:1.3rem; font-weight:800; color:#34D399;'>INR {top_decision.approved_amount:,.2f}</span> ({int(round(top_decision.approved_amount * 100)):,} Paise)</div>"
                f"<div><b>Target Supplier</b>: Apex Metal Suppliers Ltd</div>"
                f"<div><b>Embedded AI Metadata Note</b>: <i>{top_decision.reasoning}</i></div>"
                f"</div>",
                unsafe_allow_html=True
            )

            sim_failure = st.checkbox("Simulate B2B Payment Gateway Network Failure (DEMO_FORCE_GATEWAY_FAILURE)", value=False)
            if sim_failure:
                os.environ["DEMO_FORCE_GATEWAY_FAILURE"] = "1"
            else:
                os.environ.pop("DEMO_FORCE_GATEWAY_FAILURE", None)

            c_btn1, c_btn2 = st.columns(2)
            with c_btn1:
                if st.button("✅ Approve & Execute Payment Order", type="primary", key="btn_pay_confirm"):
                    from src.api.main import action_confirm, ActionConfirmRequest
                    res = action_confirm(ActionConfirmRequest(decision_log_id=log_id, approved=True))

                    if res["status"] == "CONFIRMED":
                        st.success(f"✅ B2B Payment Settlement Order Created! Transaction ID: `{res['transaction_id']}`")
                        st.markdown(f"**Checkout Payment Link**: `https://checkout.razorpay.com/v1/preview?order_id={res['transaction_id']}`")
                        st.session_state.payment_history.append({
                            "tx_id": res["transaction_id"],
                            "supplier": "Apex Metal Suppliers Ltd",
                            "amount": top_decision.approved_amount,
                            "status": "CONFIRMED"
                        })
                    elif res["status"] == "HELD_IN_AUDIT_STATE":
                        st.markdown(f"<div class='badge-warning' style='padding:12px; margin-top:10px; display:block;'>⚠️ {res['recovery_note']}</div>", unsafe_allow_html=True)
                        st.error(f"Captured Exception Payload: {res['error']}")
                        st.session_state.payment_history.append({
                            "tx_id": "HELD_IN_AUDIT",
                            "supplier": "Apex Metal Suppliers Ltd",
                            "amount": 0.0,
                            "status": "HELD_IN_AUDIT_STATE"
                        })

            with c_btn2:
                if st.button("❌ Reject Action (Owner Sign-Off)", key="btn_pay_reject"):
                    from src.api.main import action_confirm, ActionConfirmRequest
                    res = action_confirm(ActionConfirmRequest(decision_log_id=log_id, approved=False))
                    st.info(f"🚫 Decision #{log_id} rejected by merchant owner. Status updated to REJECTED_BY_OWNER.")
                    st.session_state.payment_history.append({
                        "tx_id": "REJECTED_BY_OWNER",
                        "supplier": "Apex Metal Suppliers Ltd",
                        "amount": 0.0,
                        "status": "REJECTED_BY_OWNER"
                    })

        with c_exec2:
            st.markdown("<div class='card-title'>📜 Executed Settlement History</div>", unsafe_allow_html=True)
            if not st.session_state.payment_history:
                st.info("No B2B payment transactions executed in this session yet.")
            else:
                hist_headers = ["Tx ID", "Supplier", "Amount", "Status"]
                hist_rows = [
                    [h["tx_id"], h["supplier"], f"INR {h['amount']:,.2f}", h["status"]]
                    for h in st.session_state.payment_history
                ]
                st.markdown(render_html_table(hist_headers, hist_rows), unsafe_allow_html=True)


# =============================================================================
# TAB 5: LAYER 5 - CRYPTOGRAPHIC SHA-256 AUDIT LEDGER & TAMPER VERIFICATION
# =============================================================================
with tab5:
    st.subheader("Layer 5: Cryptographic SHA-256 Hash-Chained Audit Ledger")
    st.caption("Maintains immutable non-repudiation logs in `decision_log`. Every decision, transaction outcome, and status change is hash-chained ($H_k = \\text{SHA-256}(H_{k-1} \\parallel \\text{Timestamp} \\parallel \\text{ID} \\parallel \\text{TxID} \\parallel \\text{Status})$).")

    c_aud1, c_aud2 = st.columns(2)

    with c_aud1:
        if st.button("🔍 Run Live Cryptographic Verification Audit", type="primary", key="btn_verify"):
            is_valid, broken_id = verify_chain(db_path=st.session_state.db_path)
            if is_valid:
                st.success("✅ SHA-256 AUDIT CHAIN INTEGRITY 100% VERIFIED! Genesis to Head block intact.")
            else:
                st.error(f"❌ CRITICAL TAMPER DETECTED at Decision Log Row #{broken_id}!")

    with c_aud2:
        if st.button("😈 Simulate Malicious Database Tampering", key="btn_tamper"):
            with get_connection(st.session_state.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE decision_log SET action_status = 'TAMPERED_HACK' WHERE id = 1")
                conn.commit()
            st.session_state.tamper_simulated = True
            st.warning("⚠️ Maliciously altered Row #1 in SQLite `decision_log` table (action_status changed)! Run verification to detect tamper.")

    st.markdown("---")
    st.markdown("### ⛓️ SQLite `decision_log` Table SHA-256 Hash Chain Inspector")

    logs = get_all_decision_logs(db_path=st.session_state.db_path)
    if not logs:
        st.info("No decision_log records found in database.")
    else:
        audit_headers = ["Row ID", "Timestamp", "Action Status", "Tx ID", "Current SHA-256 Hash", "Previous SHA-256 Hash"]
        audit_rows = [
            [
                f"#{r['id']}",
                r["timestamp"][:19],
                r["action_status"] or "PENDING",
                r["transaction_id"] or "N/A",
                f"<code style='color:#38BDF8;'>{(r['curr_hash'] or 'NOT_STAMPED')[:16]}...</code>",
                f"<code style='color:#94A3B8;'>{(r['prev_hash'] or 'GENESIS')[:16]}...</code>"
            ]
            for r in logs
        ]
        st.markdown(render_html_table(audit_headers, audit_rows), unsafe_allow_html=True)


