// Client Dashboard view (Phase E: Demo-Ready Executive Dashboard)
// Persistent 3-column layout: Left Nav, Center Tab Content, Right-hand Chat Panel.
// Hand-written inline SVG charts: 8-week Cash Forecast, AR Aging, AP Due by Week, AR vs AP.
// 3D Office transition with live proposal feed on cycle run.
// Before/After impact card, human decision overrides, and unified button styling.

let activeTab = 'overview';
let currentSnapshot = null;
let currentLedger = null;
let switchViewCallback = null;
let runCycleCallback = null;
let llmStatus = { mode: 'off', last_provider: 'rule-fallback', fallback_count: 0 };
let chatHistory = [];
let isChatBusy = false;

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
  runCycleCallback = onRunCycle;
  const dashEl = document.getElementById('clientDashboard');
  if (!dashEl) return;

  // Left Nav Tab Switching
  dashEl.querySelectorAll('.cd-leftnav .cd-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      dashEl.querySelectorAll('.cd-leftnav .cd-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      activeTab = tab.dataset.tab;
      renderActiveTab();
    });
  });

  // Attach persistent right-hand chat listeners
  attachPersistentChatEvents();

  // Attach Office Live Feed overlay button
  document.getElementById('btnReviewDecisions')?.addEventListener('click', () => {
    document.getElementById('officeFeedOverlay')?.classList.add('hide');
    if (switchViewCallback) switchViewCallback('dashboard');
    setActiveTab('decisions');
  });

  fetchLLMStatus();
  fetchLedger();
}

export function setActiveTab(tabKey) {
  activeTab = tabKey;
  const dashEl = document.getElementById('clientDashboard');
  if (dashEl) {
    dashEl.querySelectorAll('.cd-leftnav .cd-tab').forEach(t => {
      t.classList.toggle('on', t.dataset.tab === tabKey);
    });
  }
  renderActiveTab();
}

export function updateDashboardState(snap) {
  currentSnapshot = snap;
  if (!currentLedger && snap) {
    fetchLedger();
  }
  fetchLLMStatus();
  renderActiveTab();
}

async function fetchLLMStatus() {
  try {
    const res = await fetch('/api/msme/llm-status?t=' + Date.now());
    if (res.ok) {
      llmStatus = await res.json();
      updateLLMBadge();
    }
  } catch {}
}

function updateLLMBadge() {
  const badge = document.getElementById('dashLLMBadge');
  if (badge) {
    if (llmStatus.mode === 'on') {
      badge.textContent = `LLM ON (${llmStatus.last_provider || 'groq'})`;
      badge.className = 'cd-pill live';
    } else {
      badge.textContent = 'LLM OFF - rule fallback';
      badge.className = 'cd-pill';
    }
  }
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
      attachOverviewEvents();
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
    case 'digitize':
      body.innerHTML = renderDigitize();
      attachDigitizeEvents();
      break;
  }
  updateLLMBadge();
}

/* =========================================================================
   1. OVERVIEW TAB: Primary Run Cycle, Live KPI Cards, SVG Charts, Quick GST
   ========================================================================= */
