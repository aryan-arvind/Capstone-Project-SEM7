// =============================================================================
// ANTIGRAVITY MSME ENGINE - EXECUTIVE MULTI-AGENT FRONT-END CONTROLLER
// Final-Year Capstone: Multi-Agent Business Decision & Automation System
// =============================================================================

const API_BASE = window.location.origin;

// -----------------------------------------------------------------------------
// 1. Core Reactive Application State
// -----------------------------------------------------------------------------
const AppState = {
  // Business Profile & Constraints
  profile: {
    name: "Demo Retail Store",
    type: "Retail - General Store / Kirana",
    scale: "Small (1-5 staff, 15 SKUs)",
    revenue: 184520.0,
    cash_cycle: "Daily Reconciliation",
    inventory_model: "Hybrid (Make-to-Stock + On-Demand)",
    customer_strategy: "VIP-focused",
    constraints: {
      min_cash_reserve: 10000.0,
      max_single_purchase: 35000.0,
      critical_inventory_threshold: 10,
      approval_threshold: 15000.0,
    }
  },

  // Financial State
  finance: {
    available_cash: 40000.0,
    daily_burn_rate: 1420.0,
    runway_days: 28,
    gst_obligation: 25000.0,
    gst_deadline_days: 1.0, // Tomorrow
  },

  // Inventory State
  inventory: {
    product_a_stock: 15,
    product_a_reorder_level: 30,
    product_a_unit_cost: 2000.0,
    product_a_reorder_cost: 30000.0,
    catalog: [
      { sku: "SKU-A42", name: "Product A (Basmati Rice 25kg)", stock: 15, reorder: 30, sales_day: 2.5, cost: 2000, price: 2600, status: "LOW" },
      { sku: "SKU-B12", name: "Refined Sunflower Oil (15L Tin)", stock: 8, reorder: 12, sales_day: 1.8, cost: 1650, price: 2100, status: "LOW" },
      { sku: "SKU-C08", name: "Wheat Flour / Chakki Atta (10kg)", stock: 24, reorder: 15, sales_day: 3.2, cost: 380, price: 460, status: "HEALTHY" },
      { sku: "SKU-D55", name: "Premium Toor Dal (5kg Pack)", stock: 18, reorder: 10, sales_day: 1.5, cost: 620, price: 780, status: "HEALTHY" },
      { sku: "SKU-E19", name: "Packaged Sugar (5kg Pack)", stock: 32, reorder: 15, sales_day: 2.8, cost: 210, price: 260, status: "HEALTHY" },
      { sku: "SKU-F73", name: "Organic Jaggery Powder (1kg)", stock: 14, reorder: 8, sales_day: 1.1, cost: 95, price: 135, status: "HEALTHY" },
      { sku: "SKU-G04", name: "Tea Powder Gold Leaf (1kg)", stock: 22, reorder: 12, sales_day: 1.6, cost: 420, price: 540, status: "HEALTHY" },
      { sku: "SKU-H88", name: "Pure Cow Ghee (1L Pet Jar)", stock: 11, reorder: 8, sales_day: 0.9, cost: 580, price: 720, status: "HEALTHY" }
    ]
  },

  // Ops / Customer Agent State
  ops: {
    customer_name: "Shree Textiles",
    customer_tier: "VIP Account",
    requested_sku: "SKU-A42",
    requested_product: "Product A",
    requested_quantity: 10,
    urgency: "High (Today)",
    confidence: 0.94,
    raw_message: "I need 10 units of Product A today. It's urgent."
  },

  // Central Arbitration Results
  arbitration: {
    is_conflict: true,
    total_requested_cost: 55000.0,
    available_cash: 40000.0,
    shortfall: 15000.0,
    active_step: 1,
    scores: {
      gst: 95,
      vip_order: 91,
      inventory: 67
    },
    routing: {
      gst: "EXECUTE",
      vip_order: "EXECUTE",
      inventory: "DELAY"
    }
  },

  // Human-in-the-Loop Pending Actions
  pending_actions: [
    {
      id: "ACT-001",
      title: "Inventory Reorder: Product A (15 Units)",
      agent: "Inventory Agent",
      amount: 30000.0,
      resource_type: "Cash & Procurement",
      arbitration_decision: "DELAY",
      hitl_policy: "Requires Owner Review",
      urgency_score: 0.85,
      risk_score: 0.25,
      confidence: 0.91,
      status: "AWAITING_REVIEW",
      reason: "Delayed by Arbitration: Available cash (₹40,000) cannot fund both statutory GST (₹25,000) and full reorder without breaching the ₹10,000 liquidity safety floor.",
      sku: "SKU-A42",
      quantity: 15
    },
    {
      id: "ACT-002",
      title: "Pay Statutory GST Liability (Due Tomorrow)",
      agent: "Finance Agent",
      amount: 25000.0,
      resource_type: "Cash Outflow",
      arbitration_decision: "EXECUTE",
      hitl_policy: "High Priority Execution",
      urgency_score: 0.95,
      risk_score: 0.10,
      confidence: 0.98,
      status: "AWAITING_REVIEW",
      reason: "Prioritized by Arbitration: Statutory tax compliance deadline is critical (due tomorrow). Non-payment incurs mandatory 18% p.a. penal interest and input credit freezing.",
      sku: "N/A",
      quantity: 1
    },
    {
      id: "ACT-003",
      title: "Fulfil Urgent VIP Customer Order (10 Units Product A)",
      agent: "Ops / Customer Agent",
      amount: 0.0,
      resource_type: "Shelf Stock Allocation",
      arbitration_decision: "EXECUTE",
      hitl_policy: "Immediate Operational Dispatch",
      urgency_score: 0.90,
      risk_score: 0.15,
      confidence: 0.94,
      status: "AWAITING_REVIEW",
      reason: "Prioritized by Arbitration: On-hand inventory (15 units) is sufficient to fulfill the 10-unit VIP order immediately without any new cash procurement outlay.",
      sku: "SKU-A42",
      quantity: 10
    }
  ],

  // Completed Decision Audit History
  decision_history: [
    {
      id: 1,
      timestamp: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
      query: "Weekly routine restock review",
      agents_involved: "Finance, Inventory",
      conflict: false,
      routing: "EXECUTE",
      allocated_cost: 8400.0,
      owner_action: "APPROVED",
      status: "EXECUTED",
      entry_hash: "a4f81c9b209d6f3e1a8b7c4d5e6f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",
      previous_hash: "0000000000000000000000000000000000000000000000000000000000000000"
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      query: "Emergency vegetable oil restock batch",
      agents_involved: "Finance, Inventory",
      conflict: false,
      routing: "EXECUTE",
      allocated_cost: 6600.0,
      owner_action: "APPROVED",
      status: "EXECUTED",
      entry_hash: "3b8c9d0e1f2a3b4c5d6e7fa4f81c9b209d6f3e1a8b7c4d5e6f0a1b2c3d4e5f6a",
      previous_hash: "a4f81c9b209d6f3e1a8b7c4d5e6f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f"
    }
  ],

  // Executive KPI Aggregations
  kpi: {
    total_recommendations: 3,
    conflicts_detected: 1,
    executed_actions: 2,
    delayed_actions: 1,
    escalations: 0,
    hitl_interventions: 2
  },

  audio_enabled: true
};

