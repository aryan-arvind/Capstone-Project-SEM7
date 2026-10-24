// Client Dashboard view: Overview KPIs, Editable AR/AP/Inventory tables,
// Human-in-the-loop Agent Decisions with source badges, and Scenario box.
import { money } from './v1data.js';

let activeTab = 'overview';
let currentSnapshot = null;
let currentLedger = null;
let switchViewCallback = null;
let digitizeState = {
  loading: false,
  docType: 'INVOICE',
  filename: '',
  columns: [],
  rows: [],
  error: null,
  successMsg: null
};

const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function initDashboard({ onRunCycle, onSwitchView }) {
  switchViewCallback = onSwitchView;
  const dashEl = document.getElementById('clientDashboard');
  if (!dashEl) return;

  // Tab switching
  dashEl.querySelectorAll('.cd-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      dashEl.querySelectorAll('.cd-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      activeTab = tab.dataset.tab;
      renderActiveTab();
    });
  });

  // Fetch initial ledger
  fetchLedger();
}

export function updateDashboardState(snap) {
  currentSnapshot = snap;
  if (!currentLedger && snap) {
    fetchLedger();
  }
  renderActiveTab();
}

async function fetchLedger() {
  try {
    const res = await fetch('/data/ledger.json?t=' + Date.now());
    if (res.ok) {
      currentLedger = await res.json();
      renderActiveTab();
    }
  } catch {}
}

function renderActiveTab() {
  const body = document.getElementById('cdBody');
  if (!body) return;

  switch (activeTab) {
    case 'overview':
      body.innerHTML = renderOverview();
      break;
    case 'ar':
      body.innerHTML = renderARTable();
      attachAREvents();
      break;
    case 'ap':
      body.innerHTML = renderAPTable();
      attachAPEvents();
      break;
    case 'inv':
      body.innerHTML = renderInventory();
      attachInvEvents();
      break;
    case 'decisions':
      body.innerHTML = renderDecisions();
      attachDecisionEvents();
      break;
    case 'scenarios':
      body.innerHTML = renderScenarios();
      attachScenarioEvents();
      break;
    case 'digitize':
      body.innerHTML = renderDigitize();
      attachDigitizeEvents();
      break;
  }
}

