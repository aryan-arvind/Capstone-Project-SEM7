# 🎯 Capstone Review 2: Actionable Task Breakdown & Module Boundary Specification

---

## 🔵 1. ARYAN (Ingestion, FastAPI Setup & Base UI Shell)

### Current Status: 
- ✅ `[DONE]` OCR document text parser (`src/ingestion/win_ocr.py`).
- ✅ `[DONE]` Messy SME CSV Column Resolver (`src/ingestion/column_resolver.py`).

### 📌 EXACT REMAINING TASKS TO DO FOR REVIEW 2:
- [ ] **Task A.1 (SQLite Auto-Save)**: Complete `src/ingestion/digitalizer.py` so that extracted OCR data and resolved CSV rows automatically insert into SQLite tables (`inventory_items` & `digitalized_invoices`).
- [ ] **Task A.2 (FastAPI Server Setup)**: Create `src/api/main.py` with CORS middleware enabled for the web frontend.
- [ ] **Task A.3 (Ingestion API Routes)**: Create `src/api/routes/ingestion_routes.py` containing:
  - `POST /api/ingest/upload-file`: Accepts `.txt`/`.csv` uploads and calls `digitalizer.py`.
  - `GET /api/ingest/context`: Queries SQLite to return current stock warnings and liquid cash.
- [ ] **Task A.4 (Frontend HTML & Design System)**: Create `frontend/index.html` and `frontend/css/main.css` with dark slate background (`#0F172A`), cyan headers (`#38BDF8`), and container grid layout.
- [ ] **Task A.5 (Upload & Data Table JS)**: Create `frontend/js/ingestion_component.js` to handle file drag-and-drop uploads and render a live HTML table of SQLite inventory records.

---

## 🟢 2. KOHLI (2-Agent Engine, Arbitration API & Decision Cards)

### Current Status:
- ⏳ `[IN PROGRESS]` Skeleton agent files created in `src/agents/`.

### 📌 EXACT REMAINING TASKS TO DO FOR REVIEW 2:
- [ ] **Task K.1 (Inventory Agent)**: Edit `src/agents/inventory_agent.py` to query SQLite `inventory_items` for items where `current_stock < min_threshold` and return a reorder recommendation object (e.g., *"Reorder SKU-001 for ₹50,000"*).
- [ ] **Task K.2 (Finance Agent)**: Edit `src/agents/finance_agent.py` to calculate free liquid cash (`Bank Cash - Payroll Reserve`) and return a budget ceiling object (e.g., *"Max spend allowed = ₹20,000"*).
- [ ] **Task K.3 (2-Agent Arbitrator)**: Edit `src/arbitration.py` to compare both agent outputs and apply the rule capping the inventory reorder to ₹20,000.
- [ ] **Task K.4 (Agent API Routes)**: Create `src/api/routes/agent_routes.py` with `POST /api/agents/evaluate` to run both agents and return the arbitrated decision JSON.
- [ ] **Task K.5 (Agent Decision Cards JS)**: Create `frontend/js/agent_component.js` to dynamically render:
  - Yellow **Inventory Agent Card** (showing ₹50,000 requested).
  - Blue **Finance Agent Card** (showing ₹20,000 budget cap).
  - Green **Arbitrated Action Card** (showing final capped approval).

---

## 🟡 3. SOHAM (SHA-256 Audit Ledger, Payment API & Security Modal UI)

### Current Status:
- ⏳ `[IN PROGRESS]` Basic database helpers initialized in `src/core/database.py`.

### 📌 EXACT REMAINING TASKS TO DO FOR REVIEW 2:
- [ ] **Task S.1 (SHA-256 Audit Engine)**: Complete `src/core/audit.py` to hash all decision events into the SQLite `audit_ledger` table and implement `verify_chain()` to detect data tampering.
- [ ] **Task S.2 (3-Way Math Audit & Payment Client)**: Complete `src/payment/gateway_client.py` to verify `Subtotal + Tax = Grand Total` and execute a mock payment that updates invoice status to `"PAID"`.
- [ ] **Task S.3 (Settlement API Routes)**: Create `src/api/routes/settlement_routes.py` containing:
  - `GET /api/settlement/audit-verify`: Returns SHA-256 chain integrity status.
  - `POST /api/settlement/pay-invoice`: Executes mock payment after 3-way math check passes.
- [ ] **Task S.4 (Cryptographic Security Badge JS)**: Create top header bar component in `frontend/js/audit_payment_component.js` displaying **"SHA-256 Audit Ledger: 100% VERIFIED"**.
- [ ] **Task S.5 (Payment Checkout Modal JS)**: Create popup confirmation modal in `frontend/js/audit_payment_component.js` displaying supplier name, 3-way math check status, capped amount, and a **"Confirm & Release Payment"** button.
- [ ] **Task S.6 (Literature Survey Presentation)**: Assemble the 12-paper literature survey matrix for the Review 2 presentation deck.