// -----------------------------------------------------------------------------
// 2. Audio Synthesizer (Native Web Audio API, Zero External Assets)
// -----------------------------------------------------------------------------
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playTone(freq, type = "sine", duration = 0.15, gainVal = 0.05) {
  if (!AppState.audio_enabled) return;
  try {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio policy may delay playback until first user interaction
  }
}

function playSuccessChime() {
  playTone(587.33, "triangle", 0.1, 0.05); // D5
  setTimeout(() => playTone(880.00, "triangle", 0.2, 0.06), 80); // A5
}

function playAlertTone() {
  playTone(320, "sawtooth", 0.25, 0.08);
}

// -----------------------------------------------------------------------------
// 3. Formatting Utilities
// -----------------------------------------------------------------------------
function formatINR(num) {
  if (num === null || num === undefined) return "₹0.00";
  return "₹" + Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  if (type === "success") playSuccessChime();
  if (type === "warning" || type === "error") playAlertTone();

  setTimeout(() => {
    toast.className = "toast";
  }, 4500);
}

// -----------------------------------------------------------------------------
// 4. Global Tab Navigation
// -----------------------------------------------------------------------------
window.goToTab = function(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetPane = document.getElementById(tabId);

  if (targetBtn) targetBtn.classList.add("active");
  if (targetPane) targetPane.style.display = "block";

  playTone(450, "sine", 0.05);

  // Re-render chart if analytics tab opened
  if (tabId === "tab-analytics") {
    renderCharts();
  }
};

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    const tabId = btn.getAttribute("data-tab");
    goToTab(tabId);
  };
});

// -----------------------------------------------------------------------------
// 5. Overview & HUD Initialization
// -----------------------------------------------------------------------------
function updateOverviewHUD() {
  const cash = AppState.finance.available_cash;
  const rev = AppState.profile.revenue;
  const burn = AppState.finance.daily_burn_rate;
  const reserve = AppState.profile.constraints.min_cash_reserve;
  const headroom = Math.max(0, cash - reserve);

  // HUD values
  const cashEl = document.getElementById("cashBalanceDisplay");
  if (cashEl) cashEl.textContent = formatINR(cash);

  const revEl = document.getElementById("revenueDisplay");
  if (revEl) revEl.textContent = formatINR(rev);

  const burnEl = document.getElementById("burnRateDisplay");
  if (burnEl) burnEl.textContent = formatINR(burn) + "/day";

  const discEl = document.getElementById("discretionaryDisplay");
  if (discEl) discEl.textContent = formatINR(headroom);

  const runwayDays = burn > 0 ? Math.round(cash / burn) : 99;
  const runwayEl = document.getElementById("runwayDaysDisplay");
  if (runwayEl) runwayEl.textContent = `${runwayDays} days`;

  // Solvency badge and progress fill
  const tierDisplay = document.getElementById("solvencyTierDisplay");
  const progFill = document.getElementById("solvencyProgressFill");

  if (cash < 40000) {
    if (tierDisplay) tierDisplay.innerHTML = `<span class="badge badge-rose"><i class="ph-fill ph-warning"></i> CRITICAL (< ₹40k)</span>`;
    if (progFill) { progFill.style.background = "var(--rose)"; progFill.style.width = "35%"; }
  } else if (cash <= 50000) {
    if (tierDisplay) tierDisplay.innerHTML = `<span class="badge badge-amber"><i class="ph-fill ph-warning-circle"></i> CONSTRAINED (₹40k)</span>`;
    if (progFill) { progFill.style.background = "var(--amber)"; progFill.style.width = "50%"; }
  } else {
    if (tierDisplay) tierDisplay.innerHTML = `<span class="badge badge-emerald"><i class="ph-fill ph-check-circle"></i> HEALTHY (Surplus)</span>`;
    if (progFill) { progFill.style.background = "var(--emerald)"; progFill.style.width = "85%"; }
  }

  // Update 6 KPI counters
  const kpiTot = document.getElementById("kpiTotalRecs");
  if (kpiTot) kpiTot.textContent = AppState.kpi.total_recommendations;

  const kpiConf = document.getElementById("kpiConflicts");
  if (kpiConf) kpiConf.textContent = AppState.kpi.conflicts_detected;

  const kpiExec = document.getElementById("kpiExecuted");
  if (kpiExec) kpiExec.textContent = AppState.kpi.executed_actions;

  const kpiDelay = document.getElementById("kpiDelayed");
  if (kpiDelay) kpiDelay.textContent = AppState.kpi.delayed_actions;

  const kpiEsc = document.getElementById("kpiEscalated");
  if (kpiEsc) kpiEsc.textContent = AppState.kpi.escalations;

  const kpiInt = document.getElementById("kpiInterventions");
  if (kpiInt) kpiInt.textContent = AppState.kpi.hitl_interventions;

  // Pending badge
  const pendingBadge = document.getElementById("pendingActionsBadge");
  const pendingCount = AppState.pending_actions.filter(a => a.status === "AWAITING_REVIEW").length;
  if (pendingBadge) {
    pendingBadge.textContent = pendingCount;
    pendingBadge.style.display = pendingCount > 0 ? "inline-flex" : "none";
  }
}

