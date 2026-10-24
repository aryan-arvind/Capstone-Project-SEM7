// msme/live.mjs
// Live state initialization from data/ledger.json.
// Maps real AP, AR, inventory, and business profile parameters into the simulation state.

import { stream } from './rng.mjs';
import { makeEvents } from './sim.mjs';

/**
 * Validates the ledger data structure. Throws descriptive error if invalid.
 */
export function validateLedger(ledger) {
  if (!ledger || typeof ledger !== 'object') {
    throw new Error('Ledger data must be a valid non-empty JSON object');
  }
  if (typeof ledger.cash !== 'number' || ledger.cash < 0 || !Number.isFinite(ledger.cash)) {
    throw new Error(`Invalid ledger cash balance: ${ledger.cash}. Must be a non-negative finite number.`);
  }
  if (typeof ledger.od_limit !== 'number' || ledger.od_limit < 0) {
    throw new Error(`Invalid ledger od_limit: ${ledger.od_limit}. Must be non-negative.`);
  }
  if (typeof ledger.od_used !== 'number' || ledger.od_used < 0) {
    throw new Error(`Invalid ledger od_used: ${ledger.od_used}. Must be non-negative.`);
  }
  if (!ledger.inventory || typeof ledger.inventory.units !== 'number' || ledger.inventory.units < 0) {
    throw new Error('Invalid ledger inventory: units must be a non-negative number.');
  }
  if (!Array.isArray(ledger.ap)) {
    throw new Error('Invalid ledger ap: must be an array of payables.');
  }
  for (let i = 0; i < ledger.ap.length; i++) {
    const item = ledger.ap[i];
    if (typeof item.amount !== 'number' || item.amount <= 0) {
      throw new Error(`Invalid AP item at index ${i}: amount must be positive (got ${item.amount}).`);
    }
    if (typeof item.issued !== 'number' || typeof item.due !== 'number') {
      throw new Error(`Invalid AP item at index ${i}: issued and due week must be numbers.`);
    }
  }
  if (!Array.isArray(ledger.ar)) {
    throw new Error('Invalid ledger ar: must be an array of receivables.');
  }
  for (let i = 0; i < ledger.ar.length; i++) {
    const item = ledger.ar[i];
    if (typeof item.amount !== 'number' || item.amount <= 0) {
      throw new Error(`Invalid AR item at index ${i}: amount must be positive (got ${item.amount}).`);
    }
    if (typeof item.issued !== 'number' || typeof item.due !== 'number') {
      throw new Error(`Invalid AR item at index ${i}: issued and due week must be numbers.`);
    }
  }
  return true;
}

/**
 * Initializes simulation state from real ledger data.
 */
export function initStateFromLedger(ledger, seed, scenario = 'baseline', p) {
  validateLedger(ledger);
  const s = p.sim, r = stream(seed);
  const rows = s.episode_weeks + p.sim.horizon_weeks + 4;
  const noise = Array.from({ length: rows }, () => ({ demand: r.normal(), lag: r(), msme: r(), breakdown: r() }));

  let seq = 0;
  const lags = p.sim.customer_extra_lag_weeks;
  const meanLag = Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);

  // Map AR
  const ar = ledger.ar.map(item => {
    seq++;
    const noiseVal = r();
    const lag = lags[Math.min(lags.length - 1, Math.floor(noiseVal * lags.length))];
    return {
      id: item.id || `AR${seq}`,
      customer: item.customer || 'Customer',
      amount: Math.round(item.amount),
      issued: item.issued,
      due: item.due,
      pay: item.due + lag,
      exp: item.due + meanLag,
    };
  });

  // Map AP
  const ap = ledger.ap.map(item => {
    seq++;
    return {
      id: item.id || `AP${seq}`,
      supplier: item.supplier || 'Vendor',
      amount: Math.round(item.amount),
      issued: item.issued,
      due: item.due,
      msme: Boolean(item.msme),
    };
  });

  const st = {
    seed,
    scenario,
    week: 0,
    seq: Math.max(seq, 100),
    cash: Math.round(ledger.cash),
    ar,
    ap,
    inv: {
      units: Math.round(ledger.inventory.units),
      incoming: [],
    },
    od: {
      limit: Math.round(ledger.od_limit),
      used: Math.round(ledger.od_used),
    },
    gstPayable: Math.round(ledger.gst_payable || 0),
    maint: { last: 0 },
    demandMult: 1,
    costMult: 1,
    demandUntil: -1,
    costUntil: -1,
    pending: [],
    events: makeEvents(scenario, p),
    noise,
    stats: { revenue: 0, cogs: 0, profit: 0, stockoutUnits: 0, stockoutWeeks: 0, interest: 0, penalties: 0, discounts: 0, factoringFees: 0, maintenance: 0, payroll: 0, fixed: 0 },
    history: { revenue: [], cogs: [] },
  };

  return st;
}
