// Real LLM Specialist Agents with Schema Validation and Fallback.
import { callLLM, getCachedResponse, setCachedResponse } from './llm.mjs';
import { actionsOf, ACTIONS } from './actions.mjs';
import { DECISION_DEPTS, deptOfAgent } from './roster.mjs';
import { stateSummary, mockPropose } from './agents.mjs';
import { validateProposal } from './schema.mjs';
import { check, lookahead } from './constraints.mjs';
import { canonicalImpact, detectConflicts, withIds } from './arbiter.mjs';

const IMPACT = {
  accept_bulk_order: 0, extend_credit_terms: -0.5, clear_stock_discount: 0.85,
  place_reorder: 0, prepay_supplier_discount: -1,
  schedule_overtime: -1, schedule_maintenance: -1,
  send_dunning: 0.6, early_payment_discount: 0.69, factor_invoices: 0.96,
  draw_overdraft: 1, repay_overdraft: -1, delay_payables: 1, pay_payables_early: -0.985,
  settle_msme_overdue: -1, pay_gst_dues: -1,
};

const DEPT_ROLES = {
  sales: 'You are the Sales Department Specialist for an MSME. Your objective is driving revenue and order intake while guarding against extended customer credit terms.',
  procurement: 'You are the Procurement Department Specialist for an MSME. Your objective is keeping raw material stock adequate for production while capturing supplier early-payment discounts.',
  production: 'You are the Production & Operations Specialist for an MSME. Your objective is running line capacity smoothly and scheduling preventative maintenance before machinery breaks down.',
  collections: 'You are the Collections & Receivables Specialist for an MSME. Your objective is speeding up customer invoice collections and recovering overdue receivables via dunning or factoring.',
  treasury: 'You are the Treasury & Liquidity Specialist for an MSME. Your objective is preserving a safe bank cash buffer above covenants and minimizing overdraft interest cost.',
  compliance: 'You are the Compliance & Statutory Risk Specialist for an MSME. Your objective is strictly adhering to the 45-day MSME supplier payment rule and settling GST liabilities on time.',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Deterministic Verifier: validates and clamps proposals against actual ledger bounds.
 */
export function verifyProposal(pr, state, p) {
  const allowed = actionsOf(deptOfAgent(pr.agent));
  if (!allowed.includes(pr.action_type)) {
    return { ok: false, reason: `Action ${pr.action_type} is not allowed for ${pr.agent}` };
  }
  if (pr.amount_inr <= 0) {
    return { ok: false, reason: 'Amount must be positive' };
  }

  // Domain checks against ledger
  if (pr.action_type === 'draw_overdraft') {
    const headroom = Math.max(0, state.od.limit - state.od.used);
    if (headroom <= 0) return { ok: false, reason: 'No overdraft headroom available' };
    pr.amount_inr = Math.min(pr.amount_inr, headroom);
  }
  if (pr.action_type === 'repay_overdraft') {
    if (state.od.used <= 0) return { ok: false, reason: 'No overdraft currently drawn to repay' };
    pr.amount_inr = Math.min(pr.amount_inr, state.od.used, Math.max(0, state.cash));
  }
  if (pr.action_type === 'pay_gst_dues') {
    if (state.gstPayable <= 0) return { ok: false, reason: 'No outstanding GST payable' };
    pr.amount_inr = Math.min(pr.amount_inr, state.gstPayable);
  }

  return { ok: true, proposal: pr };
}

/**
 * Propose for one department using LLM with retry and fallback.
 */
export async function proposeDepartmentLLM(deptKey, state, p, { lastDecisions = [], scenarioText = '', mockHandler = null, seed = 0 } = {}) {
  const isLLMOn = process.env.LLM_MODE === 'on' || mockHandler;
  if (!isLLMOn) {
    return mockPropose(deptKey, state, p, seed).map(pr => ({ ...pr, source: 'rule-fallback' }));
  }

  const cached = getCachedResponse(scenarioText, state.week, deptKey);
  if (cached && !mockHandler) {
    return cached;
  }

  const agentDef = DECISION_DEPTS.find(d => d.key === deptKey);
  const agentId = agentDef.agent.id;
  const allowed = actionsOf(deptKey);
  const summary = stateSummary(state, p);

  const systemPrompt = `${DEPT_ROLES[deptKey]}
Allowed action_types: ${JSON.stringify(allowed)}.
You must propose 1 to 3 actions that best optimize your department's working-capital health.
Return STRICT JSON in this exact shape:
{
  "proposals": [
    {
      "action_type": "string (one of allowed action_types)",
      "amount_inr": integer (positive whole rupees),
      "target": "string",
      "week": integer (0 to 4),
      "reasoning": "string (max 200 chars)",
      "confidence": float (between 0.1 and 0.99)
    }
  ]
}`;

  const userPrompt = `Current Week: ${state.week}
Active Scenario: ${scenarioText || 'baseline (normal operations)'}
Ledger Snapshot: ${JSON.stringify(summary, null, 2)}
Last Cycle Decisions: ${JSON.stringify(lastDecisions.slice(-6))}
Please provide your department's proposals as JSON.`;

  let response = null;
  let attempts = 0;

  while (attempts < 2) {
    attempts++;
    try {
      response = await callLLM({
        systemPrompt,
        userPrompt: attempts === 2 ? userPrompt + '\nNOTE: Your previous output was invalid JSON. Reply with strict JSON only.' : userPrompt,
        schemaName: 'DepartmentProposals',
        mockHandler,
      });
      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        if (Array.isArray(parsed.proposals) && parsed.proposals.length > 0) {
          const verified = [];
          for (const raw of parsed.proposals) {
            const rawAmt = Math.round(Number(raw.amount_inr) || 0);
            const actType = String(raw.action_type || '').trim();
            if (!allowed.includes(actType) || rawAmt <= 0) continue;

            const pr = {
              agent: agentId,
              action_type: actType,
              amount_inr: rawAmt,
              timing_week: Math.min(state.week + p.sim.horizon_weeks - 1, state.week + (Math.round(Number(raw.week) || 0))),
              cash_impact_inr: Math.round(rawAmt * (IMPACT[actType] ?? 0)),
              confidence: Math.max(0.1, Math.min(0.99, Number(raw.confidence) || 0.7)),
              rationale: String(raw.reasoning || raw.rationale || 'Specialist LLM recommendation').slice(0, 300),
              source: response.model || 'llm:active',
            };

            const chk = verifyProposal(pr, state, p);
            if (chk.ok) verified.push(chk.proposal);
          }

          if (verified.length > 0) {
            setCachedResponse(scenarioText, state.week, deptKey, verified);
            return verified;
          }
        }
      }
    } catch (err) {
      // try once more
    }
  }

  // Fallback to deterministic rules
  const fallback = mockPropose(deptKey, state, p, seed).map(pr => ({ ...pr, source: 'rule-fallback' }));
  return fallback;
}

