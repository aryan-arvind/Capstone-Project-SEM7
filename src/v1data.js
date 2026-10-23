// Per-seat presentation data for the MSME office. Everything is derived from the roster config
// (src/data.js); the figures shown on screen come from the engine's ledger (src/ledger.js), never
// from here.
import { AGENTS, DEPTS } from './data.js';

export const clockStr = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const rnd = a => a[Math.floor(Math.random() * a.length)];
export const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const person = () => 'the owner';
/** Indian rupees with lakh/crore grouping: 1234567 -> ₹12,34,567 */
export const money = n => (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');
/** Short form for tight spaces: ₹12.3 L, ₹1.2 Cr */
export const moneyShort = n => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
};

export const P = {};          // (no fictional world: the simulator owns the data)
export const STATS = {};      // (billboard numbers come from the ledger)
export const KPIS = [];
export const FILE_GEN = {};   // (documents are built from real proposals, see main.js mockupFor)

export const V1 = AGENTS.map(a => {
  const dept = DEPTS[a.dept];
  return {
    id: a.id, name: a.name, dept: a.dept, role: a.role, tagline: a.does,
    tasks: [], ev: [], stats: [], chart: [], chartLbl: '',
    greeting: a.lead
      ? `${a.does} Run a decision cycle and I will show you what I proposed and what the Arbiter did with it.`
      : `${a.does} I am a desk inside ${dept.short}: I help my department agent and make no model call of my own.`,
    chat: [],
    fallback: [a.does],
    chips: a.lead ? ['What did you propose?', 'Why was it rejected?', 'What are you worried about?'] : ['What do you watch?'],
  };
});