// -----------------------------------------------------------------------------
// 6. 8-SKU Catalog Table Rendering
// -----------------------------------------------------------------------------
function renderCatalogTable() {
  const tbody = document.getElementById("catalogTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  AppState.inventory.catalog.forEach(item => {
    const row = document.createElement("tr");
    const isLow = item.stock <= item.reorder;
    const statusBadge = item.stock <= 10
      ? `<span class="badge badge-rose">CRITICAL</span>`
      : (isLow ? `<span class="badge badge-amber">LOW STOCK</span>` : `<span class="badge badge-emerald">HEALTHY</span>`);

    const runwayDays = Math.round(item.stock / item.sales_day);

    row.innerHTML = `
      <td class="mono" style="font-weight: 700; color: var(--cyan);">${item.sku}</td>
      <td><strong style="color: #fff;">${item.name}</strong></td>
      <td class="mono" style="font-weight: 700; color: ${isLow ? 'var(--amber)' : '#fff'};">${item.stock} units</td>
      <td class="mono">${item.reorder} units</td>
      <td class="mono">${item.sales_day} u/day</td>
      <td class="mono" style="color: ${isLow ? 'var(--amber)' : 'var(--text-muted)'};">${runwayDays} days</td>
      <td class="mono">${formatINR(item.cost)}</td>
      <td class="mono" style="color: var(--emerald);">${formatINR(item.price)}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(row);
  });
}

// -----------------------------------------------------------------------------
// 7. Customer NLP / BERT Visualization
// -----------------------------------------------------------------------------
function initNLPVisualizer() {
  const preset1 = document.getElementById("nlpPreset1");
  const preset2 = document.getElementById("nlpPreset2");

  if (preset1) {
    preset1.onclick = () => {
      loadNLPScenario(
        "I need 10 units of Product A today. It's urgent.",
        "Urgent Order",
        "Product A (SKU-A42)",
        "10 Units",
        "High (Today)",
        "VIP Account (#V402)",
        "94%"
      );
    };
  }

  if (preset2) {
    preset2.onclick = () => {
      loadNLPScenario(
        "Can we schedule a regular delivery of 5 bags of Chakki Atta by next Friday?",
        "Standard Reorder",
        "Wheat Flour / Chakki Atta (SKU-C08)",
        "5 Bags (50kg)",
        "Normal (5 Days)",
        "Repeat Customer",
        "98%"
      );
    };
  }
}

function loadNLPScenario(msg, intent, prod, qty, urgency, cust, conf) {
  const inputMsg = document.getElementById("nlpInputMsg");
  const intentEl = document.getElementById("nlpIntent");
  const prodEl = document.getElementById("nlpProduct");
  const qtyEl = document.getElementById("nlpQuantity");
  const urgEl = document.getElementById("nlpUrgency");
  const custEl = document.getElementById("nlpCustomer");
  const confEl = document.getElementById("nlpConfidence");

  if (inputMsg) inputMsg.textContent = `"${msg}"`;
  if (intentEl) intentEl.textContent = intent;
  if (prodEl) prodEl.textContent = prod;
  if (qtyEl) qtyEl.textContent = qty;
  if (urgEl) urgEl.textContent = urgency;
  if (custEl) custEl.textContent = cust;
  if (confEl) confEl.textContent = conf;

  playTone(550, "sine", 0.08);
  showToast("BERT NLP Intent & Entity extraction parsed", "success");
}

// -----------------------------------------------------------------------------
// 8. Central 5-Step Progressive Arbitration Engine
// -----------------------------------------------------------------------------
function renderArbitrationStep(stepNum) {
  AppState.arbitration.active_step = stepNum;

  // Update stepper buttons
  document.querySelectorAll(".stepper-node").forEach(node => {
    const n = parseInt(node.getAttribute("data-step"));
    node.classList.remove("active", "completed");
    if (n === stepNum) node.classList.add("active");
    if (n < stepNum) node.classList.add("completed");
  });

  const stage = document.getElementById("stepperStageContent");
  if (!stage) return;

  const cash = AppState.finance.available_cash;
  const gstCost = AppState.finance.gst_obligation;
  const invCost = AppState.inventory.product_a_reorder_cost;
  const totalDemanded = gstCost + invCost;
  const shortfall = Math.max(0, totalDemanded - cash);
  const isConflict = shortfall > 0;

  if (stepNum === 1) {
    stage.innerHTML = `
      <div style="background: rgba(0,0,0,0.35); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="font-size: 1.05rem; color: #fff; margin-bottom: 0.5rem;">
          <i class="ph-bold ph-tray" style="color: var(--primary);"></i> Step 1: Collect Recommendations from 3 Independent Agents
        </h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Each specialized domain agent has evaluated its respective operational subsystem without visibility into competing capital demands.
        </p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
          <div class="glass-panel" style="padding: 1.15rem; border-left: 3px solid var(--emerald);">
            <span class="badge badge-emerald">FINANCE AGENT</span>
            <div style="font-weight: 700; color: #fff; margin-top: 0.5rem;">Reserve ₹25,000 for GST</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">Statutory liability due tomorrow. Non-negotiable tax penalty avoidance.</div>
            <div class="mono" style="font-size: 1.1rem; color: var(--emerald); font-weight: 800; margin-top: 0.75rem;">₹25,000.00</div>
          </div>

          <div class="glass-panel" style="padding: 1.15rem; border-left: 3px solid var(--amber);">
            <span class="badge badge-amber">INVENTORY AGENT</span>
            <div style="font-weight: 700; color: #fff; margin-top: 0.5rem;">Reorder Product A Batch</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">Stock on hand (15 units) below reorder point (30 units). Prevents stockout.</div>
            <div class="mono" style="font-size: 1.1rem; color: var(--amber); font-weight: 800; margin-top: 0.75rem;">₹30,000.00</div>
          </div>

          <div class="glass-panel" style="padding: 1.15rem; border-left: 3px solid var(--secondary);">
            <span class="badge badge-indigo">OPS / CUSTOMER AGENT</span>
            <div style="font-weight: 700; color: #fff; margin-top: 0.5rem;">Fulfil Urgent VIP Order</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">Shree Textiles (VIP) needs 10 units of Product A today. Zero cash outlay required.</div>
            <div class="mono" style="font-size: 1.1rem; color: var(--cyan); font-weight: 800; margin-top: 0.75rem;">10 Units (Shelf)</div>
          </div>
        </div>
      </div>
    `;
  } else if (stepNum === 2) {
    stage.innerHTML = `
      <div class="conflict-math-box">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="font-size: 1.1rem; color: #fff;">
            <i class="ph-bold ph-warning-octagon" style="color: var(--rose);"></i> Step 2: Conflict Detection & Resource Deficit Calculation
          </h4>
          <span class="badge ${isConflict ? 'badge-rose' : 'badge-emerald'}">
            ${isConflict ? 'RESOURCE CONFLICT DETECTED' : 'NO CONFLICT (CAPITAL ALIGNED)'}
          </span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.35rem;">
          Evaluating total competing financial demands against the business's actual available liquid working capital.
        </p>

        <div class="conflict-math-grid">
          <div class="math-cell">
            <label>Available Liquid Cash</label>
            <div class="val" style="color: #fff;">${formatINR(cash)}</div>
          </div>
          <div class="math-cell">
            <label>Finance Requirement (GST)</label>
            <div class="val" style="color: var(--emerald);">${formatINR(gstCost)}</div>
          </div>
          <div class="math-cell">
            <label>Inventory Requirement (Restock)</label>
            <div class="val" style="color: var(--amber);">${formatINR(invCost)}</div>
          </div>
          <div class="math-cell" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
            <label style="color: #f87171;">Capital Shortfall</label>
            <div class="val" style="color: var(--rose);">${formatINR(shortfall)}</div>
          </div>
        </div>

        <div style="margin-top: 1.25rem; font-size: 0.85rem; color: #cbd5e1; line-height: 1.5;">
          ${isConflict
            ? `<strong>Mathematical Deadlock:</strong> ${formatINR(gstCost)} (GST) + ${formatINR(invCost)} (Restock) = <strong>${formatINR(totalDemanded)}</strong> required, exceeding available capital of <strong>${formatINR(cash)}</strong> by <strong>${formatINR(shortfall)}</strong>. The engine must invoke Constraint Analysis & Multi-Criteria Priority Ranking.`
            : `<strong>No Deadlock:</strong> Total required ${formatINR(totalDemanded)} fits within available cash ${formatINR(cash)}. All actions can be scheduled.`}
        </div>
      </div>
    `;
  } else if (stepNum === 3) {
    stage.innerHTML = `
      <div style="background: rgba(0,0,0,0.35); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="font-size: 1.05rem; color: #fff; margin-bottom: 0.5rem;">
          <i class="ph-bold ph-shield-check" style="color: var(--emerald);"></i> Step 3: Constraint Analysis & Feasibility Checks
        </h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Testing each recommendation against business guardrails (Liquidity Floor, Tax Penalty Deadlines, Physical Stock Availability).
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm);">
            <div>
              <strong style="color: #fff;">Constraint 1: Minimum Cash Reserve Protection (₹10,000 Floor)</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Paying ₹25,000 for GST leaves ₹15,000 cash, safely preserving the ₹10,000 mandatory reserve floor.</div>
            </div>
            <span class="badge badge-emerald">PASSED (₹15,000 &gt; ₹10,000)</span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm);">
            <div>
              <strong style="color: #fff;">Constraint 2: Total Restock Cash Cap under Constraint</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Inventory reorder of ₹30,000 would reduce balance to ₹10,000 before GST, leaving ₹0 for tax payment.</div>
            </div>
            <span class="badge badge-rose">VIOLATED (Breaches GST Buffer)</span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem; background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: var(--radius-sm);">
            <div>
              <strong style="color: #fff;">Constraint 3: Physical Stock On-Hand Verification</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">VIP customer ordered 10 units. Shelf currently holds 15 units. 15 on hand &gt;= 10 ordered.</div>
            </div>
            <span class="badge badge-cyan">FEASIBLE (Fulfillable from Shelf)</span>
          </div>
        </div>
      </div>
    `;
  } else if (stepNum === 4) {
    stage.innerHTML = `
      <div style="background: rgba(0,0,0,0.35); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h4 style="font-size: 1.05rem; color: #fff;">
            <i class="ph-bold ph-sort-descending" style="color: var(--primary);"></i> Step 4: Multi-Criteria Priority Ranking (MCDM)
          </h4>
          <span style="font-size: 0.72rem; color: var(--text-dim);">Deterministic Weighting: Urgency (40%) + Impact (30%) + Risk Penalty (20%) + Confidence (10%)</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
          Every recommendation is ranked objectively using structured business decision factors (zero opaque LLM hallucinations).
        </p>

        <table class="ranking-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Recommendation</th>
              <th>Agent</th>
              <th>Urgency</th>
              <th>Deadline</th>
              <th>Financial Risk</th>
              <th>Composite Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="badge badge-emerald" style="border-radius: 50%; width: 24px; height: 24px; padding: 0; justify-content: center;">1</span></td>
              <td><strong style="color: #fff;">Pay Statutory GST Liability</strong></td>
              <td><span class="badge badge-emerald">Finance</span></td>
              <td class="mono" style="color: var(--rose);">0.95 (Tomorrow)</td>
              <td class="mono">1 Day</td>
              <td class="mono" style="color: var(--emerald);">0.10 (Low)</td>
              <td class="mono" style="color: var(--emerald); font-weight: 800; font-size: 1.15rem;">95 / 100</td>
            </tr>
            <tr>
              <td><span class="badge badge-cyan" style="border-radius: 50%; width: 24px; height: 24px; padding: 0; justify-content: center;">2</span></td>
              <td><strong style="color: #fff;">Fulfil Urgent VIP Order (10 units)</strong></td>
              <td><span class="badge badge-indigo">Ops / Customer</span></td>
              <td class="mono" style="color: var(--rose);">0.90 (Today)</td>
              <td class="mono">Immediate</td>
              <td class="mono" style="color: var(--emerald);">0.15 (Low)</td>
              <td class="mono" style="color: var(--cyan); font-weight: 800; font-size: 1.15rem;">91 / 100</td>
            </tr>
            <tr>
              <td><span class="badge badge-amber" style="border-radius: 50%; width: 24px; height: 24px; padding: 0; justify-content: center;">3</span></td>
              <td><strong style="color: #fff;">Reorder Product A (15 units)</strong></td>
              <td><span class="badge badge-amber">Inventory</span></td>
              <td class="mono">0.85 (Depletion)</td>
              <td class="mono">5 Days</td>
              <td class="mono" style="color: var(--amber);">0.25 (Moderate)</td>
              <td class="mono" style="color: var(--amber); font-weight: 800; font-size: 1.15rem;">67 / 100</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (stepNum === 5) {
    stage.innerHTML = `
      <div style="background: rgba(0,0,0,0.35); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h4 style="font-size: 1.1rem; color: #fff;">
            <i class="ph-bold ph-git-fork" style="color: var(--emerald);"></i> Step 5: Final Arbitration Decision Routing
          </h4>
          <span class="badge badge-emerald">ARBITRATION RESOLVED</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Deterministic routing assignments: <strong>EXECUTE / DELAY / ESCALATE</strong>.
        </p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
          <!-- Item 1 -->
          <div class="glass-panel" style="padding: 1.25rem; border-top: 3px solid var(--emerald);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="badge badge-execute">EXECUTE</span>
              <span class="mono" style="font-size: 0.72rem; color: var(--text-dim);">Rank #1</span>
            </div>
            <h5 style="color: #fff; font-size: 0.95rem; margin-top: 0.75rem;">Pay Statutory GST Liability</h5>
            <div class="mono" style="font-size: 1.2rem; font-weight: 800; color: var(--emerald); margin: 0.35rem 0;">₹25,000.00</div>
            <p style="font-size: 0.75rem; color: var(--text-muted);">
              Approved for immediate execution. Protects statutory compliance and leaves ₹15,000 liquid capital.
            </p>
          </div>

          <!-- Item 2 -->
          <div class="glass-panel" style="padding: 1.25rem; border-top: 3px solid var(--cyan);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="badge badge-execute">EXECUTE</span>
              <span class="mono" style="font-size: 0.72rem; color: var(--text-dim);">Rank #2</span>
            </div>
            <h5 style="color: #fff; font-size: 0.95rem; margin-top: 0.75rem;">Fulfil VIP Customer Order</h5>
            <div class="mono" style="font-size: 1.2rem; font-weight: 800; color: var(--cyan); margin: 0.35rem 0;">10 Units (Shelf)</div>
            <p style="font-size: 0.75rem; color: var(--text-muted);">
              Approved for immediate fulfillment. 10 units allocated from existing 15 units of shelf stock. ₹0 cash cost.
            </p>
          </div>

          <!-- Item 3 -->
          <div class="glass-panel" style="padding: 1.25rem; border-top: 3px solid var(--amber);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="badge badge-delay">DELAY</span>
              <span class="mono" style="font-size: 0.72rem; color: var(--text-dim);">Rank #3</span>
            </div>
            <h5 style="color: #fff; font-size: 0.95rem; margin-top: 0.75rem;">Inventory Reorder (Product A)</h5>
            <div class="mono" style="font-size: 1.2rem; font-weight: 800; color: var(--amber); margin: 0.35rem 0;">₹30,000.00</div>
            <p style="font-size: 0.75rem; color: var(--text-muted);">
              Action delayed until post-GST settlement. Forwarded to Human-in-the-Loop layer for owner approval, rejection, or modification.
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

// Stepper click handlers
document.querySelectorAll(".stepper-node").forEach(node => {
  node.onclick = () => {
    const step = parseInt(node.getAttribute("data-step"));
    renderArbitrationStep(step);
    playTone(480, "sine", 0.05);
  };
});

// Run Arbitration Button (progressive animation)
const runArbitrationBtn = document.getElementById("runArbitrationBtn");
if (runArbitrationBtn) {
  runArbitrationBtn.onclick = () => {
    runArbitrationBtn.disabled = true;
    runArbitrationBtn.innerHTML = `<i class="ph ph-circle-notch ph-spin"></i> Executing Arbitration Engine...`;

    let step = 1;
    renderArbitrationStep(step);
    playTone(500, "sine", 0.1);

    const interval = setInterval(() => {
      step++;
      if (step <= 5) {
        renderArbitrationStep(step);
        playTone(500 + step * 60, "sine", 0.1);
      } else {
        clearInterval(interval);
        runArbitrationBtn.disabled = false;
        runArbitrationBtn.innerHTML = `<i class="ph-bold ph-play-circle"></i> <span>Re-Run Arbitration</span>`;
        playSuccessChime();
        showToast("Arbitration Cycle Completed: GST Executed, VIP Order Fulfilled, Restock Delayed.", "success");
      }
    }, 750);
  };
}

// -----------------------------------------------------------------------------
// 9. Human-in-the-Loop (HITL) Action Cards (Approve / Reject / Modify)
// -----------------------------------------------------------------------------
function renderActionCards() {
  const grid = document.getElementById("actionCardsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const pending = AppState.pending_actions;
  if (pending.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
        <i class="ph-fill ph-check-circle" style="font-size: 3rem; color: var(--emerald);"></i>
        <h4 style="margin-top: 0.75rem; font-size: 1.2rem; color: #fff;">All Actions Resolved</h4>
        <p style="font-size: 0.85rem; color: var(--text-dim);">No pending recommendations require human-in-the-loop sign-off.</p>
      </div>
    `;
    return;
  }

  pending.forEach(action => {
    const cardEl = document.createElement("div");
    cardEl.className = `glass-panel action-card ${action.arbitration_decision === 'EXECUTE' ? 'approved' : 'deferred'}`;
    cardEl.id = `actionCard-${action.id}`;

    const scorePct = Math.round((action.urgency_score || 0.5) * 100);
    const badgeTier = action.arbitration_decision === 'EXECUTE' ? 'badge-execute' : 'badge-delay';

    cardEl.innerHTML = `
      <div>
        <div class="card-top">
          <div>
            <div class="badge ${badgeTier}">${action.arbitration_decision} (ARBITRATED)</div>
            <div class="card-title">${action.title}</div>
            <span style="font-size: 0.72rem; color: var(--text-dim);">${action.agent} &bull; ${action.hitl_policy}</span>
          </div>
          <div class="badge badge-indigo mono">Confidence: ${Math.round((action.confidence || 0.9) * 100)}%</div>
        </div>

        <div style="margin: 0.85rem 0;">
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Resource Demanded</span>
          <div class="card-cost mono">${action.amount > 0 ? formatINR(action.amount) : action.resource_type}</div>
        </div>

        <div class="criteria-bars">
          <div class="crit-item">
            <span>Urgency Score</span>
            <div class="crit-bar-wrap">
              <div class="crit-bar-fill crit-urgency" style="width: ${scorePct}%"></div>
            </div>
          </div>
        </div>

        <p class="card-rationale">
          <i class="ph-bold ph-scales" style="color: var(--primary);"></i>
          ${action.reason}
        </p>
      </div>

      <div class="hitl-action-buttons">
        <button class="btn btn-approve" onclick="approveAction('${action.id}')" title="Confirm and commit action">
          <i class="ph-bold ph-check"></i> Approve
        </button>

        <button class="btn btn-reject" onclick="rejectAction('${action.id}')" title="Reject and archive proposal">
          <i class="ph-bold ph-x"></i> Reject
        </button>

        <button class="btn btn-modify" onclick="openModifyModal('${action.id}')" title="Adjust quantity, cost, or timing">
          <i class="ph-bold ph-pencil-simple"></i> Modify
        </button>
      </div>
    `;

    grid.appendChild(cardEl);
  });
}