/**
 * Gather proposals from all 6 departments with ~1s stagger for free tier API safety.
 */
export async function proposeAllWithLLM({ state, p, seed = 0, lastDecisions = [], scenarioText = '', mockHandler = null }) {
  const proposals = [], failures = [];
  const isLLMOn = process.env.LLM_MODE === 'on' || mockHandler;

  for (let i = 0; i < DECISION_DEPTS.length; i++) {
    const d = DECISION_DEPTS[i];
    if (isLLMOn && i > 0 && !mockHandler) {
      await sleep(1000); // 1s stagger for rate limits
    }
    const rawList = await proposeDepartmentLLM(d.key, state, p, { lastDecisions, scenarioText, mockHandler, seed });
    const ctx = { agentId: d.agent.id, allowed: actionsOf(d.key), week: state.week, horizon: p.sim.horizon_weeks };

    for (const pr of rawList) {
      const v = validateProposal(pr, ctx);
      if (v.ok) {
        proposals.push(v.value);
      } else {
        failures.push({ dept: d.key, errors: v.errors });
      }
    }
  }
  return { proposals, failures };
}

/**
 * Arbiter LLM call: LLM recommends arbitration verdicts, deterministic Verifier checks constraints.
 */
export async function arbitrateWithLLM(rawProposals, state, p, { mockHandler = null } = {}) {
  const props = withIds(rawProposals, state.week);
  const base = lookahead([], state, p);
  const isLLMOn = process.env.LLM_MODE === 'on' || mockHandler;

  if (!isLLMOn) {
    return null; // Signals to use deterministic fallback
  }

  const systemPrompt = `You are the Central Arbiter for an MSME. 
You must review the proposals from Sales, Procurement, Production, Collections, Treasury, and Compliance.
Resolve resource conflicts and cash constraints. For each proposal, determine:
- verdict: "approve", "modify", or "reject"
- modified_amount: integer amount if modified, else same as amount_inr (or 0 if rejected)
- reason: concise rationale for the decision.

Return STRICT JSON:
{
  "decisions": [
    {
      "proposal_id": "string (matching proposal id)",
      "verdict": "approve|modify|reject",
      "modified_amount": integer,
      "reason": "string"
    }
  ]
}`;

  const userPrompt = `Proposals: ${JSON.stringify(props.map(x => ({ id: x.id, agent: x.agent, action: x.action_type, amount: x.amount_inr, impact: x.cash_impact_inr, rationale: x.rationale })), null, 2)}
Books Summary: ${JSON.stringify(stateSummary(state, p), null, 2)}
Constraints: ${JSON.stringify(p.constraints, null, 2)}`;

  try {
    const res = await callLLM({ systemPrompt, userPrompt, schemaName: 'ArbiterDecisions', mockHandler });
    if (res && res.text) {
      const parsed = JSON.parse(res.text);
      if (Array.isArray(parsed.decisions)) {
        const decMap = new Map(parsed.decisions.map(d => [d.proposal_id, d]));
        const kept = [];
        const decisions = [];

        for (const pr of props) {
          const rec = decMap.get(pr.id) || { verdict: 'reject', reason: 'Unreviewed by arbiter' };
          const verdict = ['approve', 'modify', 'reject'].includes(rec.verdict) ? rec.verdict : 'reject';
          const approvedAmt = verdict === 'approved' || verdict === 'approve'
            ? pr.amount_inr
            : verdict === 'modify'
            ? Math.max(1000, Math.min(pr.amount_inr, Math.round(Number(rec.modified_amount) || pr.amount_inr)))
            : 0;

          if (approvedAmt > 0) {
            kept.push({ ...pr, amount_inr: approvedAmt });
          }

          const canon = canonicalImpact(pr, state, p, base);
          decisions.push({
            id: pr.id,
            week: state.week,
            agent: pr.agent,
            dept: deptOfAgent(pr.agent),
            action_type: pr.action_type,
            label: ACTIONS[pr.action_type].label,
            timing_week: pr.timing_week,
            confidence: pr.confidence,
            rationale: pr.rationale,
            amount_requested_inr: pr.amount_inr,
            amount_approved_inr: approvedAmt,
            claimed_cash_impact_inr: pr.cash_impact_inr,
            canonical_cash_impact_inr: Math.round(canon),
            claim_mismatch: Math.abs(pr.cash_impact_inr - canon) > 0.25 * pr.amount_inr,
            constraints_checked: [],
            standalone_violations: check([pr], state, p).map(v => v.constraint),
            outcome: verdict === 'approve' ? 'approved' : verdict === 'modify' ? 'modified' : 'rejected',
            blocked_by: [],
            reason: rec.reason || (verdict === 'approve' ? 'Approved by Arbiter LLM' : 'Rejected by Arbiter LLM'),
            source: res.model || 'llm:active',
          });
        }

        // Verifier guardrail: check if approved set breaks hard constraints
        const violations = check(kept, state, p);
        if (violations.length === 0) {
          return {
            executed: kept,
            decisions,
            conflicts: detectConflicts(props, state, p),
            violations_predicted: violations,
            source: res.model || 'llm:active'
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Arbiter LLM Warning]', err.message);
  }

  return null; // Fallback to deterministic Arbiter
}
