// The live numbers the office shows. The server owns the simulation; this module only holds the
// last snapshot it sent (GET /api/msme/state) and answers the questions the cards and the top bar ask.
import { DEPT_KEYS } from './data.js';
import { moneyShort } from './v1data.js';

const blank = () => ({ proposed: 0, accepted: 0, modified: 0, rejected: 0, violations: 0, cashImpact: 0 });
export const ledger = {
  snapshot: null, // { week, scenario, strategy, metrics:{cash,runway,dso,dpo,ccc}, depts:{key:{...}} }
  depts: Object.fromEntries(DEPT_KEYS.map(k => [k, blank()])),
};
export function setSnapshot(s) {
  ledger.snapshot = s;
  for (const k of DEPT_KEYS) ledger.depts[k] = { ...blank(), ...((s && s.depts && s.depts[k]) || {}) };
}
const d = k => ledger.depts[k];
// Rows on each department card: [label, getter]
export function deptRows(k) {
  if (k === 'arbiter') return [
    ['DECISIONS', () => d(k).proposed],
    ['MODIFIED', () => d(k).modified],
    ['VIOLATIONS CAUGHT', () => d(k).violations],
  ];
  return [
    ['PROPOSED', () => d(k).proposed],
    ['ACCEPTED', () => d(k).accepted + d(k).modified],
    ['REJECTED', () => d(k).rejected],
    ['VIOLATIONS CAUGHT', () => d(k).violations],
    ['CASH IMPACT', () => moneyShort(d(k).cashImpact)],
  ];
}