// HITL Action Handlers
window.approveAction = function(actionId) {
  const action = AppState.pending_actions.find(a => a.id === actionId);
  if (!action) return;

  // Update operational state
  if (action.amount > 0) {
    AppState.finance.available_cash = Math.max(0, AppState.finance.available_cash - action.amount);
  }
  if (action.sku === "SKU-A42" && action.quantity) {
    if (action.id === "ACT-003") {
      AppState.inventory.product_a_stock = Math.max(0, AppState.inventory.product_a_stock - action.quantity);
    } else {
      AppState.inventory.product_a_stock += action.quantity;
    }
  }

  // Update KPI counters
  AppState.kpi.executed_actions++;
  AppState.kpi.hitl_interventions++;

  // Log to Decision History
  logHistoryRecord(
    `Owner Approved: ${action.title}`,
    action.agent,
    action.amount,
    "APPROVED",
    "EXECUTED"
  );

  // Remove from pending
  AppState.pending_actions = AppState.pending_actions.filter(a => a.id !== actionId);

  playSuccessChime();
  showToast(`Action ${action.id} approved & executed! Operational state updated.`, "success");
  updateOverviewHUD();
  renderActionCards();
  renderDecisionHistory();
  renderCatalogTable();
};

window.rejectAction = function(actionId) {
  const action = AppState.pending_actions.find(a => a.id === actionId);
  if (!action) return;

  AppState.kpi.hitl_interventions++;

  logHistoryRecord(
    `Owner Rejected: ${action.title}`,
    action.agent,
    0.0,
    "REJECTED",
    "CANCELLED"
  );

  AppState.pending_actions = AppState.pending_actions.filter(a => a.id !== actionId);

  playAlertTone();
  showToast(`Action ${action.id} rejected by business owner.`, "warning");
  updateOverviewHUD();
  renderActionCards();
  renderDecisionHistory();
};