function renderOverview() {
  const m = currentSnapshot?.metrics || { cash: 0, runway: 0, dso: 0, dpo: 0, ccc: 0 };
  const b = currentSnapshot?.books || { ar: 0, ap: 0, inventory_units: 0, od_used: 0, od_limit: 0, gst_payable: 0 };
  const isLive = currentSnapshot?.mode === 'live';
  const src = isLive ? 'SQLite' : 'Synthetic';

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Executive Financial Overview</h2>
        <span class="cd-pill ${isLive ? 'live' : ''}">${isLive ? '● REAL OPENING BOOKS' : '○ SYNTHETIC MODEL'}</span>
      </div>
      <div class="cd-kpi-grid">
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash on Hand</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(m.cash)}</div>
          <div class="kpi-sub">Buffer floor: ${inr(currentSnapshot?.constraints?.min_cash_buffer || 300000)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Overdraft Facility</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.od_used)}</div>
          <div class="kpi-sub">Limit: ${inr(b.od_limit)} (Available: ${inr(b.od_limit - b.od_used)})</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Runway</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${m.runway ? m.runway.toFixed(1) : 0} wks</div>
          <div class="kpi-sub">Weekly burn: ~${inr(70000)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Receivables (AR)</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.ar)}</div>
          <div class="kpi-sub">DSO: ${m.dso ? m.dso.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Payables (AP)</span><span class="kpi-src">${src}</span></div>
          <div class="kpi-val">${inr(b.ap)}</div>
          <div class="kpi-sub">DPO: ${m.dpo ? m.dpo.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Conversion (CCC)</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${m.ccc ? m.ccc.toFixed(0) : 0} days</div>
          <div class="kpi-sub">DIO: ${m.dio ? m.dio.toFixed(0) : 0} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Inventory On Hand</span><span class="kpi-src">${src}</span></div>
          <div class="kpi-val">${b.inventory_units.toLocaleString('en-IN')} units</div>
          <div class="kpi-sub">Capacity: ${currentSnapshot?.constraints?.inventory_capacity_units || 6000} units</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">GST Liability</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.gst_payable)}</div>
          <div class="kpi-sub">Mandatory compliance dues</div>
        </div>
      </div>
    </div>
  `;
}

function renderARTable() {
  const arList = currentLedger?.ar || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Receivable (Customer Invoices)</h2>
        <button id="btnAddAR" class="cd-btn-primary">+ Add Customer Invoice</button>
      </div>
      <table class="cd-table">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Customer Name</th>
            <th style="text-align:right">Amount (₹)</th>
            <th style="text-align:center">Issued Week</th>
            <th style="text-align:center">Due Week</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${arList.length ? arList.map((row, idx) => `
            <tr>
              <td><code>${esc(row.id)}</code></td>
              <td>${esc(row.customer)}</td>
              <td style="text-align:right"><b>${inr(row.amount)}</b></td>
              <td style="text-align:center">Week ${row.issued}</td>
              <td style="text-align:center"><span class="due-tag">Week ${row.due}</span></td>
              <td style="text-align:center"><button class="cd-del-btn" data-type="ar" data-idx="${idx}">Delete</button></td>
            </tr>
          `).join('') : '<tr><td colspan="6" class="cd-empty">No receivables registered.</td></tr>'}
        </tbody>
      </table>
      <div class="cd-save-bar">
        <button id="btnSaveLedger" class="cd-btn-save">Save & Sync to Live Books</button>
      </div>
    </div>
  `;
}

function renderAPTable() {
  const apList = currentLedger?.ap || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Payable (Supplier Invoices)</h2>
        <button id="btnAddAP" class="cd-btn-primary">+ Add Supplier Invoice</button>
      </div>
      <table class="cd-table">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Supplier Name</th>
            <th style="text-align:right">Amount (₹)</th>
            <th style="text-align:center">Issued Week</th>
            <th style="text-align:center">Due Week</th>
            <th style="text-align:center">MSME Vendor</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${apList.length ? apList.map((row, idx) => `
            <tr>
              <td><code>${esc(row.id)}</code></td>
              <td>${esc(row.supplier)}</td>
              <td style="text-align:right"><b>${inr(row.amount)}</b></td>
              <td style="text-align:center">Week ${row.issued}</td>
              <td style="text-align:center">Week ${row.due}</td>
              <td style="text-align:center"><span class="msme-badge ${row.msme ? 'yes' : 'no'}">${row.msme ? '✓ MSME (45-Day)' : 'Standard'}</span></td>
              <td style="text-align:center"><button class="cd-del-btn" data-type="ap" data-idx="${idx}">Delete</button></td>
            </tr>
          `).join('') : '<tr><td colspan="7" class="cd-empty">No payables registered.</td></tr>'}
        </tbody>
      </table>
      <div class="cd-save-bar">
        <button id="btnSaveLedger" class="cd-btn-save">Save & Sync to Live Books</button>
      </div>
    </div>
  `;
}

function renderInventory() {
  const inv = currentLedger?.inventory || { units: 3530, unit_cost: 320 };
  return `
    <div class="cd-section">
      <div class="cd-head"><h2>Inventory & Warehouse Position</h2></div>
      <div class="cd-kpi-grid" style="margin-bottom:20px">
        <div class="cd-card">
          <div class="kpi-label">Stock Units</div>
          <div class="kpi-val">${inv.units.toLocaleString('en-IN')}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-label">Weighted Unit Cost</div>
          <div class="kpi-val">${inr(inv.unit_cost)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-label">Valuation on Books</div>
          <div class="kpi-val">${inr(inv.units * inv.unit_cost)}</div>
        </div>
      </div>
      <div class="cd-form-row">
        <label>Update Current Stock Units: <input type="number" id="inpInvUnits" value="${inv.units}"></label>
        <label>Update Unit Cost (₹): <input type="number" id="inpInvCost" value="${inv.unit_cost}"></label>
        <button id="btnSaveInv" class="cd-btn-save" style="margin-top:auto">Apply Inventory</button>
      </div>
    </div>
  `;
}

function renderDecisions() {
  const tasks = currentSnapshot?.tasks || [];
  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Specialist Agent Proposals & Human Arbitration Overrides</h2>
        <span class="cd-sub-note">Review LLM/Rule decisions. Human decisions override agent recommendations.</span>
      </div>
      <div class="cd-decisions-list">
        ${tasks.length ? tasks.map(t => `
          <div class="cd-decision-card ${t.state}">
            <div class="d-top">
              <span class="d-dept ${t.dept}">${esc(t.dept?.toUpperCase())}</span>
              <span class="d-action">${esc(t.label || t.action_type)}</span>
              <span class="d-src-badge ${t.source?.startsWith('llm') ? 'llm' : 'rule'}">${esc(t.source || 'rule-fallback')}</span>
              <span class="sp"></span>
              <span class="d-amt">${inr(t.amount_approved_inr ?? t.amount_inr)}</span>
            </div>
            <div class="d-mid">
              <div class="d-reason">${esc(t.rationale || t.reason || 'Specialist recommendation')}</div>
              <div class="d-meta">Confidence: <b>${Math.round((t.confidence || 0) * 100)}%</b> | Week: ${t.timing_week} | Cash Impact: <b>${inr(t.cash_impact_inr)}</b></div>
            </div>
            <div class="d-bottom">
              <span class="d-status ${t.state}">Status: <b>${esc(t.state?.toUpperCase())}</b></span>
              <span class="sp"></span>
              <div class="d-actions">
                <button class="btn-override-approve" data-id="${t.id}">Approve</button>
                <button class="btn-override-reject" data-id="${t.id}">Reject</button>
              </div>
            </div>
          </div>
        `).join('') : '<div class="cd-empty">No decisions in current cycle. Click "RUN DECISION CYCLE" in Scenarios tab to generate proposals.</div>'}
      </div>
    </div>
  `;
}

function renderScenarios() {
  return `
    <div class="cd-section">
      <div class="cd-head"><h2>Market Stress Testing & Decision Engine</h2></div>
      <div class="cd-card" style="padding:22px; max-width:800px">
        <h3>Inject Market Shock or Custom Scenario</h3>
        <p style="color:var(--grey); font-size:12px; margin: 8px 0 16px;">
          Simulate supply chain bottlenecks, demand surges, or delayed payments. The Arbiter verifies whether cash buffers hold.
        </p>
        <div style="display:flex; gap:12px; margin-bottom:14px;">
          <select id="selPresetScenario" style="padding:9px; border-radius:8px; border:1px solid var(--hairline); flex:1">
            <option value="">Select Pre-configured Scenario...</option>
            <option value="delayed_receivable">Delayed Receivable (4-week delay on largest customer)</option>
            <option value="supplier_price_spike">Supplier Price Spike (+40% unit raw material cost)</option>
            <option value="demand_surge">Demand Surge (+80% sales order intake)</option>
            <option value="credit_limit_tightened">Credit Limit Tightened (Bank cuts OD by 50%)</option>
          </select>
          <button id="btnInjectPreset" class="cd-btn-primary">Inject Preset</button>
        </div>
        <div style="margin-top:20px;">
          <label style="font-size:11px; font-weight:700; color:var(--grey); text-transform:uppercase">Custom Free-Text Scenario</label>
          <textarea id="txtCustomScenario" style="width:100%; height:70px; margin-top:6px; padding:8px; border:1px solid var(--hairline); border-radius:8px; font-family:var(--ui)" placeholder="e.g. Major automotive client delayed payment of ₹1.4L by 3 weeks due to inventory audit..."></textarea>
        </div>
        <div style="display:flex; gap:12px; margin-top:20px; align-items:center">
          <button id="btnRunDashCycle" class="cd-btn-run">RUN DECISION CYCLE (3D ANIMATED)</button>
          <span style="font-size:12px; color:var(--grey)">Triggers 6 specialist LLM/Rule agents and updates books.</span>
        </div>
      </div>
    </div>
  `;
}

function attachAREvents() {
  document.getElementById('btnAddAR')?.addEventListener('click', () => {
    const cust = prompt('Enter Customer Name:', 'New OEM Sub-tier');
    if (!cust) return;
    const amt = parseInt(prompt('Enter Invoice Amount (₹):', '50000'), 10);
    if (!amt || amt <= 0) return alert('Invalid amount');
    currentLedger.ar.push({
      id: `AR_${Date.now().toString(36).toUpperCase()}`,
      customer: cust,
      amount: amt,
      issued: 0,
      due: 4
    });
    renderActiveTab();
  });

  document.querySelectorAll('.cd-del-btn[data-type="ar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentLedger.ar.splice(idx, 1);
      renderActiveTab();
    });
  });

  document.getElementById('btnSaveLedger')?.addEventListener('click', saveLedgerChanges);
}

