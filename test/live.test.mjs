import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLedger, initStateFromLedger } from '../msme/live.mjs';
import { PARAMS } from '../msme/params.mjs';
import { createSession } from '../msme/session.mjs';
import path from 'node:path';
import { ROOT } from '../config.mjs';

const sampleLedger = {
  company_name: 'Test MSME',
  cash: 300000,
  od_limit: 400000,
  od_used: 50000,
  gst_payable: 25000,
  inventory: { units: 1200, unit_cost: 250 },
  ap: [
    { id: 'AP1', supplier: 'Vendor A', amount: 5000, issued: -2, due: 4, msme: true },
    { id: 'AP2', supplier: 'Vendor B', amount: 15000, issued: -1, due: 5, msme: false },
  ],
  ar: [
    { id: 'AR1', customer: 'Client X', amount: 30000, issued: -2, due: 2 },
    { id: 'AR2', customer: 'Client Y', amount: 45000, issued: -1, due: 3 },
  ],
  sim_overrides: {
    price: 400,
    unit_cost: 250,
  },
};

test('live: validateLedger accepts valid ledger', () => {
  assert.equal(validateLedger(sampleLedger), true);
});

test('live: validateLedger rejects negative cash with clear error', () => {
  assert.throws(
    () => validateLedger({ ...sampleLedger, cash: -500 }),
    /Invalid ledger cash balance: -500/
  );
});

test('live: validateLedger rejects invalid AP items', () => {
  assert.throws(
    () => validateLedger({ ...sampleLedger, ap: [{ id: 'X', amount: -100, issued: 0, due: 6 }] }),
    /Invalid AP item at index 0: amount must be positive/
  );
});

test('live: validateLedger rejects non-array AR', () => {
  assert.throws(
    () => validateLedger({ ...sampleLedger, ar: 'not-an-array' }),
    /Invalid ledger ar: must be an array of receivables/
  );
});

test('live: initStateFromLedger correctly populates books', () => {
  const st = initStateFromLedger(sampleLedger, 42, 'baseline', PARAMS);
  assert.equal(st.cash, 300000);
  assert.equal(st.od.limit, 400000);
  assert.equal(st.od.used, 50000);
  assert.equal(st.gstPayable, 25000);
  assert.equal(st.inv.units, 1200);
  assert.equal(st.ap.length, 2);
  assert.equal(st.ar.length, 2);
  assert.equal(st.ap[0].msme, true);
  assert.equal(st.ap[1].msme, false);
});

test('live: session supports live reset and restores base params on normal reset', async () => {
  const dataDir = path.join(ROOT, 'data');
  const session = createSession({ dataDir });

  // 1. Synthetic reset (default)
  const snap1 = session.reset({ seed: 1, live: false });
  assert.equal(snap1.mode, 'synthetic');

  // 2. Live reset (loads data/ledger.json)
  const snapLive = session.reset({ seed: 1, live: true });
  assert.equal(snapLive.mode, 'live');
  assert.equal(snapLive.metrics.cash, 450000);
  assert.equal(snapLive.books.inventory_units, 3530);
  assert.equal(snapLive.books.ar, 300000); // 95k + 140k + 65k
  assert.equal(snapLive.books.ap, 14675); // 1400 + 13275

  // Run a cycle on live state
  const snapCycle = await session.cycle();
  assert.equal(snapCycle.week, 1);
  assert.equal(snapCycle.mode, 'live');

  // 3. Normal reset restores base parameters and synthetic data
  const snapRestored = session.reset({ seed: 1, live: false });
  assert.equal(snapRestored.mode, 'synthetic');
  assert.notEqual(snapRestored.metrics.cash, 450000); // Back to base synthetic cash (1,600,000)
});