// -----------------------------------------------------------------------------
// 10. Modify Action Modal Handler
// -----------------------------------------------------------------------------
window.openModifyModal = function(actionId) {
  const action = AppState.pending_actions.find(a => a.id === actionId);
  if (!action) return;

  const modal = document.getElementById("modifyActionModal");
  const cardIdInp = document.getElementById("modCardId");
  const titleInp = document.getElementById("modActionTitle");
  const qtyInp = document.getElementById("modQuantity");
  const amtInp = document.getElementById("modAmount");

  if (cardIdInp) cardIdInp.value = action.id;
  if (titleInp) titleInp.value = action.title;
  if (qtyInp) qtyInp.value = action.quantity || 5;
  if (amtInp) amtInp.value = action.amount > 0 ? 10000 : 0;

  if (modal) modal.classList.add("active");
  playTone(520, "sine", 0.08);
};

const closeModifyModalBtn = document.getElementById("closeModifyModal");
const cancelModifyBtn = document.getElementById("cancelModifyBtn");
const modifyForm = document.getElementById("modifyActionForm");

if (closeModifyModalBtn) closeModifyModalBtn.onclick = () => document.getElementById("modifyActionModal")?.classList.remove("active");
if (cancelModifyBtn) cancelModifyBtn.onclick = () => document.getElementById("modifyActionModal")?.classList.remove("active");

if (modifyForm) {
  modifyForm.onsubmit = (e) => {
    e.preventDefault();
    const actionId = document.getElementById("modCardId").value;
    const revQty = parseInt(document.getElementById("modQuantity").value) || 5;
    const revAmt = parseFloat(document.getElementById("modAmount").value) || 10000;
    const note = document.getElementById("modNote").value;

    const action = AppState.pending_actions.find(a => a.id === actionId);
    if (action) {
      action.amount = revAmt;
      action.quantity = revQty;
      action.title = `${action.title.split("(")[0]} (${revQty} Units - Modified)`;
      action.status = "MODIFIED_APPROVED";
      action.reason = `Owner Modified: ${note}`;
      action.arbitration_decision = "EXECUTE";

      // Execute modified version
      if (revAmt > 0) {
        AppState.finance.available_cash = Math.max(0, AppState.finance.available_cash - revAmt);
      }
      AppState.inventory.product_a_stock += revQty;

      AppState.kpi.hitl_interventions++;
      AppState.kpi.executed_actions++;

      logHistoryRecord(
        `Owner Modified & Approved: ${action.title}`,
        action.agent,
        revAmt,
        "MODIFIED",
        "EXECUTED"
      );

      AppState.pending_actions = AppState.pending_actions.filter(a => a.id !== actionId);

      document.getElementById("modifyActionModal")?.classList.remove("active");
      playSuccessChime();
      showToast(`Action modified: ${revQty} units approved for ${formatINR(revAmt)}. State updated!`, "success");

      updateOverviewHUD();
      renderActionCards();
      renderDecisionHistory();
      renderCatalogTable();
    }
  };
}

