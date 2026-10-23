// MSME working-capital office — roster + design tokens.
// Every department, agent and desk comes from ONE file: msme/config/roster.json. Nothing here is
// hand-listed; change the config and the 3D office, the server roster and the engine all follow.
import ROSTER from '../msme/config/roster.json' with { type: 'json' };

// Nominal.so tokens (locked design language, 30 Jul 2026)
export const TOKENS = {
  cream: '#FDFFF8',
  ink: '#151414',
  grey: '#5A5A5A',
  hairline: 'rgba(21,20,20,0.12)',
};

export { ROSTER };
export const CURRENCY = ROSTER.currency;
export const COMPANY = ROSTER.company;

// The Arbiter sits at the centre; the six decision departments ring it.
export const CENTRE_KEY = 'arbiter';
export const DEPT_KEYS = ROSTER.departments.map(d => d.key);
export const DECISION_KEYS = DEPT_KEYS.filter(k => k !== CENTRE_KEY);

export const DEPTS = Object.fromEntries(ROSTER.departments.map(d => [d.key, {
  name: d.name, short: d.name.split(' / ')[0], chip: d.colour.chip, ink: d.colour.ink, floor: d.colour.floor, priority: d.priority,
}]));

// desk grid: the department agent at the head, three desks beneath it
const GRID = [[0.5, 0], [0, 1], [1, 1], [0.5, 2]];
// people are drawn from fixed palettes (looks only)
const HAIR = ['#2b2b2b', '#3b2b1d', '#111111', '#7a3b12', '#4a2a10', '#1c1c2e', '#26140a', '#2a1a0e'];
const SKIN = ['#E8B98E', '#F0C9A0', '#C68B59', '#F5D5B0', '#D89F70', '#E0A878', '#B07850', '#9C6B43'];

export const AGENTS = [];
let n = 0;
for (const d of ROSTER.departments) {
  const seats = [{ ...d.agent, lead: true }, ...d.desks.map(x => ({ ...x, lead: false }))];
  seats.forEach((s, i) => {
    AGENTS.push({ id: s.id, name: s.name, dept: d.key, lead: s.lead, grid: GRID[i], hair: HAIR[n % HAIR.length], skin: SKIN[(n * 3) % SKIN.length], role: s.role, does: s.does, actions: s.actions || [] });
    n++;
  });
}

// Plinth placement in world XZ.
export const LAYOUT = Object.fromEntries(ROSTER.departments.map(d => [d.key, { pos: d.slot.pos, w: d.slot.w, d: d.slot.d }]));

// Department billboard rows are filled from the engine's live ledger (src/ledger.js); these are
// only the labels so the badge exists before the first cycle runs.
export const BILLBOARDS = Object.fromEntries(DEPT_KEYS.map(k => [k, []]));
export const APPROVAL_ASKS = Object.fromEntries(DEPT_KEYS.map(k => [k, []]));
export const APPROVAL_BY_AGENT = {};

// Terminal lines on the desk screens: waiting text until a cycle has run.
export const WORKLINES = Object.fromEntries(DEPT_KEYS.map(k => [k, ['▸ waiting for the next decision cycle']]));