---

## 🏁 Summary Checklist Matrix for Review 2

| Member | Backend File to Write | API Endpoint to Build | Frontend JS File to Write |
| :--- | :--- | :--- | :--- |
| **ARYAN** | `src/ingestion/digitalizer.py`<br>`src/api/main.py` | `POST /api/ingest/upload-file`<br>`GET /api/ingest/context` | `frontend/js/ingestion_component.js`<br>`frontend/index.html` |
| **KOHLI** | `src/agents/inventory_agent.py`<br>`src/agents/finance_agent.py`<br>`src/arbitration.py` | `POST /api/agents/evaluate` | `frontend/js/agent_component.js` |
| **SOHAM** | `src/core/audit.py`<br>`src/payment/gateway_client.py` | `GET /api/settlement/audit-verify`<br>`POST /api/settlement/pay-invoice` | `frontend/js/audit_payment_component.js` |

---

## 📂 Master Project File Structure & Strict Boundary Guidelines

> ⚠️ **CRITICAL PROMPT & INTEGRATION INSTRUCTIONS**:
> When copying this file structure into AI tools or giving prompts to build your specific module, **ONLY ask the AI to modify or generate files listed under YOUR name**.
> **DO NOT** prompt an AI to edit, overwrite, or re-implement files owned by another member!

```text
Capstone Project/
├── data/                                <-- SHARED DATABASE & TEST DATA (Read/Write via SQLite connection)
│   ├── sme_digitalized_data.db          <-- Single SQLite DB File
│   └── sample_documents/                <-- Test Invoices & CSVs
│
├── src/
│   ├── api/
│   │   ├── main.py                      <-- [OWNER: ARYAN] FastAPI Initialization & CORS
│   │   └── routes/
│   │       ├── ingestion_routes.py      <-- [OWNER: ARYAN] Ingestion & Context Endpoints
│   │       ├── agent_routes.py          <-- [OWNER: KOHLI] Agent Evaluation & Arbitration Endpoints
│   │       └── settlement_routes.py     <-- [OWNER: SOHAM] Payment & Audit Endpoints
│   │
│   ├── ingestion/                       <-- [OWNER: ARYAN] Layer 0 Data Extraction & Loading
│   │   ├── digitalizer.py
│   │   ├── column_resolver.py
│   │   └── win_ocr.py
│   │
│   ├── agents/                          <-- [OWNER: KOHLI] 2-Agent Logic for Review 2
│   │   ├── inventory_agent.py
│   │   └── finance_agent.py
│   ├── arbitration.py                   <-- [OWNER: KOHLI] 2-Agent Conflict Arbitrator
│   │
│   ├── payment/                         <-- [OWNER: SOHAM] Layer 3 Payment Gateway Execution
│   │   └── gateway_client.py
│   │
│   └── core/                            <-- [OWNER: SOHAM] Layer 4 Cryptographic Ledger
│       ├── audit.py
│       └── database.py
│
└── frontend/                            <-- CUSTOM FRONTEND WEB UI
    ├── css/
    │   └── main.css                     <-- [OWNER: ARYAN] Shared Dark Design System & Layout
    ├── index.html                       <-- [OWNER: ARYAN] HTML Web Shell
    └── js/
        ├── ingestion_component.js       <-- [OWNER: ARYAN] Upload Dropzone & Inventory Table JS
        ├── agent_component.js           <-- [OWNER: KOHLI] Agent Decision Cards JS
        └── audit_payment_component.js   <-- [OWNER: SOHAM] Security Badge & Payment Modal JS
```

---

### 🔒 Module Integration Rules
1. **Aryan's Boundary**: Owns data loading (`ingestion/`), main FastAPI server (`api/main.py`), and `ingestion_component.js`. Aryan's code writes raw documents to SQLite `inventory_items` and `digitalized_invoices`.
2. **Kohli's Boundary**: Owns `inventory_agent.py`, `finance_agent.py`, `arbitration.py`, `agent_routes.py`, and `agent_component.js`. Kohli's code reads from SQLite `inventory_items` and writes recommendations to `decision_logs`.
3. **Soham's Boundary**: Owns `audit.py`, `gateway_client.py`, `settlement_routes.py`, and `audit_payment_component.js`. Soham's code reads verified invoices, updates payment status to `"PAID"`, and hashes events into `audit_ledger`.