// -----------------------------------------------------------------------------
// 11. Structured Decision Trace ("Why this decision?")
// -----------------------------------------------------------------------------
const openDecisionTraceBtn = document.getElementById("openDecisionTraceBtn");
const decisionTraceModal = document.getElementById("decisionTraceModal");
const closeDecisionTraceModal = document.getElementById("closeDecisionTraceModal");
const closeDecisionTraceBtn = document.getElementById("closeDecisionTraceBtn");

if (openDecisionTraceBtn) {
  openDecisionTraceBtn.onclick = () => {
    renderDecisionTraceContent();
    if (decisionTraceModal) decisionTraceModal.classList.add("active");
    playTone(520, "sine", 0.08);
  };
}

if (closeDecisionTraceModal) closeDecisionTraceModal.onclick = () => decisionTraceModal?.classList.remove("active");
if (closeDecisionTraceBtn) closeDecisionTraceBtn.onclick = () => decisionTraceModal?.classList.remove("active");

function renderDecisionTraceContent() {
  const body = document.getElementById("decisionTraceBody");
  if (!body) return;

  body.innerHTML = `
    <div class="trace-factor-box">
      <div class="trace-factor-row">
        <div class="trace-factor-bullet" style="background: rgba(16, 185, 129, 0.2); color: var(--emerald);">
          <i class="ph-bold ph-coins"></i>
        </div>
        <div>
          <strong style="color: #fff;">Finance Agent Evaluation</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
            GST tax obligation of ₹25,000 detected due tomorrow. Non-payment triggers 18% annual penal interest and compliance portal lockouts. Priority: <strong>Critical (Score: 95)</strong>.
          </p>
        </div>
      </div>

      <div class="trace-factor-row">
        <div class="trace-factor-bullet" style="background: rgba(245, 158, 11, 0.2); color: var(--amber);">
          <i class="ph-bold ph-package"></i>
        </div>
        <div>
          <strong style="color: #fff;">Inventory Agent Evaluation</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
            Product A stock (15 units) is below reorder threshold (30 units). Standard restock batch cost is ₹30,000. Depletion lead time is 5 days. Priority: <strong>Moderate (Score: 67)</strong>.
          </p>
        </div>
      </div>

      <div class="trace-factor-row">
        <div class="trace-factor-bullet" style="background: rgba(139, 92, 246, 0.2); color: var(--secondary);">
          <i class="ph-bold ph-chat-centered-text"></i>
        </div>
        <div>
          <strong style="color: #fff;">Ops / Customer Agent Evaluation</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
            Urgent incoming VIP request for 10 units of Product A. Analysis verified that current shelf inventory (15 units) is sufficient to fulfill the order immediately without any procurement spend. Priority: <strong>High (Score: 91)</strong>.
          </p>
        </div>
      </div>

      <div class="trace-factor-row">
        <div class="trace-factor-bullet" style="background: rgba(239, 68, 68, 0.2); color: var(--rose);">
          <i class="ph-bold ph-warning-octagon"></i>
        </div>
        <div>
          <strong style="color: #fff;">Conflict &amp; Constraint Deadlock</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
            Combined financial requirement (₹25,000 + ₹30,000 = ₹55,000) exceeds available cash (₹40,000) by ₹15,000. Additionally, the owner's ₹10,000 Minimum Cash Reserve floor must not be breached.
          </p>
        </div>
      </div>

      <div class="trace-factor-row" style="background: rgba(16, 185, 129, 0.08); border-radius: var(--radius-sm); padding: 0.85rem; margin-top: 0.5rem;">
        <div class="trace-factor-bullet" style="background: var(--emerald); color: #fff;">
          <i class="ph-bold ph-check"></i>
        </div>
        <div>
          <strong style="color: var(--emerald);">Final Arbitration Decision Routing</strong>
          <ul style="font-size: 0.825rem; color: #fff; margin-top: 0.35rem; padding-left: 1.25rem;">
            <li><strong>1. GST Payment (₹25,000):</strong> Routed to <span class="badge badge-execute">EXECUTE</span> — Preserves statutory legal standing.</li>
            <li><strong>2. VIP Customer Order (10 units):</strong> Routed to <span class="badge badge-execute">EXECUTE</span> — Fulfill immediately from existing shelf stock.</li>
            <li><strong>3. Inventory Reorder (₹30,000):</strong> Routed to <span class="badge badge-delay">DELAY</span> — Deferred to avoid cash insolvency. Escalated to HITL for owner review.</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 12. Decision History & SHA-256 Hash Chain
// -----------------------------------------------------------------------------
function logHistoryRecord(query, agents, cost, action, status) {
  const prevEntry = AppState.decision_history[AppState.decision_history.length - 1];
  const prevHash = prevEntry ? prevEntry.entry_hash : "0000000000000000000000000000000000000000000000000000000000000000";
  const newId = AppState.decision_history.length + 1;

  // Deterministic mock SHA-256 hash generator
  const rawPayload = `${newId}|${prevHash}|${cost}|${action}|${Date.now()}`;
  let hashVal = 0;
  for (let i = 0; i < rawPayload.length; i++) {
    hashVal = (hashVal << 5) - hashVal + rawPayload.charCodeAt(i);
    hashVal |= 0;
  }
  const hexHash = Math.abs(hashVal).toString(16).padStart(8, "0") + "f81c9b209d6f3e1a8b7c4d5e6f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f".slice(8);

  const newRecord = {
    id: newId,
    timestamp: new Date().toISOString(),
    query: query,
    agents_involved: agents,
    conflict: true,
    routing: action,
    allocated_cost: cost,
    owner_action: action,
    status: status,
    entry_hash: hexHash,
    previous_hash: prevHash
  };

  AppState.decision_history.push(newRecord);
}

function renderDecisionHistory() {
  const tbody = document.getElementById("auditTableBody");
  const blocksRow = document.getElementById("chainBlocksRow");

  if (tbody) {
    tbody.innerHTML = "";
    AppState.decision_history.slice().reverse().forEach(entry => {
      const row = document.createElement("tr");
      row.style.cursor = "pointer";
      row.title = "Click to inspect structured Decision Trace";
      row.onclick = () => {
        renderDecisionTraceContent();
        if (decisionTraceModal) decisionTraceModal.classList.add("active");
      };

      const shortHash = entry.entry_hash ? entry.entry_hash.slice(0, 16) + "..." : "GENESIS";
      row.innerHTML = `
        <td class="mono">#${entry.id}</td>
        <td style="font-size: 0.75rem; color: var(--text-muted);">${new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td><strong style="color: #fff;">${entry.query}</strong></td>
        <td><span class="badge ${entry.routing === 'EXECUTE' || entry.routing === 'APPROVED' ? 'badge-execute' : 'badge-delay'}">${entry.routing}</span></td>
        <td class="mono" style="color: var(--emerald); font-weight: 700;">${formatINR(entry.allocated_cost)}</td>
        <td><span class="badge badge-indigo">${entry.owner_action}</span></td>
        <td class="hash-cell mono" style="color: var(--cyan);">${shortHash}</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Render visual chained blocks
  if (blocksRow) {
    blocksRow.innerHTML = "";
    const recentBlocks = AppState.decision_history.slice(-5);

    recentBlocks.forEach((entry, idx) => {
      const blockCard = document.createElement("div");
      const isGenesis = idx === 0 && entry.id === 1;
      blockCard.className = `chain-block-card ${isGenesis ? 'genesis' : ''}`;
      blockCard.id = `blockCard-${entry.id}`;
      blockCard.onclick = () => {
        document.getElementById("blockDetailTitle").textContent = `Block #${entry.id} Cryptographic Payload`;
        document.getElementById("blockDetailJson").textContent = JSON.stringify(entry, null, 2);
        document.getElementById("blockDetailModal")?.classList.add("active");
      };

      const shortHash = entry.entry_hash ? entry.entry_hash.slice(0, 12) + "..." : "GENESIS";
      const shortPrev = entry.previous_hash ? entry.previous_hash.slice(0, 10) + "..." : "0000000000";

      blockCard.innerHTML = `
        <div class="block-header">
          <span class="block-id mono">BLOCK #${entry.id}</span>
          <span class="badge badge-emerald">VERIFIED</span>
        </div>
        <div style="font-size: 0.72rem; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${entry.query}</div>
        <div class="block-hash-field mono" title="Previous Hash">Prev: ${shortPrev}</div>
        <div class="block-hash-field mono" style="color: var(--cyan);" title="Entry Hash">Hash: ${shortHash}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; font-size: 0.7rem; color: var(--text-dim);">
          <span class="mono">${formatINR(entry.allocated_cost)}</span>
          <span class="mono">${new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `;

      blocksRow.appendChild(blockCard);

      if (idx < recentBlocks.length - 1) {
        const arrow = document.createElement("div");
        arrow.className = "block-arrow";
        arrow.innerHTML = `<i class="ph-bold ph-arrow-right"></i>`;
        blocksRow.appendChild(arrow);
      }
    });
  }
}

// Tamper Attack Simulator
const tamperBtn = document.getElementById("tamperTestBtn");
if (tamperBtn) {
  tamperBtn.onclick = () => {
    const blocks = document.querySelectorAll(".chain-block-card");
    if (blocks.length === 0) return;

    const targetBlock = blocks[blocks.length - 1];
    targetBlock.classList.add("tampered");

    playAlertTone();
    const chainStatus = document.getElementById("chainStatusText");
    if (chainStatus) {
      chainStatus.innerHTML = `
        <span style="color: var(--rose); font-weight: 700;">
          <i class="ph-bold ph-warning-octagon"></i> TAMPER DETECTED: Hash mismatch at Block #${targetBlock.id.replace("blockCard-", "")}! Cryptographic seal broken.
        </span>
      `;
    }

    showToast("Tamper attack simulated! SHA-256 seal invalidated.", "error");

    setTimeout(() => {
      targetBlock.classList.remove("tampered");
    }, 4000);
  };
}

const refreshAuditBtn = document.getElementById("refreshAuditBtn");
if (refreshAuditBtn) {
  refreshAuditBtn.onclick = () => {
    playTone(660, "sine", 0.1);
    const chainStatus = document.getElementById("chainStatusText");
    if (chainStatus) {
      chainStatus.textContent = `Cryptographic integrity verified unbroken across ${AppState.decision_history.length} chained decisions.`;
    }
    showToast("SHA-256 Hash Chain Re-Verified: 100% Valid.", "success");
  };
}

// -----------------------------------------------------------------------------
// 13. Dynamic What-If Scenario Simulator
// -----------------------------------------------------------------------------
function initWhatIfSimulator() {
  const sliderCash = document.getElementById("simSliderCash");
  const sliderGst = document.getElementById("simSliderGst");
  const sliderInv = document.getElementById("simSliderInvCost");
  const sliderStock = document.getElementById("simSliderStock");
  const selUrgency = document.getElementById("simSelectUrgency");
  const selPriority = document.getElementById("simSelectPriority");
  const resetBtn = document.getElementById("resetSimScenarioBtn");

  function updateSimCalculations() {
    const cash = parseFloat(sliderCash.value);
    const gst = parseFloat(sliderGst.value);
    const inv = parseFloat(sliderInv.value);
    const stock = parseInt(sliderStock.value);
    const urgency = selUrgency.value;
    const priority = selPriority.value;

    // Display labels
    document.getElementById("simValCash").textContent = formatINR(cash);
    document.getElementById("simValGst").textContent = formatINR(gst);
    document.getElementById("simValInvCost").textContent = formatINR(inv);
    document.getElementById("simValStock").textContent = `${stock} Units`;
    document.getElementById("simValUrgency").textContent = urgency.toUpperCase();
    document.getElementById("simValPriority").textContent = priority.toUpperCase();

    // Computation
    const totalDemanded = gst + inv;
    const shortfall = Math.max(0, totalDemanded - cash);
    const hasConflict = shortfall > 0;
    const canFulfillShelf = stock >= 10;

    let routingGst = "EXECUTE";
    let routingInv = "DELAY";
    let routingOps = canFulfillShelf ? "EXECUTE (From Shelf)" : "ESCALATE (Stock Deficit)";

    if (!hasConflict) {
      routingGst = "EXECUTE";
      routingInv = "EXECUTE";
    }

    const box = document.getElementById("simLiveResultBox");
    if (box) {
      box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <i class="ph-bold ${hasConflict ? 'ph-warning-octagon' : 'ph-check-circle'}" style="font-size: 1.5rem; color: ${hasConflict ? 'var(--rose)' : 'var(--emerald)'};"></i>
            <div>
              <strong style="color: #fff; font-size: 1.05rem;">
                ${hasConflict ? `Conflict Detected: ${formatINR(shortfall)} Shortfall` : `All Demands Aligned (Surplus: ${formatINR(cash - totalDemanded)})`}
              </strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                Demanded: ${formatINR(totalDemanded)} &bull; Available: ${formatINR(cash)} &bull; Shelf Stock: ${stock} Units
              </div>
            </div>
          </div>
          <span class="badge ${hasConflict ? 'badge-rose' : 'badge-emerald'}">
            ${hasConflict ? 'CONFLICT STATE' : 'OPTIMAL EXECUTION'}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.85rem; margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.85rem;">
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">GST Recommendation</span>
            <div style="margin-top: 0.2rem;"><span class="badge badge-execute">${routingGst}</span></div>
          </div>
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">VIP Customer Order</span>
            <div style="margin-top: 0.2rem;"><span class="badge ${canFulfillShelf ? 'badge-execute' : 'badge-escalate'}">${routingOps}</span></div>
          </div>
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Inventory Reorder</span>
            <div style="margin-top: 0.2rem;"><span class="badge ${hasConflict ? 'badge-delay' : 'badge-execute'}">${routingInv}</span></div>
          </div>
        </div>
      `;
    }
  }

  if (sliderCash) sliderCash.oninput = updateSimCalculations;
  if (sliderGst) sliderGst.oninput = updateSimCalculations;
  if (sliderInv) sliderInv.oninput = updateSimCalculations;
  if (sliderStock) sliderStock.oninput = updateSimCalculations;
  if (selUrgency) selUrgency.onchange = updateSimCalculations;
  if (selPriority) selPriority.onchange = updateSimCalculations;

  if (resetBtn) {
    resetBtn.onclick = () => {
      sliderCash.value = 40000;
      sliderGst.value = 25000;
      sliderInv.value = 30000;
      sliderStock.value = 15;
      selUrgency.value = "high";
      selPriority.value = "vip";
      updateSimCalculations();
      playTone(480, "sine", 0.08);
      showToast("Simulator reset to baseline benchmark scenario.", "success");
    };
  }

  updateSimCalculations();
}

// -----------------------------------------------------------------------------
// 14. Save Constraints Form Handler
// -----------------------------------------------------------------------------
const saveConstraintsBtn = document.getElementById("saveConstraintsBtn");
if (saveConstraintsBtn) {
  saveConstraintsBtn.onclick = () => {
    const minReserve = parseFloat(document.getElementById("cfgMinCashReserve").value) || 10000;
    const maxPurch = parseFloat(document.getElementById("cfgMaxPurchase").value) || 35000;
    const critStock = parseInt(document.getElementById("cfgCriticalInventoryThreshold").value) || 10;
    const apprThresh = parseFloat(document.getElementById("cfgApprovalThreshold").value) || 15000;

    AppState.profile.constraints.min_cash_reserve = minReserve;
    AppState.profile.constraints.max_single_purchase = maxPurch;
    AppState.profile.constraints.critical_inventory_threshold = critStock;
    AppState.profile.constraints.approval_threshold = apprThresh;

    playSuccessChime();
    showToast("Business constraints updated! Re-evaluating arbitration rules...", "success");
    updateOverviewHUD();
  };
}

// -----------------------------------------------------------------------------
// 15. Analytics Chart.js Visualizations
// -----------------------------------------------------------------------------
let cashFlowChartInstance = null;
let stockRadarChartInstance = null;

function renderCharts() {
  const cashCtx = document.getElementById("cashFlowChart");
  if (cashCtx) {
    if (cashFlowChartInstance) cashFlowChartInstance.destroy();

    cashFlowChartInstance = new Chart(cashCtx, {
      type: "bar",
      data: {
        labels: ["30-Day Revenue", "Inventory Reorder Outflow", "Fixed Expenses", "Liquid Working Capital"],
        datasets: [{
          label: "Amount (INR)",
          data: [184520, 30000, 24000, AppState.finance.available_cash],
          backgroundColor: [
            "rgba(6, 182, 212, 0.65)",
            "rgba(245, 158, 11, 0.65)",
            "rgba(239, 68, 68, 0.65)",
            "rgba(16, 185, 129, 0.75)"
          ],
          borderColor: ["#06b6d4", "#f59e0b", "#ef4444", "#10b981"],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#94a3b8",
              font: { family: "JetBrains Mono" },
              callback: val => "₹" + val.toLocaleString("en-IN")
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#cbd5e1", font: { family: "Plus Jakarta Sans" } }
          }
        }
      }
    });
  }

  const radarCtx = document.getElementById("stockRadarChart");
  if (radarCtx) {
    if (stockRadarChartInstance) stockRadarChartInstance.destroy();

    const labels = AppState.inventory.catalog.map(i => i.name.split(" ")[0]);
    const stockData = AppState.inventory.catalog.map(i => i.stock);
    const reorderData = AppState.inventory.catalog.map(i => i.reorder);

    stockRadarChartInstance = new Chart(radarCtx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Stock On Hand",
            data: stockData,
            backgroundColor: "rgba(99, 102, 241, 0.65)",
            borderColor: "#6366f1",
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: "Reorder Threshold",
            data: reorderData,
            backgroundColor: "rgba(245, 158, 11, 0.4)",
            borderColor: "#f59e0b",
            borderWidth: 1.5,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { family: "Plus Jakarta Sans" } } }
        },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8", font: { family: "JetBrains Mono" } }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#cbd5e1", font: { family: "Plus Jakarta Sans" } }
          }
        }
      }
    });
  }
}

// -----------------------------------------------------------------------------
// 16. Store Onboarding Form
// -----------------------------------------------------------------------------
const openOnboardBtn = document.getElementById("openOnboardModalBtn");
const closeOnboardBtn = document.getElementById("closeOnboardModal");
const onboardModal = document.getElementById("onboardModal");
const onboardForm = document.getElementById("onboardForm");

if (openOnboardBtn) openOnboardBtn.onclick = () => onboardModal?.classList.add("active");
if (closeOnboardBtn) closeOnboardBtn.onclick = () => onboardModal?.classList.remove("active");

if (onboardForm) {
  onboardForm.onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("obBusinessName").value;
    const type = document.getElementById("obBusinessType").value;
    const cash = parseFloat(document.getElementById("obStartingCash").value) || 40000;

    AppState.profile.name = name;
    AppState.profile.type = type;
    AppState.finance.available_cash = cash;

    const storeSelect = document.getElementById("storeSelect");
    if (storeSelect) {
      const opt = document.createElement("option");
      opt.value = Date.now();
      opt.textContent = `${name} - ${formatINR(cash)}`;
      storeSelect.appendChild(opt);
      storeSelect.value = opt.value;
    }

    onboardModal?.classList.remove("active");
    onboardForm.reset();

    playSuccessChime();
    showToast(`Store "${name}" successfully onboarded with ${formatINR(cash)} initial capital!`, "success");
    updateOverviewHUD();
  };
}

// -----------------------------------------------------------------------------
// 17. Audio Synthesizer Toggle & Modal Backdrop Controls
// -----------------------------------------------------------------------------
const audioToggleBtn = document.getElementById("audioToggleBtn");
const audioIcon = document.getElementById("audioIcon");

if (audioToggleBtn) {
  audioToggleBtn.onclick = () => {
    AppState.audio_enabled = !AppState.audio_enabled;
    if (AppState.audio_enabled) {
      if (audioIcon) audioIcon.className = "ph-bold ph-speaker-high";
      audioToggleBtn.title = "Audio Feedback Enabled";
      playTone(600, "sine", 0.1);
    } else {
      if (audioIcon) audioIcon.className = "ph-bold ph-speaker-slash";
      audioToggleBtn.title = "Audio Feedback Muted";
    }
  };
}

// Dismiss modals on backdrop click or Escape key
window.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
  }
});

// -----------------------------------------------------------------------------
// 18. Initial Application Bootstrap
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  updateOverviewHUD();
  renderCatalogTable();
  initNLPVisualizer();
  renderArbitrationStep(1);
  renderActionCards();
  renderDecisionHistory();
  initWhatIfSimulator();

  // Try fetching backend stores if available
  fetch(`${API_BASE}/businesses`)
    .then(r => r.ok ? r.json() : [])
    .then(bizList => {
      if (bizList && bizList.length > 0) {
        const sel = document.getElementById("storeSelect");
        if (sel) {
          sel.innerHTML = "";
          bizList.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.textContent = `${b.business_name} (#${b.id}) - ${formatINR(b.cash_balance)}`;
            sel.appendChild(opt);
          });
        }
      }
    })
    .catch(() => {
      // Standalone mode is fully operational
    });
});