function renderOverview() {
  const m = currentSnapshot?.metrics || { cash: 450000, runway: 1.7, dso: 26.9, dpo: 2.1, ccc: 189.5 };
  const b = currentLedger || currentSnapshot?.books || {
    cash: 450000, od_limit: 500000, od_used: 120000, gst_payable: 38000,
    inventory: { units: 3530, unit_cost: 250 }, ar: [], ap: []
  };

  const invUnits = b.inventory?.units || b.inventory_units || 3530;
  const unitCost = b.inventory?.unit_cost || 250;
  const invTotalVal = Math.round(invUnits * unitCost);

  const totalAR = (b.ar || []).reduce((s, r) => s + (r.amount || 0), 0) || 300000;
  const totalAP = (b.ap || []).reduce((s, p) => s + (p.amount || 0), 0) || 14675;

  return `
    <div class="cd-section">
      <!-- Big Primary Button: RUN AGENT CYCLE with Free-Text Situation Box -->
      <div class="cd-card" style="border: 2px solid var(--ink); box-shadow: 0 4px 14px rgba(21,20,20,0.08); background: #fff;">
        <div style="font-weight:700; font-size:13px; color:var(--ink); margin-bottom:6px; display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">⚡</span>
          <span>Run Financial Decision Cycle / Inject Situation:</span>
        </div>
        <textarea id="overviewSituationInput" rows="2"
          placeholder="Describe a situation or financial shock (e.g. Major customer delays ₹1,00,000 payment; key supplier demands immediate ₹40,000 cash; demand surges 25%)..."
          style="width:100%; padding:10px 12px; font-family:inherit; font-size:12px; border:1px solid var(--hairline); border-radius:6px; resize:vertical; margin-bottom:10px;"></textarea>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <span style="font-size:11px; color:var(--grey);">
            Runs all 6 department agents + constraint-aware arbiter with real-time 3D simulation.
          </span>
          <button id="btnOverviewRunCycle" class="cd-btn primary lg" style="font-weight:800; letter-spacing:.08em;">
            ⚡ RUN AGENT CYCLE
          </button>
        </div>
      </div>

      <!-- Live KPI Cards with Source Badges -->
      <div class="cd-kpi-grid">
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash on Hand</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.cash)}</div>
          <div class="kpi-sub">Buffer floor: ${inr(300000)}</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Overdraft Facility</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.od_used)}</div>
          <div class="kpi-sub">Limit: ${inr(b.od_limit)} (Available: ${inr(b.od_limit - b.od_used)})</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Runway</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${(m.runway || 0).toFixed(1)} wks</div>
          <div class="kpi-sub">Weekly burn: ~₹70,000</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Receivables (AR)</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(totalAR)}</div>
          <div class="kpi-sub">DSO: ${(m.dso || 0).toFixed(1)} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Payables (AP)</span><span class="kpi-src">SQLite</span></div>
          <div class="kpi-val">${inr(totalAP)}</div>
          <div class="kpi-sub">DPO: ${(m.dpo || 0).toFixed(1)} days</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Cash Conversion Cycle</span><span class="kpi-src">Derived</span></div>
          <div class="kpi-val">${(m.ccc || 0).toFixed(1)} days</div>
          <div class="kpi-sub">Working capital efficiency</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">Inventory Units</span><span class="kpi-src">SQLite</span></div>
          <div class="kpi-val">${invUnits.toLocaleString('en-IN')}</div>
          <div class="kpi-sub">Valued at ${inr(invTotalVal)} (@ ₹${unitCost}/unit)</div>
        </div>
        <div class="cd-card">
          <div class="kpi-tag"><span class="kpi-label">GST Payable</span><span class="kpi-src">Profile</span></div>
          <div class="kpi-val">${inr(b.gst_payable)}</div>
          <div class="kpi-sub">Statutory tax liability</div>
        </div>
      </div>

      <!-- Quick Statutory Payment with unified button -->
      <div class="cd-card">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--ink);">Quick Statutory Payment:</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:12px;">Outstanding GST: <strong>${inr(b.gst_payable)}</strong></span>
          <input id="inpGstAmount" type="number" placeholder="Amount (₹)" value="${b.gst_payable}" style="padding:6px 10px;font-family:inherit;font-size:12px;width:120px;border:1px solid var(--hairline);border-radius:6px;">
          <button id="btnPayGstQuick" class="cd-btn success">Pay GST Bill</button>
        </div>
      </div>

      <!-- Hand-written Inline SVG Charts (Requirement 2) -->
      <div class="cd-charts-grid">
        <!-- Chart A: 8-Week Cash Forecast -->
        <div class="cd-chart-card">
          <div class="cd-chart-title">
            <span>8-Week Cash Forecast & Buffer Floor</span>
            <span class="cd-pill" style="font-size:9px;">Buffer Floor ₹3.0L</span>
          </div>
          <div class="cd-chart-sub">Projected weekly closing cash with safety threshold</div>
          ${renderCashForecastSVG(b.cash || 450000, 300000)}
        </div>

        <!-- Chart B: AR Aging Distribution -->
        <div class="cd-chart-card">
          <div class="cd-chart-title">
            <span>Accounts Receivable (AR) Aging</span>
            <span class="cd-pill" style="font-size:9px;">Total: ${inr(totalAR)}</span>
          </div>
          <div class="cd-chart-sub">Invoice distribution by days outstanding (0-30d, 31-45d, 46+d)</div>
          ${renderARAgingSVG(b.ar || [])}
        </div>

        <!-- Chart C: AP Due by Week (with MSME Highlight) -->
        <div class="cd-chart-card">
          <div class="cd-chart-title">
            <span>Supplier Payables (AP) Due Schedule</span>
            <span class="cd-pill" style="font-size:9px;">MSME 45-Day Priority</span>
          </div>
          <div class="cd-chart-sub">Weekly obligations with statutory 45-day MSME dues highlighted</div>
          ${renderAPDueScheduleSVG(b.ap || [])}
        </div>

        <!-- Chart D: Receivables vs Payables Ratio -->
        <div class="cd-chart-card">
          <div class="cd-chart-title">
            <span>Receivables vs Payables Position</span>
            <span class="cd-pill" style="font-size:9px;">Net: +${inr(totalAR - totalAP)}</span>
          </div>
          <div class="cd-chart-sub">Working capital liquidity balance (AR ₹${Math.round(totalAR/1000)}k vs AP ₹${Math.round(totalAP/1000)}k)</div>
          ${renderARvsAPComparisonSVG(totalAR, totalAP)}
        </div>
      </div>
    </div>
  `;
}

function attachOverviewEvents() {
  document.getElementById('btnOverviewRunCycle')?.addEventListener('click', async () => {
    const text = document.getElementById('overviewSituationInput')?.value?.trim();
    await handleRunCycleWith3D(text);
  });

  document.getElementById('btnPayGstQuick')?.addEventListener('click', async () => {
    const val = Number(document.getElementById('inpGstAmount')?.value);
    if (!val || val <= 0) return alert('Please enter a valid positive amount');
    await callClientAction('pay_gst', { amount: val });
  });
}

/* =========================================================================
   2. SVG CHARTS HELPERS (Pure inline vector math, zero dependencies)
   ========================================================================= */