function attachAPEvents() {
  document.getElementById('btnAddAP')?.addEventListener('click', () => {
    const supp = prompt('Enter Supplier Name:', 'Vendor Steel Ltd');
    if (!supp) return;
    const amt = parseInt(prompt('Enter Invoice Amount (₹):', '25000'), 10);
    if (!amt || amt <= 0) return alert('Invalid amount');
    const isMsme = confirm('Is this an MSME vendor? (Subject to 45-day statutory payment rule)');
    currentLedger.ap.push({
      id: `AP_${Date.now().toString(36).toUpperCase()}`,
      supplier: supp,
      amount: amt,
      issued: 0,
      due: 6,
      msme: isMsme
    });
    renderActiveTab();
  });

  document.querySelectorAll('.cd-del-btn[data-type="ap"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentLedger.ap.splice(idx, 1);
      renderActiveTab();
    });
  });

  document.getElementById('btnSaveLedger')?.addEventListener('click', saveLedgerChanges);
}

function attachInvEvents() {
  document.getElementById('btnSaveInv')?.addEventListener('click', () => {
    const u = parseInt(document.getElementById('inpInvUnits').value, 10);
    const c = parseInt(document.getElementById('inpInvCost').value, 10);
    if (isNaN(u) || u < 0 || isNaN(c) || c < 0) return alert('Please enter valid non-negative numbers');
    currentLedger.inventory = { units: u, unit_cost: c };
    saveLedgerChanges();
  });
}

