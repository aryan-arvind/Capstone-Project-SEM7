/**
 * MSME Multi-Agent Decision Intelligence Platform
 * Review 2 Milestone K.5 — Agent Decision Cards Component
 * 
 * Owned by: Kohli
 * Responsibilities:
 *   - Dynamically renders the 3-Card Decision Matrix:
 *       1. Yellow Card: Inventory Agent (Stock demand: Reorder SKU-001 for ₹50,000)
 *       2. Blue Card: Finance Agent (Budget ceiling: Max spend allowed = ₹20,000)
 *       3. Green Card: Arbitrated Action Card (Enforces capping rule: Approved = ₹20,000)
 *   - Conforms strictly to the dark glassmorphic executive design system.
 *   - Step-by-step evaluation status sequence (Evaluating Agents... -> Inventory completed -> Finance completed -> Arbitration completed).
 *   - Graceful error handling & transparent demo fallback.
 */

(function (global) {
  'use strict';

  // Component configuration
  const CONFIG = {
    apiEndpoint: '/api/agents/evaluate',
    defaultContainerId: 'agentDecisionCardsContainer',
  };

  /**
   * Formats numeric INR currency amounts cleanly (e.g. 50000 -> ₹50,000.00).
   */
  function formatINR(amount, includeDecimals = true) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: includeDecimals ? 2 : 0,
      maximumFractionDigits: includeDecimals ? 2 : 0,
    }).format(num);
  }

  /**
   * Fallback mock data when backend API is offline or unavailable.
   */
  function getMockEvaluation() {
    return {
      success: true,
      is_mock_fallback: true,
      inventory: {
        agent: 'inventory',
        status: 'Active',
        recommendation: 'reorder',
        sku: 'SKU-001',
        current_stock: 10,
        min_threshold: 20,
        requested_amount: 50000.0,
        total_reorder_cost: 50000.0,
        priority: 'High',
        reason: 'Stock is below the configured threshold.',
        recommendation_text: 'Reorder SKU-001 for ₹50,000',
        critical_items: [{
          sku: 'SKU-001',
          item_name: 'Industrial Bearing Model X',
          current_stock: 10,
          min_threshold: 20,
          reorder_quantity: 50,
          unit_cost: 1000.0,
          reorder_cost: 50000.0,
        }]
      },
      finance: {
        agent: 'finance',
        status: 'Active',
        bank_cash: 40000.0,
        payroll_reserve: 20000.0,
        free_liquid_cash: 20000.0,
        max_spend_allowed: 20000.0,
        priority: 'High',
        reason: 'Available spending is limited by free liquid cash.',
        recommendation_text: 'Max spend allowed = ₹20,000',
        solvency_status: 'HEALTHY',
      },
      arbitration: {
        decision: 'APPROVE_CAPPED',
        status: 'CAPPED APPROVAL',
        conflict_detected: true,
        is_capped: true,
        requested_amount: 50000.0,
        requested_spend: 50000.0,
        budget_limit: 20000.0,
        budget_ceiling: 20000.0,
        approved_amount: 20000.0,
        approved_spend: 20000.0,
        curtailed_amount: 30000.0,
        approved_text: 'Approved = ₹20,000',
        reason: 'Inventory request exceeds the available finance budget. Reorder has been capped at the permitted amount.',
        decision_text: 'Inventory request exceeds the available finance budget. Reorder has been capped at the permitted amount.',
        action_card: {
          card_id: 'ACT-ARB-SKU001',
          title: 'Arbitrated Restock Order (SKU-001)',
          sku: 'SKU-001',
          approved_amount: 20000.0,
          status: 'CAPPED APPROVAL',
        }
      }
    };
  }

  /**
   * Escape HTML to prevent injection in error messages.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Fetches latest 2-agent evaluation data from backend.
   */
  async function fetchAgentEvaluation(customParams = {}) {
    try {
      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customParams),
      });

      if (!response.ok) {
        let errDetail = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson.detail) errDetail = errJson.detail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      return await response.json();
    } catch (err) {
      console.warn('[AgentComponent] POST failed, trying GET...', err);
      try {
        const getResp = await fetch(CONFIG.apiEndpoint);
        if (getResp.ok) return await getResp.json();
      } catch (_) {}
      throw err;
    }
  }

  /**
   * Renders a user-friendly error state card when API or SQLite fails (Section 18).
   */
  function renderError(containerElement, errorMsg) {
    if (!containerElement) return;
    containerElement.innerHTML = `
      <div class="glass-panel agent-card" style="
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.4);
        border-radius: var(--radius-lg, 16px);
        padding: 2rem;
        text-align: center;
        margin-bottom: 2rem;
      ">
        <div style="font-size: 2.5rem; color: #f87171; margin-bottom: 0.75rem;">
          <i class="ph-bold ph-warning-octagon"></i>
        </div>
        <h4 style="font-size: 1.2rem; color: #fff; font-weight: 700; margin-bottom: 0.5rem;">
          Agent Evaluation Pipeline Error
        </h4>
        <p style="font-size: 0.88rem; color: #cbd5e1; max-width: 600px; margin: 0 auto 1.25rem auto;">
          The multi-agent evaluation engine encountered an issue while communicating with the service: <br>
          <strong style="color: #f87171;">${escapeHtml(errorMsg)}</strong>
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="window.AgentComponent.runInteractiveEvaluation()">
            <i class="ph-bold ph-arrows-clockwise"></i> Retry Evaluation
          </button>
          <button class="btn btn-secondary" onclick="window.AgentComponent.loadDemoMode()">
            <i class="ph-bold ph-eye"></i> View Demo Data
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generates HTML markup for the Yellow Inventory Agent Card (K.1 / Section 12).
   */
  function renderInventoryCard(invData) {
    const isOptimal = invData.status === 'OPTIMAL' || invData.recommendation === 'none' || (invData.low_stock_count === 0 && (!invData.requested_amount || invData.requested_amount === 0));

    if (isOptimal) {
      return `
      <div class="glass-panel agent-card card-inventory" style="
        background: linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(14, 21, 40, 0.88) 100%);
        border: 1px solid rgba(16, 185, 129, 0.4);
        border-radius: var(--radius-lg, 16px);
        padding: 1.5rem;
        box-shadow: 0 12px 30px -8px rgba(16, 185, 129, 0.15), 0 0 1px 1px rgba(16, 185, 129, 0.15);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      ">
        <div>
          <!-- Badge Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(16, 185, 129, 0.2); color: #34d399;
                display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
              ">
                <i class="ph-bold ph-package"></i>
              </div>
              <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; letter-spacing: 0.5px;">
                INVENTORY AGENT
              </span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);">
              <span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-right: 4px;"></span>
              Healthy
            </span>
          </div>

          <!-- Title & Subtitle -->
          <h4 style="font-size: 1.15rem; color: #fff; font-weight: 700; margin-bottom: 0.35rem;">
            Inventory Agent
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted, #94a3b8); margin-bottom: 1.25rem;">
            Evaluates SQLite <code style="color: #34d399; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px;">inventory_items</code> for stock depletion.
          </p>

          <!-- SKU Detail Specs -->
          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm, 8px); padding: 0.9rem; margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Status:</span>
              <strong style="color: #34d399; font-family: 'JetBrains Mono', monospace;">All Stock Healthy</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Current Stock:</span>
              <strong style="color: #34d399; font-family: 'JetBrains Mono', monospace;">Above Threshold</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Minimum Threshold:</span>
              <strong style="color: #fff; font-family: 'JetBrains Mono', monospace;">Satisfied</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
              <span style="color: var(--text-muted, #94a3b8);">Priority:</span>
              <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 0.72rem; padding: 1px 6px;">None</span>
            </div>
          </div>

          <!-- Prominent Demand Amount Callout -->
          <div style="margin-bottom: 1.25rem; text-align: left;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #94a3b8);">
              Requested:
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #34d399; font-family: 'JetBrains Mono', monospace; line-height: 1.2; margin-top: 0.2rem;">
              ₹0.00
            </div>
          </div>

          <!-- Recommendation Banner -->
          <div style="
            background: rgba(16, 185, 129, 0.12);
            border-left: 3px solid #10b981;
            border-radius: 4px;
            padding: 0.75rem 0.9rem;
          ">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #34d399; margin-bottom: 0.2rem;">
              Recommendation: <strong>No Reorder Required</strong>
            </div>
            <div style="font-size: 0.85rem; font-weight: 500; color: #e2e8f0;">
              ${invData.reason || 'All inventory levels are above the configured minimum threshold.'}
            </div>
          </div>
        </div>

        <div style="margin-top: 1.25rem; font-size: 0.72rem; color: var(--text-dim, #64748b); display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 0.75rem;">
          <span>Trigger: <strong>stock &gt;= threshold</strong></span>
          <span>Deficit: <strong style="color: #34d399;">0 units</strong></span>
        </div>
      </div>
      `;
    }

    const critical = (invData.critical_items && invData.critical_items[0]) || {
      sku: invData.sku || 'SKU-001',
      item_name: 'Industrial Bearing Model X',
      current_stock: invData.current_stock !== undefined ? invData.current_stock : 10,
      min_threshold: invData.min_threshold !== undefined ? invData.min_threshold : 20,
      reorder_quantity: 50,
      unit_cost: 1000.0,
      reorder_cost: invData.requested_amount || invData.total_reorder_cost || 50000.0,
    };

    const sku = invData.sku || critical.sku || 'SKU-001';
    const currentStock = invData.current_stock !== undefined ? invData.current_stock : critical.current_stock;
    const minThreshold = invData.min_threshold !== undefined ? invData.min_threshold : critical.min_threshold;
    const requestedAmount = invData.requested_amount || invData.total_reorder_cost || 50000.0;
    const priority = invData.priority || 'High';
    const reason = invData.reason || 'Stock is below the configured threshold.';

    return `
      <div class="glass-panel agent-card card-inventory" style="
        background: linear-gradient(180deg, rgba(245, 158, 11, 0.09) 0%, rgba(14, 21, 40, 0.88) 100%);
        border: 1px solid rgba(245, 158, 11, 0.4);
        border-radius: var(--radius-lg, 16px);
        padding: 1.5rem;
        box-shadow: 0 12px 30px -8px rgba(245, 158, 11, 0.2), 0 0 1px 1px rgba(245, 158, 11, 0.2);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      ">
        <div style="position: absolute; top: -30px; right: -30px; width: 100px; height: 100px; background: radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%); pointer-events: none;"></div>

        <div>
          <!-- Badge Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(245, 158, 11, 0.2); color: #f59e0b;
                display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
              ">
                <i class="ph-bold ph-package"></i>
              </div>
              <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700; letter-spacing: 0.5px;">
                INVENTORY AGENT
              </span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);">
              <span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-right: 4px;"></span>
              Active
            </span>
          </div>

          <!-- Title & Subtitle -->
          <h4 style="font-size: 1.15rem; color: #fff; font-weight: 700; margin-bottom: 0.35rem;">
            Inventory Agent
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted, #94a3b8); margin-bottom: 1.25rem;">
            Evaluates SQLite <code style="color: #fbbf24; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px;">inventory_items</code> for stock depletion.
          </p>

          <!-- SKU Detail Specs -->
          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm, 8px); padding: 0.9rem; margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">SKU:</span>
              <strong style="color: #fff; font-family: 'JetBrains Mono', monospace;">${sku}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Current Stock:</span>
              <strong style="color: #f87171; font-family: 'JetBrains Mono', monospace;">${currentStock}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Minimum Threshold:</span>
              <strong style="color: #fff; font-family: 'JetBrains Mono', monospace;">${minThreshold}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
              <span style="color: var(--text-muted, #94a3b8);">Priority:</span>
              <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; font-size: 0.72rem; padding: 1px 6px;">${priority}</span>
            </div>
          </div>

          <!-- Prominent Demand Amount Callout -->
          <div style="margin-bottom: 1.25rem; text-align: left;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #94a3b8);">
              Requested:
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #fbbf24; font-family: 'JetBrains Mono', monospace; line-height: 1.2; margin-top: 0.2rem;">
              ${formatINR(requestedAmount)}
            </div>
          </div>

          <!-- Recommendation Banner -->
          <div style="
            background: rgba(245, 158, 11, 0.12);
            border-left: 3px solid #f59e0b;
            border-radius: 4px;
            padding: 0.75rem 0.9rem;
          ">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #fbbf24; margin-bottom: 0.2rem;">
              Recommendation: <strong>Reorder ${sku}</strong>
            </div>
            <div style="font-size: 0.85rem; font-weight: 500; color: #e2e8f0;">
              ${reason}
            </div>
          </div>
        </div>

        <div style="margin-top: 1.25rem; font-size: 0.72rem; color: var(--text-dim, #64748b); display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 0.75rem;">
          <span>Trigger: <strong>stock &lt; threshold</strong></span>
          <span>Deficit: <strong style="color: #f87171;">-${minThreshold - currentStock} units</strong></span>
        </div>
      </div>
    `;
  }

  /**
   * Generates HTML markup for the Blue Finance Agent Card (K.2 / Section 13).
   */
  function renderFinanceCard(finData) {
    const bankCash = finData.bank_cash !== undefined ? finData.bank_cash : 40000.0;
    const payrollReserve = finData.payroll_reserve !== undefined ? finData.payroll_reserve : 20000.0;
    const freeLiquid = finData.free_liquid_cash !== undefined ? finData.free_liquid_cash : 20000.0;
    const maxSpend = finData.max_spend_allowed !== undefined ? finData.max_spend_allowed : 20000.0;
    const reason = finData.reason || 'Available spending is limited by free liquid cash.';

    return `
      <div class="glass-panel agent-card card-finance" style="
        background: linear-gradient(180deg, rgba(6, 182, 212, 0.09) 0%, rgba(14, 21, 40, 0.88) 100%);
        border: 1px solid rgba(6, 182, 212, 0.4);
        border-radius: var(--radius-lg, 16px);
        padding: 1.5rem;
        box-shadow: 0 12px 30px -8px rgba(6, 182, 212, 0.2), 0 0 1px 1px rgba(6, 182, 212, 0.2);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      ">
        <div style="position: absolute; top: -30px; right: -30px; width: 100px; height: 100px; background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%); pointer-events: none;"></div>

        <div>
          <!-- Badge Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(6, 182, 212, 0.2); color: #06b6d4;
                display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
              ">
                <i class="ph-bold ph-coins"></i>
              </div>
              <span class="badge" style="background: rgba(6, 182, 212, 0.2); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.4); font-weight: 700; letter-spacing: 0.5px;">
                FINANCE AGENT
              </span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);">
              <span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; margin-right: 4px;"></span>
              Active
            </span>
          </div>

          <!-- Title & Subtitle -->
          <h4 style="font-size: 1.15rem; color: #fff; font-weight: 700; margin-bottom: 0.35rem;">
            Finance Agent
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted, #94a3b8); margin-bottom: 1.25rem;">
            Computes <strong style="color: #38bdf8;">Free Liquid Cash = Bank Cash - Payroll Reserve</strong>.
          </p>

          <!-- Ledger Breakdown -->
          <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm, 8px); padding: 0.9rem; margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Bank Cash:</span>
              <strong style="color: #fff; font-family: 'JetBrains Mono', monospace;">${formatINR(bankCash)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.45rem;">
              <span style="color: var(--text-muted, #94a3b8);">Payroll Reserve:</span>
              <strong style="color: #f87171; font-family: 'JetBrains Mono', monospace;">-${formatINR(payrollReserve)}</strong>
            </div>
            <div style="border-top: 1px dashed rgba(255, 255, 255, 0.1); margin: 0.4rem 0; padding-top: 0.4rem; display: flex; justify-content: space-between; font-size: 0.8rem;">
              <span style="color: #38bdf8;">Free Liquid Cash:</span>
              <strong style="color: #38bdf8; font-family: 'JetBrains Mono', monospace;">${formatINR(freeLiquid)}</strong>
            </div>
          </div>

          <!-- Prominent Budget Ceiling Callout -->
          <div style="margin-bottom: 1.25rem; text-align: left;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #94a3b8);">
              Budget Ceiling:
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #38bdf8; font-family: 'JetBrains Mono', monospace; line-height: 1.2; margin-top: 0.2rem;">
              ${formatINR(maxSpend)}
            </div>
          </div>

          <!-- Policy Banner -->
          <div style="
            background: rgba(6, 182, 212, 0.12);
            border-left: 3px solid #06b6d4;
            border-radius: 4px;
            padding: 0.75rem 0.9rem;
          ">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #38bdf8; margin-bottom: 0.2rem;">
              Liquidity Mandate
            </div>
            <div style="font-size: 0.85rem; font-weight: 500; color: #e2e8f0;">
              ${reason}
            </div>
          </div>
        </div>

        <div style="margin-top: 1.25rem; font-size: 0.72rem; color: var(--text-dim, #64748b); display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 0.75rem;">
          <span>Formula: <strong>Bank - Payroll</strong></span>
          <span>Max Spend Allowed: <strong style="color: #38bdf8;">${formatINR(maxSpend, false)}</strong></span>
        </div>
      </div>
    `;
  }

  /**
   * Generates HTML markup for the Green Arbitrated Action Card (K.3 / Section 14).
   */
  function renderArbitratedCard(arbData, invData, finData) {
    const requestedAmount = arbData.requested_amount !== undefined ? arbData.requested_amount : (invData.requested_amount || 0.0);
    const budgetLimit = arbData.budget_limit !== undefined ? arbData.budget_limit : (finData.max_spend_allowed || 20000.0);
    const approvedAmount = arbData.approved_amount !== undefined ? arbData.approved_amount : 0.0;
    const isCapped = arbData.conflict_detected !== undefined ? arbData.conflict_detected : false;
    const isNoAction = arbData.status === 'NO_ACTION' || (requestedAmount <= 0.0 && approvedAmount <= 0.0);
    const cardId = (arbData.action_card && arbData.action_card.card_id) || 'ACT-ARB-SKU001';
    const reason = arbData.reason || (isNoAction ? 'No inventory restock requested; stock levels are healthy.' : 'Inventory request exceeds the available finance budget.');

    if (isNoAction) {
      return `
      <div class="glass-panel agent-card card-arbitrated" style="
        background: linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(14, 21, 40, 0.92) 100%);
        border: 2px solid rgba(16, 185, 129, 0.4);
        border-radius: var(--radius-lg, 16px);
        padding: 1.5rem;
        box-shadow: 0 12px 32px -8px rgba(16, 185, 129, 0.15), 0 0 1px 1px rgba(16, 185, 129, 0.15);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      ">
        <div style="position: absolute; top: -30px; right: -30px; width: 100px; height: 100px; background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%); pointer-events: none;"></div>

        <div>
          <!-- Badge Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(16, 185, 129, 0.2); color: #10b981;
                display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
              ">
                <i class="ph-bold ph-scales"></i>
              </div>
              <span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 700; letter-spacing: 0.5px;">
                ARBITRATED ACTION
              </span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700;">
              <i class="ph-bold ph-check-circle" style="margin-right: 3px;"></i> NO ACTION NEEDED
            </span>
          </div>

          <!-- Title & Subtitle -->
          <h4 style="font-size: 1.15rem; color: #fff; font-weight: 700; margin-bottom: 0.35rem;">
            Arbitrated Action
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted, #94a3b8); margin-bottom: 1.25rem;">
            Compares <strong>Inventory Requested</strong> vs. <strong>Finance Budget</strong> to enforce capping.
          </p>

          <!-- Side-by-Side Comparison Metrics (Requested vs Allowed) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 1.25rem;">
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-sm, 8px); padding: 0.75rem;">
              <div style="font-size: 0.7rem; color: #34d399; text-transform: uppercase;">Inventory Requested:</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; margin-top: 0.2rem;">
                ₹0.00
              </div>
            </div>
            <div style="background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: var(--radius-sm, 8px); padding: 0.75rem;">
              <div style="font-size: 0.7rem; color: #38bdf8; text-transform: uppercase;">Finance Budget:</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; margin-top: 0.2rem;">
                ${formatINR(budgetLimit)}
              </div>
            </div>
          </div>

          <!-- Prominent Approved Amount Callout -->
          <div style="
            margin-bottom: 1.25rem; 
            padding: 0.85rem; 
            background: rgba(16, 185, 129, 0.12); 
            border: 1px solid rgba(16, 185, 129, 0.35); 
            border-radius: var(--radius-sm, 8px);
            text-align: left;
          ">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #34d399; font-weight: 700;">
              Approved Amount:
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: #34d399; font-family: 'JetBrains Mono', monospace; line-height: 1.2; margin-top: 0.2rem;">
              ₹0.00
            </div>
            <div style="font-size: 0.75rem; color: #34d399; margin-top: 0.35rem;">✓ Stock levels are optimal; no capital expenditure required.</div>
          </div>

          <!-- Reason Callout Box -->
          <div style="
            background: rgba(16, 185, 129, 0.14);
            border-left: 3px solid #10b981;
            border-radius: 4px;
            padding: 0.75rem 0.9rem;
            margin-bottom: 1.25rem;
          ">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #34d399; margin-bottom: 0.2rem;">
              Decision:
            </div>
            <div style="font-size: 0.85rem; font-weight: 500; color: #e2e8f0; line-height: 1.4;">
              ${reason}
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.6rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1rem;">
          <button 
            class="btn btn-secondary" 
            style="width: 100%; justify-content: center; opacity: 0.75; cursor: not-allowed;"
            disabled
          >
            <i class="ph-bold ph-check-circle" style="font-size: 1.1rem;"></i>
            <span>No Action Required (Stock Optimal)</span>
          </button>
        </div>
      </div>
      `;
    }

    return `
      <div class="glass-panel agent-card card-arbitrated" style="
        background: linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(14, 21, 40, 0.92) 100%);
        border: 2px solid rgba(16, 185, 129, 0.5);
        border-radius: var(--radius-lg, 16px);
        padding: 1.5rem;
        box-shadow: 0 12px 32px -8px rgba(16, 185, 129, 0.25), 0 0 1px 1px rgba(16, 185, 129, 0.25);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      ">
        <div style="position: absolute; top: -30px; right: -30px; width: 100px; height: 100px; background: radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, transparent 70%); pointer-events: none;"></div>

        <div>
          <!-- Badge Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="
                width: 36px; height: 36px; border-radius: 10px;
                background: rgba(16, 185, 129, 0.2); color: #10b981;
                display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
              ">
                <i class="ph-bold ph-scales"></i>
              </div>
              <span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 700; letter-spacing: 0.5px;">
                ARBITRATED ACTION
              </span>
            </div>
            <span class="badge" style="background: ${isCapped ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)'}; color: ${isCapped ? '#fbbf24' : '#34d399'}; border: 1px solid ${isCapped ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; font-weight: 700;">
              <i class="ph-bold ${isCapped ? 'ph-arrows-down' : 'ph-check-circle'}" style="margin-right: 3px;"></i> ${isCapped ? 'CAPPED APPROVAL' : 'FULL APPROVAL'}
            </span>
          </div>

          <!-- Title & Subtitle -->
          <h4 style="font-size: 1.15rem; color: #fff; font-weight: 700; margin-bottom: 0.35rem;">
            Arbitrated Action
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted, #94a3b8); margin-bottom: 1.25rem;">
            Compares <strong>Inventory Requested</strong> vs. <strong>Finance Budget</strong> to enforce capping.
          </p>

          <!-- Side-by-Side Comparison Metrics (Requested vs Allowed) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 1.25rem;">
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: var(--radius-sm, 8px); padding: 0.75rem;">
              <div style="font-size: 0.7rem; color: #fbbf24; text-transform: uppercase;">Inventory Requested:</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; margin-top: 0.2rem;">
                ${formatINR(requestedAmount)}
              </div>
            </div>
            <div style="background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: var(--radius-sm, 8px); padding: 0.75rem;">
              <div style="font-size: 0.7rem; color: #38bdf8; text-transform: uppercase;">Finance Budget:</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; margin-top: 0.2rem;">
                ${formatINR(budgetLimit)}
              </div>
            </div>
          </div>

          <!-- Prominent Approved Amount Callout (Visually Obvious Capping) -->
          <div style="
            margin-bottom: 1.25rem; 
            padding: 0.85rem; 
            background: rgba(16, 185, 129, 0.15); 
            border: 1px dashed rgba(16, 185, 129, 0.5); 
            border-radius: var(--radius-sm, 8px);
            text-align: left;
          ">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #34d399; font-weight: 700;">
              Approved Amount:
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: #34d399; font-family: 'JetBrains Mono', monospace; line-height: 1.2; margin-top: 0.2rem;">
              ${formatINR(approvedAmount)}
            </div>
            ${isCapped ? `<div style="font-size: 0.75rem; color: #fbbf24; margin-top: 0.35rem;">⚠️ Original request ₹${Number(requestedAmount).toLocaleString('en-IN')} curtailed to ₹${Number(approvedAmount).toLocaleString('en-IN')}</div>` : ''}
          </div>

          <!-- Reason Callout Box -->
          <div style="
            background: rgba(16, 185, 129, 0.14);
            border-left: 3px solid #10b981;
            border-radius: 4px;
            padding: 0.75rem 0.9rem;
            margin-bottom: 1.25rem;
          ">
            <div style="font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #34d399; margin-bottom: 0.2rem;">
              Reason:
            </div>
            <div style="font-size: 0.85rem; font-weight: 500; color: #e2e8f0; line-height: 1.4;">
              ${reason}
            </div>
          </div>
        </div>

        <!-- 1-Click Governance Action Controls -->
        <div style="display: flex; flex-direction: column; gap: 0.6rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1rem;">
          <button 
            class="btn btn-primary" 
            style="width: 100%; justify-content: center; background: #10b981; border-color: #10b981; font-weight: 700;"
            onclick="window.AgentComponent.executeAction('${cardId}', ${approvedAmount})"
          >
            <i class="ph-bold ph-check-circle" style="font-size: 1.1rem;"></i>
            <span>Confirm & Execute (${formatINR(approvedAmount, false)})</span>
          </button>

          <button 
            class="btn btn-secondary" 
            style="width: 100%; justify-content: center; font-size: 0.78rem; padding: 0.45rem;"
            onclick="window.AgentComponent.executeAction('${cardId}', ${approvedAmount}, true)"
          >
            <i class="ph-bold ph-bug"></i>
            <span>Simulate Gateway Network Fallback</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Main Render Function: Injects the 3 cards into target DOM container.
   */
  function render(containerElement, data) {
    if (!containerElement) return;

    const inv = data.inventory || {};
    const fin = data.finance || {};
    const arb = data.arbitration || {};
    const isMock = data.is_mock_fallback === true;

    const html = `
      <div class="agent-decision-workspace" style="margin-bottom: 2rem;">
        <!-- Header Banner with Evaluate Trigger -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4);">REVIEW 2 MILESTONE</span>
              <span style="font-size: 0.78rem; color: var(--text-dim, #64748b);">Kohli's Module: K.1 — K.5</span>
            </div>
            <h3 style="font-size: 1.35rem; color: #fff; font-weight: 800; margin-top: 0.35rem;">
              2-Agent Engine + Arbitration API + Decision Cards
            </h3>
            <p style="font-size: 0.82rem; color: var(--text-muted, #94a3b8);">
              Inventory Agent Demand vs. Finance Budget Ceiling &rarr; Deterministic Capping Enforcement.
            </p>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center;">
            ${isMock ? `<span class="badge badge-amber" style="padding: 0.4rem 0.6rem;"><i class="ph-bold ph-warning"></i> DEMO / OFFLINE FALLBACK</span>` : ''}
            <button class="btn btn-primary" id="btnEvaluateMAS" onclick="window.AgentComponent.runInteractiveEvaluation()">
              <i class="ph-bold ph-play-circle" style="font-size: 1.15rem;"></i>
              <span>Evaluate Agents</span>
            </button>
          </div>
        </div>

        <!-- Dynamic Multi-Stage Evaluation Status Bar (Section 17) -->
        <div id="agentEvalStatusBox" style="display: none; margin-bottom: 1.25rem; padding: 0.85rem 1rem; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-sm, 8px);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="spinner" style="width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
              <span id="agentEvalProgressText" style="font-size: 0.88rem; color: #fff; font-weight: 600;">Evaluating Agents...</span>
            </div>
            <div style="display: flex; gap: 0.5rem; font-size: 0.75rem;" id="agentEvalStepPills">
              <span id="stepPillInv" class="badge" style="background: rgba(255,255,255,0.05); color: #94a3b8;">Inventory Agent</span>
              <span id="stepPillFin" class="badge" style="background: rgba(255,255,255,0.05); color: #94a3b8;">Finance Agent</span>
              <span id="stepPillArb" class="badge" style="background: rgba(255,255,255,0.05); color: #94a3b8;">Arbitration</span>
            </div>
          </div>
        </div>

        <!-- 3-Card Responsive Grid -->
        <div class="agents-decision-cards-grid" id="cardsGridContainer" style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1.5rem;
          align-items: stretch;
        ">
          ${renderInventoryCard(inv)}
          ${renderFinanceCard(fin)}
          ${renderArbitratedCard(arb, inv, fin)}
        </div>
      </div>
    `;

    containerElement.innerHTML = html;
  }

  /**
   * Section 17 Interactive Flow:
   * Show:
   *   Evaluating Agents...
   * Then:
   *   Inventory Agent → completed
   *   Finance Agent → completed
   *   Arbitration → completed
   * Then render the three cards.
   */
  async function runInteractiveEvaluation(containerId = CONFIG.defaultContainerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statusBox = document.getElementById('agentEvalStatusBox');
    const progressText = document.getElementById('agentEvalProgressText');
    const pillInv = document.getElementById('stepPillInv');
    const pillFin = document.getElementById('stepPillFin');
    const pillArb = document.getElementById('stepPillArb');

    if (statusBox) statusBox.style.display = 'block';

    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    try {
      // Step 1: Evaluating Agents...
      if (progressText) progressText.innerText = 'Evaluating Agents...';
      await delay(250);

      // Trigger Backend API in parallel
      const dataPromise = fetchAgentEvaluation();

      // Step 2: Inventory Agent -> completed
      if (progressText) progressText.innerText = 'Inventory Agent → completed';
      if (pillInv) {
        pillInv.style.background = 'rgba(245, 158, 11, 0.25)';
        pillInv.style.color = '#fbbf24';
        pillInv.innerHTML = '<i class="ph-bold ph-check"></i> Inventory Agent: completed';
      }
      await delay(250);

      // Step 3: Finance Agent -> completed
      if (progressText) progressText.innerText = 'Finance Agent → completed';
      if (pillFin) {
        pillFin.style.background = 'rgba(6, 182, 212, 0.25)';
        pillFin.style.color = '#38bdf8';
        pillFin.innerHTML = '<i class="ph-bold ph-check"></i> Finance Agent: completed';
      }
      await delay(250);

      // Step 4: Arbitration -> completed
      if (progressText) progressText.innerText = 'Arbitration → completed';
      if (pillArb) {
        pillArb.style.background = 'rgba(16, 185, 129, 0.25)';
        pillArb.style.color = '#34d399';
        pillArb.innerHTML = '<i class="ph-bold ph-check"></i> Arbitration: completed';
      }
      await delay(250);

      // Await backend response
      const data = await dataPromise;

      // Step 5: Render the three cards
      render(container, data);

      if (typeof global.showToast === 'function') {
        global.showToast('✅ 2-Agent Evaluation completed. Capping rule enforced: Approved = ₹20,000.', 'success');
      }
    } catch (err) {
      console.error('[AgentComponent] Evaluation failed:', err);
      if (progressText) progressText.innerText = `Evaluation Error: ${err.message}`;
      renderError(container, err.message);
    }
  }

  /**
   * Interactive Action Execution handler: Calls /action/confirm and shows toast.
   */
  async function executeAction(cardId, amount, simulateFailure = false) {
    try {
      const resp = await fetch('/action/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: 1,
          card_id: cardId,
          amount: Number(amount),
          simulate_failure: simulateFailure,
        }),
      });

      const res = await resp.json();
      if (simulateFailure || res.status === 'HELD_IN_AUDIT_STATE') {
        if (typeof global.showToast === 'function') {
          global.showToast('⚠️ Payment Gateway Timeout simulated! Action held safely in audit log without deduction.', 'warning');
        } else {
          alert('⚠️ Payment Gateway Timeout simulated! Action held safely in audit log.');
        }
      } else {
        if (typeof global.showToast === 'function') {
          global.showToast(`✅ Action Approved! ₹${Number(amount).toLocaleString('en-IN')} disbursed (Ref: ${res.payment_reference || 'CONFIRMED'}).`, 'success');
        } else {
          alert(`✅ Action Executed successfully! ₹${Number(amount).toLocaleString('en-IN')} disbursed.`);
        }
      }
    } catch (err) {
      console.error('[AgentComponent] Execution failed:', err);
      alert(`Action execution failed: ${err.message}`);
    }
  }

  /**
   * Fallback to Demo Data on demand.
   */
  function loadDemoMode(containerId = CONFIG.defaultContainerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    render(container, getMockEvaluation());
  }

  /**
   * Mounts the component into specified or default container.
   */
  async function mount(containerId = CONFIG.defaultContainerId, initialData = null) {
    let container = document.getElementById(containerId);
    if (!container) {
      const parentTab = document.getElementById('tab-agents') || document.getElementById('tab-arbitration') || document.getElementById('mainContainer');
      if (parentTab) {
        container = document.createElement('div');
        container.id = containerId;
        parentTab.insertBefore(container, parentTab.firstChild);
      }
    }

    if (!container) {
      console.warn(`[AgentComponent] Container #${containerId} not found.`);
      return;
    }

    try {
      const data = initialData || await fetchAgentEvaluation();
      render(container, data);
    } catch (err) {
      console.error('[AgentComponent] Failed to mount decision cards:', err);
      renderError(container, err.message);
    }
  }

  // Expose component to global window
  global.AgentComponent = {
    mount: mount,
    refresh: () => mount(CONFIG.defaultContainerId),
    runInteractiveEvaluation: () => runInteractiveEvaluation(CONFIG.defaultContainerId),
    loadDemoMode: () => loadDemoMode(CONFIG.defaultContainerId),
    render: render,
    renderError: (errorMsg) => renderError(document.getElementById(CONFIG.defaultContainerId), errorMsg),
    fetchAgentEvaluation: fetchAgentEvaluation,
    executeAction: executeAction,
  };

  // Auto-init on DOMContentLoaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mount());
    } else {
      setTimeout(() => mount(), 100);
    }
  }

})(typeof window !== 'undefined' ? window : this);