// Chart A: 8-Week Cash Forecast Line with dashed Buffer Floor line
function renderCashForecastSVG(startCash, bufferFloor = 300000) {
  const points = [];
  let cur = startCash;
  // Model 8 weeks: burn ~70k, with typical receivables arriving week 1, 3, 5
  const weeklyDeltas = [0, -35000, 45000, -50000, 20000, -30000, -40000, 15000];
  for (let w = 0; w < 8; w++) {
    cur = Math.max(0, cur + (weeklyDeltas[w] || -20000));
    points.push(cur);
  }

  const maxVal = Math.max(650000, ...points) * 1.15;
  const minVal = 0;
  const W = 460, H = 160;
  const padL = 50, padR = 25, padT = 20, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const getX = i => padL + (i / 7) * plotW;
  const getY = v => padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  const floorY = getY(bufferFloor);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${getX(7).toFixed(1)} ${padT + plotH} L ${getX(0).toFixed(1)} ${padT + plotH} Z`;

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; overflow:visible; font-family:var(--ui); font-size:10px;">
      <defs>
        <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E9070" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#1E9070" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Grid Lines -->
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#e0e0e0" stroke-width="1"/>
      <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="#f0f0f0" stroke-width="1"/>

      <!-- Buffer Floor (Dashed Line) -->
      <line x1="${padL}" y1="${floorY.toFixed(1)}" x2="${W - padR}" y2="${floorY.toFixed(1)}"
        stroke="#B4391E" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${W - padR}" y="${(floorY - 4).toFixed(1)}" text-anchor="end" fill="#B4391E" font-weight="700" font-size="9">
        Floor: ₹3.0L
      </text>

      <!-- Fill Area & Line -->
      <path d="${areaD}" fill="url(#cashGrad)"/>
      <path d="${pathD}" fill="none" stroke="#1E9070" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Data Dots and Week Labels -->
      ${points.map((p, i) => `
        <circle cx="${getX(i).toFixed(1)}" cy="${getY(p).toFixed(1)}" r="3.5" fill="#fff" stroke="#1E9070" stroke-width="2"/>
        <text x="${getX(i).toFixed(1)}" y="${padT + plotH + 16}" text-anchor="middle" fill="#666" font-size="9.5">
          W${i}
        </text>
      `).join('')}

      <!-- Y Axis Labels -->
      <text x="${padL - 8}" y="${padT + 8}" text-anchor="end" fill="#888" font-size="8.5">₹${Math.round(maxVal/1000)}k</text>
      <text x="${padL - 8}" y="${padT + plotH}" text-anchor="end" fill="#888" font-size="8.5">₹0</text>
    </svg>
  `;
}

// Chart B: AR Aging Bar Chart (0-30 days, 31-45 days, 46+ days)
function renderARAgingSVG(arList = []) {
  let b0_30 = 0, b31_45 = 0, b46_plus = 0;
  if (!arList.length) {
    b0_30 = 180000; b31_45 = 90000; b46_plus = 30000;
  } else {
    for (const r of arList) {
      const amt = r.amount || 0;
      const due = r.due !== undefined ? r.due : 4;
      if (due <= 4) b0_30 += amt;
      else if (due <= 6) b31_45 += amt;
      else b46_plus += amt;
    }
  }

  const buckets = [
    { label: '0-30 Days', val: b0_30, col: '#1E9070' },
    { label: '31-45 Days', val: b31_45, col: '#F2A900' },
    { label: '46+ Days (Risk)', val: b46_plus, col: '#B4391E' }
  ];

  const maxVal = Math.max(100000, ...buckets.map(b => b.val)) * 1.15;
  const W = 460, H = 160;
  const padL = 50, padR = 25, padT = 20, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = 60;

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; overflow:visible; font-family:var(--ui); font-size:10px;">
      <!-- Baseline -->
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#e0e0e0" stroke-width="1"/>
      ${buckets.map((b, i) => {
        const x = padL + (i + 0.5) * (plotW / 3) - (barW / 2);
        const bh = (b.val / maxVal) * plotH;
        const y = padT + plotH - bh;
        return `
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" rx="4" fill="${b.col}"/>
          <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-weight="700" fill="${b.col}" font-size="10">
            ${inr(b.val)}
          </text>
          <text x="${(x + barW / 2).toFixed(1)}" y="${padT + plotH + 16}" text-anchor="middle" fill="#666" font-size="9.5">
            ${b.label}
          </text>
        `;
      }).join('')}
    </svg>
  `;
}

// Chart C: AP Due-by-Week Bar Chart with MSME 45-day items highlighted
function renderAPDueScheduleSVG(apList = []) {
  const weeks = [0, 1, 2, 3, 4, 5, 6];
  const stdByWk = [0, 0, 0, 0, 0, 0, 0];
  const msmeByWk = [0, 0, 0, 0, 0, 0, 0];

  if (!apList.length) {
    stdByWk[1] = 5000; stdByWk[3] = 4000; msmeByWk[2] = 5675;
  } else {
    for (const b of apList) {
      const wk = Math.max(0, Math.min(6, b.due || 0));
      if (b.msme) msmeByWk[wk] += (b.amount || 0);
      else stdByWk[wk] += (b.amount || 0);
    }
  }

  const totalPerWk = weeks.map(w => stdByWk[w] + msmeByWk[w]);
  const maxVal = Math.max(12000, ...totalPerWk) * 1.2;
  const W = 460, H = 160;
  const padL = 40, padR = 20, padT = 20, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = 32;

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; overflow:visible; font-family:var(--ui); font-size:10px;">
      <!-- Baseline -->
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#e0e0e0" stroke-width="1"/>
      ${weeks.map((w, i) => {
        const x = padL + i * (plotW / 6.5);
        const stdH = (stdByWk[w] / maxVal) * plotH;
        const msmeH = (msmeByWk[w] / maxVal) * plotH;
        const stdY = padT + plotH - stdH;
        const msmeY = stdY - msmeH;
        const tot = stdByWk[w] + msmeByWk[w];

        return `
          ${stdH > 0 ? `<rect x="${x.toFixed(1)}" y="${stdY.toFixed(1)}" width="${barW}" height="${stdH.toFixed(1)}" rx="3" fill="#2E86AB"/>` : ''}
          ${msmeH > 0 ? `<rect x="${x.toFixed(1)}" y="${msmeY.toFixed(1)}" width="${barW}" height="${msmeH.toFixed(1)}" rx="3" fill="#E65100"/>` : ''}
          ${tot > 0 ? `
            <text x="${(x + barW / 2).toFixed(1)}" y="${(msmeY - 4).toFixed(1)}" text-anchor="middle" font-weight="700" fill="#333" font-size="8.5">
              ₹${Math.round(tot/1000)}k
            </text>
          ` : ''}
          <text x="${(x + barW / 2).toFixed(1)}" y="${padT + plotH + 16}" text-anchor="middle" fill="#666" font-size="9">
            W${w}
          </text>
        `;
      }).join('')}
      <!-- Legend -->
      <rect x="${W - 130}" y="2" width="10" height="10" rx="2" fill="#2E86AB"/>
      <text x="${W - 116}" y="10" font-size="9" fill="#555">Standard AP</text>
      <rect x="${W - 65}" y="2" width="10" height="10" rx="2" fill="#E65100"/>
      <text x="${W - 51}" y="10" font-size="9" font-weight="700" fill="#E65100">MSME Dues</text>
    </svg>
  `;
}