function attachDecisionEvents() {
  document.querySelectorAll('.btn-override-approve').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      await fetch('/api/msme/decision/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, outcome: 'approved' })
      });
      const res = await (await fetch('/api/msme/state')).json();
      updateDashboardState(res);
    });
  });

  document.querySelectorAll('.btn-override-reject').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      await fetch('/api/msme/decision/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, outcome: 'rejected' })
      });
      const res = await (await fetch('/api/msme/state')).json();
      updateDashboardState(res);
    });
  });
}

function attachScenarioEvents() {
  document.getElementById('btnInjectPreset')?.addEventListener('click', async () => {
    const sel = document.getElementById('selPresetScenario');
    if (!sel.value) return alert('Please select a scenario first');
    await fetch('/api/msme/inject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: sel.value })
    });
    alert(`Injected: ${sel.options[sel.selectedIndex].text}`);
    const res = await (await fetch('/api/msme/state')).json();
    updateDashboardState(res);
  });

  document.getElementById('btnRunDashCycle')?.addEventListener('click', async () => {
    if (switchViewCallback) switchViewCallback('office');
    const runBtn = document.querySelector('.pp-run');
    if (runBtn) runBtn.click();
  });
}

async function saveLedgerChanges() {
  try {
    const res = await fetch('/api/msme/ledger/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(currentLedger)
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Validation Error: ' + (data.error || 'Failed to save ledger'));
    } else {
      alert('Ledger successfully saved and synced with live simulation state!');
      updateDashboardState(data);
    }
  } catch (e) {
    alert('Error saving ledger: ' + e.message);
  }
}