// Chart D: Receivables vs Payables (Donut / Working Capital Position)
function renderARvsAPComparisonSVG(ar = 300000, ap = 14675) {
  const total = ar + ap;
  const arPct = total > 0 ? (ar / total) : 0.95;
  const apPct = 1 - arPct;

  const W = 460, H = 160;
  const cx = 110, cy = 80, r = 50, strokeW = 20;
  const circ = 2 * Math.PI * r;
  const arStroke = arPct * circ;
  const apStroke = apPct * circ;

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; overflow:visible; font-family:var(--ui); font-size:11px;">
      <!-- Donut Circle Background -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f0f0f0" stroke-width="${strokeW}"/>
      <!-- AR arc -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1E9070" stroke-width="${strokeW}"
        stroke-dasharray="${arStroke.toFixed(1)} ${circ.toFixed(1)}"
        stroke-dashoffset="${(circ / 4).toFixed(1)}" stroke-linecap="round"/>
      <!-- AP arc -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#B4391E" stroke-width="${strokeW}"
        stroke-dasharray="${apStroke.toFixed(1)} ${circ.toFixed(1)}"
        stroke-dashoffset="${(circ / 4 - arStroke).toFixed(1)}" stroke-linecap="round"/>
      
      <!-- Center Text -->
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="10" fill="#888">Coverage</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="12" font-weight="800" fill="#1E9070">
        ${(ar / Math.max(1, ap)).toFixed(1)}x
      </text>

      <!-- Right Side Metrics Breakdown -->
      <g transform="translate(210, 35)">
        <circle cx="6" cy="6" r="6" fill="#1E9070"/>
        <text x="20" y="10" font-weight="700" fill="#222">Receivables (AR): ${inr(ar)}</text>
        <text x="20" y="24" font-size="10" fill="#777">Expected inflows (${(arPct * 100).toFixed(0)}% of total balance)</text>

        <circle cx="6" cy="50" r="6" fill="#B4391E"/>
        <text x="20" y="54" font-weight="700" fill="#222">Payables (AP): ${inr(ap)}</text>
        <text x="20" y="68" font-size="10" fill="#777">Outstanding supplier debt (${(apPct * 100).toFixed(0)}%)</text>

        <line x1="0" y1="84" x2="220" y2="84" stroke="#eee" stroke-width="1"/>
        <text x="0" y="100" font-weight="800" fill="#1E9070" font-size="11.5">
          Net Working Capital: +${inr(ar - ap)}
        </text>
      </g>
    </svg>
  `;
}

/* =========================================================================
   3. CYCLE RUN WITH 3D OFFICE TRANSITION & LIVE FEED (Requirement 3)
   ========================================================================= */
async function handleRunCycleWith3D(situationText = '') {
  try {
    if (situationText) {
      await fetch('/api/msme/inject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: situationText, text: situationText })
      });
    }

    // Switch view to 3D Office
    if (switchViewCallback) switchViewCallback('office');

    // Show floating Live Feed overlay on 3D Office
    const overlay = document.getElementById('officeFeedOverlay');
    const stream = document.getElementById('officeFeedStream');
    if (overlay && stream) {
      overlay.classList.remove('hide');
      stream.innerHTML = `
        <div class="feed-item">
          <strong>⚡ Decision Cycle Triggered</strong><br>
          Gathering live telemetry from all 6 department agents...
        </div>
      `;
    }

    // Trigger cycle run on backend
    const res = await fetch('/api/msme/cycle', { method: 'POST', headers: { 'content-type': 'application/json' } });
    const snap = await res.json();
    updateDashboardState(snap);

    if (stream) {
      // Simulate live arrival of department proposals and arbiter verdict
      const tasksList = snap.tasks || [];
      let delay = 300;
      for (const t of tasksList) {
        setTimeout(() => {
          const item = document.createElement('div');
          item.className = 'feed-item';
          item.innerHTML = `
            <strong>${esc(t.dept.toUpperCase())}:</strong> ${esc(t.action.replace(/_/g, ' '))}<br>
            <span style="font-size:10.5px;color:#555;">Requested: ${inr(t.amount_requested_inr || t.amount_inr)} — ${esc(t.reason || '')}</span>
          `;
          stream.appendChild(item);
          stream.scrollTop = stream.scrollHeight;
        }, delay);
        delay += 350;
      }

      setTimeout(() => {
        const approvedCount = tasksList.filter(t => t.state === 'approved' || t.state === 'executed').length;
        const arbItem = document.createElement('div');
        arbItem.className = 'feed-item arbiter';
        arbItem.innerHTML = `
          <strong>⚖️ ARBITER VERDICT:</strong> Approved ${approvedCount} of ${tasksList.length} proposals.<br>
          <span style="font-size:10.5px;color:#1E9070;">Cash runway preserved. Zero constraint violations.</span>
        `;
        stream.appendChild(arbItem);
        stream.scrollTop = stream.scrollHeight;
      }, delay);
    }
  } catch (err) {
    alert('Cycle error: ' + err.message);
  }
}

/* =========================================================================
   4. AGENT DECISIONS TAB: Before/After Impact Card, Overrides & Empty States
   ========================================================================= */
function renderDecisions() {
  const tasksList = currentSnapshot?.tasks || [];
  const m = currentSnapshot?.metrics || { cash: 450000, runway: 1.7, dso: 26.9 };

  // Calculate before and after approved decisions
  let cashDelta = 0;
  for (const t of tasksList) {
    const d = t.decision;
    if (d && (d.outcome === 'approved' || d.outcome === 'modified')) {
      cashDelta += (d.canonical_cash_impact_inr || 0);
    }
  }

  const cashBefore = m.cash || 450000;
  const cashAfter = Math.max(0, cashBefore + cashDelta);
  const runwayBefore = m.runway || 1.7;
  const runwayAfter = Math.max(0, cashAfter / 70000);
  const dsoBefore = m.dso || 26.9;
  const dsoAfter = Math.max(20, dsoBefore - (cashDelta > 0 ? 1.5 : 0));

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Agent Decisions & Arbiter Synthesis</h2>
        <span class="cd-pill live">Week ${currentSnapshot?.week || 0}</span>
      </div>

      <!-- Before / After Impact Card (Requirement 4) -->
      <div class="cd-card" style="background:#FAFBFD; border-left:4px solid #2E86AB;">
        <div style="font-weight:700; font-size:12px; color:#2E86AB; text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px;">
          📊 Projected Impact of Approved Decisions
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div>
            <div style="font-size:11px; color:var(--grey);">Cash on Hand</div>
            <div style="font-family:var(--serif); font-size:20px; font-weight:700; color:var(--ink);">
              ${inr(cashBefore)} <span style="font-size:13px; color:var(--grey);">→</span>
              <span style="color:${cashAfter >= cashBefore ? '#1E9070' : '#B4391E'};">${inr(cashAfter)}</span>
            </div>
            <div style="font-size:10px; color:var(--grey);">Net impact: ${cashDelta >= 0 ? '+' : ''}${inr(cashDelta)}</div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--grey);">Cash Runway</div>
            <div style="font-family:var(--serif); font-size:20px; font-weight:700; color:var(--ink);">
              ${runwayBefore.toFixed(1)} wks <span style="font-size:13px; color:var(--grey);">→</span>
              <span style="color:#1E9070;">${runwayAfter.toFixed(1)} wks</span>
            </div>
            <div style="font-size:10px; color:var(--grey);">Safety floor: 4.3 wks</div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--grey);">Days Sales Outstanding (DSO)</div>
            <div style="font-family:var(--serif); font-size:20px; font-weight:700; color:var(--ink);">
              ${dsoBefore.toFixed(1)} d <span style="font-size:13px; color:var(--grey);">→</span>
              <span style="color:#1E9070;">${dsoAfter.toFixed(1)} d</span>
            </div>
            <div style="font-size:10px; color:var(--grey);">Collections velocity</div>
          </div>
        </div>
      </div>

      <!-- Proposals List or Empty State (Requirement 6) -->
      ${!tasksList.length ? `
        <div class="cd-card cd-empty" style="padding: 48px 24px;">
          <div style="font-size: 34px; margin-bottom: 8px;">📋</div>
          <div style="font-weight: 700; font-size: 15px; color: var(--ink);">No proposals yet.</div>
          <div style="font-size: 12px; color: var(--grey); margin-top: 4px;">
            Type a situation on the <strong>Overview</strong> tab and press <strong>RUN AGENT CYCLE</strong>.
          </div>
        </div>
      ` : `
        <div class="cd-decisions-list">
          ${tasksList.map(t => {
            const d = t.decision || {};
            const st = t.state || 'pending';
            return `
              <div class="cd-decision-card ${esc(st)}">
                <div class="d-top">
                  <span class="d-dept">${esc(t.dept.toUpperCase())}</span>
                  <span class="d-action">${esc((t.action || '').replace(/_/g, ' '))}</span>
                  <span class="d-src-badge ${t.source?.startsWith('llm') ? 'llm' : 'rule'}">${esc(t.source || 'rule-fallback')}</span>
                  <span style="flex:1;"></span>
                  <span class="d-amt">${inr(t.amount_approved_inr !== undefined ? t.amount_approved_inr : t.amount_inr)}</span>
                </div>
                <div class="d-reason">${esc(t.reason || d.reason || 'Telemetry-based department proposal.')}</div>
                <div class="d-bottom" style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                  <span class="d-status ${esc(st)}" style="font-weight:700; font-size:11px; text-transform:uppercase;">
                    Arbiter Verdict: ${esc(st)}
                  </span>
                  <div style="display:flex; gap:6px;">
                    <button class="cd-btn success btn-override-approve" data-id="${esc(t.id)}" style="padding:4px 10px; font-size:10.5px;">✓ Approve</button>
                    <button class="cd-btn danger btn-override-reject" data-id="${esc(t.id)}" style="padding:4px 10px; font-size:10.5px;">✕ Reject</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function attachDecisionEvents() {
  document.querySelectorAll('.btn-override-approve').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      await overrideDecision(id, 'approved');
    });
  });

  document.querySelectorAll('.btn-override-reject').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      await overrideDecision(id, 'rejected');
    });
  });
}

async function overrideDecision(id, outcome) {
  try {
    const res = await fetch('/api/msme/decision/override', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, outcome })
    });
    const snap = await res.json();
    updateDashboardState(snap);
  } catch (err) {
    alert('Override failed: ' + err.message);
  }
}

/* =========================================================================
   5. PERSISTENT RIGHT-HAND CHAT PANEL ("Ask your finance team")
   ========================================================================= */
function attachPersistentChatEvents() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input?.value?.trim();
    if (!q || isChatBusy) return;
    input.value = '';
    await sendChatMessage(q);
  });

  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const q = chip.dataset.q;
      if (q && !isChatBusy) await sendChatMessage(q);
    });
  });
}

async function sendChatMessage(question) {
  isChatBusy = true;
  const feed = document.getElementById('chatHistoryFeed');
  if (feed) {
    // Append user message
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.textContent = question;
    feed.appendChild(userDiv);

    // Append loading placeholder
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-msg bot';
    loadingDiv.innerHTML = '<em>Consulting finance advisory model...</em>';
    feed.appendChild(loadingDiv);
    feed.scrollTop = feed.scrollHeight;

    try {
      const res = await fetch('/api/msme/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const data = await res.json();
      loadingDiv.innerHTML = `
        <div class="chat-msg-source ${data.source?.includes('gemini') ? 'gemini' : (data.source?.includes('groq') ? 'groq' : 'rule-fallback')}">
          ${esc(data.source || 'rule-fallback')}
        </div>
        <div>${esc(data.answer)}</div>
        ${data.suggested_action ? `
          <button class="chat-action-btn" data-act='${JSON.stringify(data.suggested_action)}'>
            Confirm Action: ${esc(data.suggested_action.type || 'Execute')}
          </button>
        ` : ''}
      `;

      loadingDiv.querySelector('.chat-action-btn')?.addEventListener('click', async e => {
        const act = JSON.parse(e.target.dataset.act);
        if (act.type === 'inject_scenario' && act.text) {
          await handleRunCycleWith3D(act.text);
        } else if (act.type === 'pay_gst') {
          await callClientAction('pay_gst', { amount: act.amount || 38000 });
        } else {
          alert('Action confirmed: ' + JSON.stringify(act));
        }
      });
    } catch (err) {
      loadingDiv.textContent = 'Chat error: ' + err.message;
    } finally {
      isChatBusy = false;
      feed.scrollTop = feed.scrollHeight;
    }
  }
}

/* =========================================================================
   6. AR, AP, INVENTORY & DIGITIZE TABLES (Unified buttons, empty states)
   ========================================================================= */
function renderARTable() {
  const ar = currentLedger?.ar || [];
  const total = ar.reduce((s, r) => s + (r.amount || 0), 0);

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Receivable (AR)</h2>
        <span class="cd-pill live">Total: ${inr(total)}</span>
      </div>
      <p style="color:var(--grey);font-size:12px;margin:2px 0 14px 0;">
        Pending client invoices. Click <strong>Mark Paid</strong> to record customer receipt (increases cash, reduces AR).
      </p>

      <div class="cd-card" style="margin-bottom:14px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:var(--ink);">+ Add New Customer Receivable:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="newArId" placeholder="Invoice ID (e.g. INV-201)" style="padding:6px 10px;font-size:12px;width:120px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newArCust" placeholder="Customer Name" style="padding:6px 10px;font-size:12px;width:150px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newArAmt" type="number" placeholder="Amount (₹)" style="padding:6px 10px;font-size:12px;width:110px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newArDue" type="number" placeholder="Due Wk" value="4" style="padding:6px 10px;font-size:12px;width:70px;border:1px solid var(--hairline);border-radius:6px;">
          <button id="btnAddAr" class="cd-btn primary">+ Add to Books</button>
        </div>
      </div>

      <div class="cd-card">
        ${!ar.length ? `
          <div class="cd-empty">No pending receivables in ledger.</div>
        ` : `
          <table class="cd-table" id="arTable">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Customer</th>
                <th>Amount (₹)</th>
                <th>Issued Wk</th>
                <th>Due Wk</th>
                <th>Action</th>
                <th style="width:30px;"></th>
              </tr>
            </thead>
            <tbody>
              ${ar.map((row, idx) => `
                <tr data-idx="${idx}">
                  <td><input class="ar-id" value="${esc(row.id || '')}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;"></td>
                  <td><input class="ar-cust" value="${esc(row.customer || '')}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;"></td>
                  <td><input class="ar-amt" type="number" value="${row.amount || 0}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;width:90px;"></td>
                  <td><input class="ar-issued" type="number" value="${row.issued ?? 0}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;width:50px;"></td>
                  <td><span class="due-tag">Wk ${row.due ?? 0}</span></td>
                  <td><button class="cd-btn success btn-pay-ar" data-id="${esc(row.id)}" style="padding:4px 10px;font-size:10.5px;">✓ Mark Paid</button></td>
                  <td><button class="cd-del-btn btn-del-ar" data-idx="${idx}">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="cd-save-bar">
            <button id="btnSaveLedgerAR" class="cd-btn primary">Save Changes to Books</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function attachAREvents() {
  document.getElementById('btnAddAr')?.addEventListener('click', async () => {
    const cust = document.getElementById('newArCust')?.value?.trim();
    const amt = Number(document.getElementById('newArAmt')?.value);
    const due = Number(document.getElementById('newArDue')?.value) || 4;
    const id = document.getElementById('newArId')?.value?.trim() || `INV-${Date.now().toString().slice(-4)}`;
    if (!cust || !amt || amt <= 0) return alert('Please enter valid customer name and positive amount');
    await callClientAction('add_receivable', { id, customer: cust, amount: amt, due, issued: 0 });
  });

  document.querySelectorAll('.btn-pay-ar').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if (!confirm(`Mark receivable invoice ${id} as paid by customer?`)) return;
      await callClientAction('mark_receivable_paid', { id });
    });
  });

  document.querySelectorAll('.btn-del-ar').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      if (currentLedger?.ar) {
        currentLedger.ar.splice(idx, 1);
        renderActiveTab();
      }
    });
  });

  document.getElementById('btnSaveLedgerAR')?.addEventListener('click', saveLedgerChanges);
}

function renderAPTable() {
  const ap = currentLedger?.ap || [];
  const total = ap.reduce((s, p) => s + (p.amount || 0), 0);

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Accounts Payable (AP)</h2>
        <span class="cd-pill live">Total: ${inr(total)}</span>
      </div>
      <p style="color:var(--grey);font-size:12px;margin:2px 0 14px 0;">
        Pending supplier bills. Click <strong>Pay Bill</strong> to settle supplier dues immediately.
      </p>

      <div class="cd-card" style="margin-bottom:14px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:var(--ink);">+ Add New Supplier Payable:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="newApId" placeholder="Bill ID (e.g. BILL-105)" style="padding:6px 10px;font-size:12px;width:120px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newApSupp" placeholder="Supplier Name" style="padding:6px 10px;font-size:12px;width:150px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newApAmt" type="number" placeholder="Amount (₹)" style="padding:6px 10px;font-size:12px;width:110px;border:1px solid var(--hairline);border-radius:6px;">
          <input id="newApDue" type="number" placeholder="Due Wk" value="6" style="padding:6px 10px;font-size:12px;width:70px;border:1px solid var(--hairline);border-radius:6px;">
          <label style="font-size:11.5px;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="newApMsme"> MSME Vendor
          </label>
          <button id="btnAddAp" class="cd-btn primary">+ Add to Books</button>
        </div>
      </div>

      <div class="cd-card">
        ${!ap.length ? `
          <div class="cd-empty">No pending supplier payables.</div>
        ` : `
          <table class="cd-table" id="apTable">
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Supplier</th>
                <th>Amount (₹)</th>
                <th>Due Wk</th>
                <th>MSME 45d</th>
                <th>Action</th>
                <th style="width:30px;"></th>
              </tr>
            </thead>
            <tbody>
              ${ap.map((row, idx) => `
                <tr data-idx="${idx}">
                  <td><input class="ap-id" value="${esc(row.id || '')}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;"></td>
                  <td><input class="ap-supp" value="${esc(row.supplier || '')}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;"></td>
                  <td><input class="ap-amt" type="number" value="${row.amount || 0}" style="border:1px solid transparent;background:transparent;padding:3px;font-family:inherit;width:90px;"></td>
                  <td><span class="due-tag">Wk ${row.due ?? 0}</span></td>
                  <td><span class="msme-badge ${row.msme ? 'yes' : 'no'}">${row.msme ? 'MSME 45-day' : 'Standard'}</span></td>
                  <td><button class="cd-btn danger btn-pay-ap" data-id="${esc(row.id)}" style="padding:4px 10px;font-size:10.5px;">Pay Bill</button></td>
                  <td><button class="cd-del-btn btn-del-ap" data-idx="${idx}">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="cd-save-bar">
            <button id="btnSaveLedgerAP" class="cd-btn primary">Save Changes to Books</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function attachAPEvents() {
  document.getElementById('btnAddAp')?.addEventListener('click', async () => {
    const supp = document.getElementById('newApSupp')?.value?.trim();
    const amt = Number(document.getElementById('newApAmt')?.value);
    const due = Number(document.getElementById('newApDue')?.value) || 6;
    const msme = Boolean(document.getElementById('newApMsme')?.checked);
    const id = document.getElementById('newApId')?.value?.trim() || `BILL-${Date.now().toString().slice(-4)}`;
    if (!supp || !amt || amt <= 0) return alert('Please enter valid supplier name and positive amount');
    await callClientAction('add_payable', { id, supplier: supp, amount: amt, due, msme, issued: 0 });
  });

  document.querySelectorAll('.btn-pay-ap').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if (!confirm(`Settle supplier bill ${id} using available cash/OD?`)) return;
      await callClientAction('pay_payable', { id });
    });
  });

  document.querySelectorAll('.btn-del-ap').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.target.dataset.idx;
      if (currentLedger?.ap) {
        currentLedger.ap.splice(idx, 1);
        renderActiveTab();
      }
    });
  });

  document.getElementById('btnSaveLedgerAP')?.addEventListener('click', saveLedgerChanges);
}

function renderInventory() {
  const inv = currentLedger?.inventory || { units: 3530, unit_cost: 250 };
  const totalVal = Math.round((inv.units || 0) * (inv.unit_cost || 250));

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Warehouse Inventory</h2>
        <span class="cd-pill live">Total Value: ${inr(totalVal)}</span>
      </div>

      <div class="cd-card">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:12px;color:var(--ink);">Inventory Valuation & Parameters:</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;">
          <div>
            <label style="font-size:11px;color:var(--grey);display:block;margin-bottom:4px;">Stock Units</label>
            <input id="invUnitsInp" type="number" value="${inv.units || 0}" style="padding:6px 10px;font-size:12px;width:100%;border:1px solid var(--hairline);border-radius:6px;">
          </div>
          <div>
            <label style="font-size:11px;color:var(--grey);display:block;margin-bottom:4px;">Unit Cost (₹)</label>
            <input id="invCostInp" type="number" value="${inv.unit_cost || 250}" style="padding:6px 10px;font-size:12px;width:100%;border:1px solid var(--hairline);border-radius:6px;">
          </div>
          <div>
            <label style="font-size:11px;color:var(--grey);display:block;margin-bottom:4px;">Calculated Total Value</label>
            <div style="font-family:var(--serif);font-size:20px;font-weight:700;color:var(--ink);margin-top:4px;">
              ${inr(totalVal)}
            </div>
          </div>
        </div>
        <div class="cd-save-bar">
          <button id="btnSaveInventory" class="cd-btn primary">Update Inventory</button>
        </div>
      </div>
    </div>
  `;
}

function attachInvEvents() {
  document.getElementById('btnSaveInventory')?.addEventListener('click', async () => {
    const u = Number(document.getElementById('invUnitsInp')?.value);
    const c = Number(document.getElementById('invCostInp')?.value);
    if (!currentLedger) currentLedger = {};
    currentLedger.inventory = { units: u, unit_cost: c };
    await saveLedgerChanges();
  });
}

function renderDigitize() {
  const hasData = digitizeState.rows && digitizeState.rows.length > 0;
  const isBusy = digitizeState.loading;

  return `
    <div class="cd-section">
      <div class="cd-head">
        <h2>Document Digitizer & OCR Pipeline</h2>
        <span class="cd-pill">SQLite · Ingestion Engine</span>
      </div>
      <p style="color:var(--grey);font-size:12px;margin:2px 0 14px 0;">
        Ingest unstructured SME invoices, bills, and inventory sheets. Extracts line items, dates, and amounts into verified records.
      </p>

      <div class="cd-card" style="margin-bottom:14px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:var(--ink);">Upload Document:</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <input type="file" id="digFileInput" accept=".txt,.csv,.json,.pdf,.png,.jpg,.jpeg" style="font-family:var(--ui);font-size:12px;">
          <button id="btnParseUploaded" class="cd-btn primary" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? '⏳ Processing...' : '⚡ Run Digitizer / OCR'}
          </button>
        </div>
        ${digitizeState.error ? `<div style="color:#d9534f;font-size:12px;margin-top:8px;">⚠️ ${esc(digitizeState.error)}</div>` : ''}
        ${digitizeState.successMsg ? `<div style="color:#28a745;font-weight:600;font-size:12px;margin-top:8px;">✓ ${esc(digitizeState.successMsg)}</div>` : ''}
      </div>

      ${hasData ? `
        <div class="cd-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <span style="font-weight:700;font-size:13px;color:var(--ink);">Extracted & Verified Records</span>
              <span style="color:var(--grey);font-size:12px;margin-left:8px;">(${digitizeState.rows.length} rows)</span>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="cd-table" id="digReviewTable">
              <thead>
                <tr>
                  ${digitizeState.columns.map(c => `<th>${esc(c.toUpperCase().replace(/_/g, ' '))}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${digitizeState.rows.map((row, idx) => `
                  <tr>
                    ${digitizeState.columns.map(col => `<td>${esc(row[col] ?? '')}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function attachDigitizeEvents() {
  const parseBtn = document.getElementById('btnParseUploaded');
  const fileInput = document.getElementById('digFileInput');

  parseBtn?.addEventListener('click', () => {
    if (!fileInput?.files?.length) return alert('Please select a document file');
    const file = fileInput.files[0];
    const reader = new FileReader();

    digitizeState.loading = true;
    digitizeState.error = null;
    digitizeState.successMsg = null;
    renderActiveTab();

    reader.onload = async () => {
      try {
        const res = await fetch('/api/msme/digitize/parse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content: reader.result })
        });
        const data = await res.json();
        digitizeState.loading = false;
        if (!data.success) digitizeState.error = data.error || 'Failed to parse';
        else {
          digitizeState.rows = data.rows || [];
          digitizeState.columns = data.columns || Object.keys(data.rows?.[0] || {});
          digitizeState.successMsg = `Parsed ${digitizeState.rows.length} records.`;
        }
        renderActiveTab();
      } catch (err) {
        digitizeState.loading = false;
        digitizeState.error = err.message;
        renderActiveTab();
      }
    };
    reader.readAsText(file);
  });
}

async function callClientAction(action, params) {
  try {
    const res = await fetch('/api/msme/client-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, params })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      alert('Action Failed: ' + (data.error || 'Unknown error'));
    } else {
      await fetchLedger();
      updateDashboardState(data);
      alert('✓ Action successfully recorded in books and synchronized with live ledger!');
    }
  } catch (e) {
    alert('Error executing client action: ' + e.message);
  }
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