function renderDigitize() {
  const isBusy = digitizeState.loading;
  const hasData = digitizeState.rows && digitizeState.rows.length > 0;

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Document Digitizer & Verification (Python Cascade)</h2>
        <span class="cd-pill ${digitizeState.docType === 'INVOICE' ? 'live' : ''}">
          ${digitizeState.docType || 'READY'}
        </span>
      </div>
      <p style="color:var(--grey);font-size:13px;margin:4px 0 16px 0;">
        Upload B2B invoices (TXT, PDF, PNG/JPG) or inventory logs (CSV). The Python backend extracts structured tables,
        applies column header fuzzy matching, normalizes GSTIN/tax fields, and validates receipt arithmetic.
      </p>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">Quick Test with Sample SME Documents:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnSampleB2B" class="cd-btn" ${isBusy ? 'disabled' : ''}>📄 B2B Invoice (Dell/Fastener PO)</button>
          <button id="btnSampleInv" class="cd-btn" ${isBusy ? 'disabled' : ''}>📊 SME Inventory (Messy CSV)</button>
          <button id="btnSampleBill" class="cd-btn" ${isBusy ? 'disabled' : ''}>🧾 Restaurant Receipt (Scan Text)</button>
        </div>
      </div>

      <div class="cd-card" style="margin-bottom:16px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--ink);">Upload Document:</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <input type="file" id="digFileInput" accept=".txt,.csv,.json,.pdf,.png,.jpg,.jpeg" style="font-family:var(--ui);font-size:12px;">
          <button id="btnParseUploaded" class="cd-btn primary" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? '⏳ Processing via Python...' : '⚡ Run Digitizer / OCR'}
          </button>
        </div>
        ${digitizeState.error ? `<div style="color:#d9534f;font-size:12px;margin-top:8px;">⚠️ ${esc(digitizeState.error)}</div>` : ''}
        ${digitizeState.successMsg ? `<div style="color:#28a745;font-weight:600;font-size:12px;margin-top:8px;">✓ ${esc(digitizeState.successMsg)}</div>` : ''}
      </div>

      ${hasData ? `
        <div class="cd-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <span style="font-weight:600;font-size:14px;color:var(--ink);">Extracted & Verified Records</span>
              <span style="color:var(--grey);font-size:12px;margin-left:8px;">Source: ${esc(digitizeState.filename)} (${digitizeState.rows.length} rows)</span>
            </div>
            <button id="btnAddDigitizeRow" class="cd-btn" style="font-size:11px;">+ Add Line Item</button>
          </div>

          <div style="overflow-x:auto;">
            <table class="cd-table" id="digReviewTable">
              <thead>
                <tr>
                  ${digitizeState.columns.map(c => `<th>${esc(c.toUpperCase().replace(/_/g, ' '))}</th>`).join('')}
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                ${digitizeState.rows.map((row, idx) => `
                  <tr data-idx="${idx}">
                    ${digitizeState.columns.map(col => `
                      <td>
                        <input class="dig-cell" data-idx="${idx}" data-col="${col}"
                               value="${esc(row[col] ?? '')}"
                               style="width:100%;background:transparent;border:1px solid transparent;font-family:inherit;font-size:12px;padding:3px;color:inherit;"
                               onfocus="this.style.borderColor='var(--hairline)'" onblur="this.style.borderColor='transparent'">
                      </td>
                    `).join('')}
                    <td><button class="cd-del-btn btn-del-dig" data-idx="${idx}">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:12px;color:var(--grey);">
              Review and edit values above, then commit to persist to SQLite (<code>sme_digitalized_data.db</code>).
            </div>
            <button id="btnCommitDigitized" class="cd-btn primary" style="background:#28a745;color:#fff;font-weight:600;padding:8px 18px;">
              💾 COMMIT TO BOOKS & REFRESH LEDGER
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function attachDigitizeEvents() {
  const parseBtn = document.getElementById('btnParseUploaded');
  const fileInput = document.getElementById('digFileInput');

  // Sample document buttons
  document.getElementById('btnSampleB2B')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/b2b_purchase_order.txt', 'b2b_purchase_order.txt');
  });
  document.getElementById('btnSampleInv')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/messy_sme_inventory.csv', 'messy_sme_inventory.csv');
  });
  document.getElementById('btnSampleBill')?.addEventListener('click', async () => {
    runParseForSample('data/sample_documents/restaurant_bill_sample.txt', 'restaurant_bill_sample.txt');
  });

  // Uploaded file parse
  parseBtn?.addEventListener('click', () => {
    if (!fileInput?.files?.length) return alert('Please select a file to digitize');
    const file = fileInput.files[0];
    const reader = new FileReader();

    digitizeState.loading = true;
    digitizeState.error = null;
    digitizeState.successMsg = null;
    renderActiveTab();

    if (file.name.match(/\.(txt|csv|json)$/i)) {
      reader.onload = async () => {
        try {
          const res = await fetch('/api/msme/digitize/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, content: reader.result })
          });
          const data = await res.json();
          handleParseResponse(data, file.name);
        } catch (err) {
          digitizeState.loading = false;
          digitizeState.error = err.message;
          renderActiveTab();
        }
      };
      reader.readAsText(file);
    } else {
      // Binary (PDF / Image) -> Base64
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const res = await fetch('/api/msme/digitize/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentBase64: base64 })
          });
          const data = await res.json();
          handleParseResponse(data, file.name);
        } catch (err) {
          digitizeState.loading = false;
          digitizeState.error = err.message;
          renderActiveTab();
        }
      };
      reader.readAsDataURL(file);
    }
  });

  // Table cell inputs change listener
  document.querySelectorAll('.dig-cell').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.idx;
      const col = e.target.dataset.col;
      if (digitizeState.rows[idx]) {
        let val = e.target.value;
        if (col.includes('stock') || col.includes('cost') || col.includes('amount') || col.includes('total') || col.includes('subtotal')) {
          const num = parseFloat(val);
          if (!isNaN(num)) val = num;
        }
        digitizeState.rows[idx][col] = val;
      }
    });
  });

  // Delete row
  document.querySelectorAll('.btn-del-dig').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      digitizeState.rows.splice(idx, 1);
      renderActiveTab();
    });
  });

  // Add row
  document.getElementById('btnAddDigitizeRow')?.addEventListener('click', () => {
    const blank = {};
    digitizeState.columns.forEach(c => blank[c] = '');
    digitizeState.rows.push(blank);
    renderActiveTab();
  });

  // Commit to books
  document.getElementById('btnCommitDigitized')?.addEventListener('click', async () => {
    if (!digitizeState.rows.length) return alert('No rows to commit');
    try {
      const btn = document.getElementById('btnCommitDigitized');
      if (btn) btn.disabled = true;

      const res = await fetch('/api/msme/digitize/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doc_type: digitizeState.docType,
          rows: digitizeState.rows
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Commit error: ' + (data.error || 'Failed to commit records'));
      } else {
        digitizeState.successMsg = data.message;
        digitizeState.rows = [];
        await fetchLedger();
        const stateRes = await (await fetch('/api/msme/state')).json();
        updateDashboardState(stateRes);
        renderActiveTab();
        alert('✓ ' + data.message);
      }
    } catch (e) {
      alert('Error committing to books: ' + e.message);
    }
  });
}

async function runParseForSample(relPath, sampleName) {
  try {
    digitizeState.loading = true;
    digitizeState.error = null;
    digitizeState.successMsg = null;
    renderActiveTab();

    const sampleRes = await fetch('/' + relPath + '?t=' + Date.now());
    let content = '';
    if (sampleRes.ok) {
      content = await sampleRes.text();
    }
    const res = await fetch('/api/msme/digitize/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: sampleName, content })
    });
    const data = await res.json();
    handleParseResponse(data, sampleName);
  } catch (err) {
    digitizeState.loading = false;
    digitizeState.error = err.message;
    renderActiveTab();
  }
}

function handleParseResponse(data, fallbackName) {
  digitizeState.loading = false;
  if (!data.success) {
    digitizeState.error = data.error || 'Failed to parse document';
    renderActiveTab();
    return;
  }
  digitizeState.docType = data.doc_type || 'INVOICE';
  digitizeState.filename = data.filename || fallbackName;
  digitizeState.columns = data.columns || Object.keys(data.rows?.[0] || {});
  digitizeState.rows = data.rows || [];
  digitizeState.error = null;
  digitizeState.successMsg = `Successfully parsed ${digitizeState.rows.length} records from ${digitizeState.filename}.`;
  renderActiveTab();
}
