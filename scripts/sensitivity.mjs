#!/usr/bin/env node
// Sensitivity of the constraint-aware Arbiter to its own design choices.
//   node scripts/sensitivity.mjs [--seeds 30] [--out docs/sensitivity.md]
// Re-runs the Arbiter (only) over every scenario with each variant of config/params.json and prints a
// markdown table: how the violation rate, stock-outs and profit move when the pessimism margin or the
// liquidity weight change. Same seeds as the main experiment, so the rows are directly comparable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadParams } from '../msme/params.mjs';
import { runExperiment, applyOverrides } from '../msme/run.mjs';
import { SCENARIOS } from '../msme/sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const seeds = +arg('seeds', 30), out = path.resolve(ROOT, arg('out', 'docs/sensitivity.md'));

const VARIANTS = [
  ['default', []],
  ['stress margin 2 weeks', ['constraints.stress_largest_receivable_delay_weeks=2']],
  ['stress margin 4 weeks', ['constraints.stress_largest_receivable_delay_weeks=4']],
  ['liquidity weight 1.0', ['objective.w_liquidity=1']],
  ['liquidity weight 1.0 + target Rs 10 lakh', ['objective.w_liquidity=1', 'objective.liquidity_target=1000000']],
];
const rows = [];
for (const [name, sets] of VARIANTS) {
  const p = applyOverrides(loadParams(), sets);
  const r = await runExperiment({ seeds, scenarios: SCENARIOS, strategies: ['constraint_aware'], p });
  process.stderr.write(`done: ${name}\n`);
  rows.push([name, r.summary]);
}
const f = (s, d = 2) => `${s.mean.toFixed(d)} ± ${((s.ci95[1] - s.ci95[0]) / 2).toFixed(d)}`;
const inr = s => Math.round(s.mean).toLocaleString('en-IN');
let md = `# Sensitivity of the constraint-aware Arbiter (${seeds} seeds, rule-based agents)\n\nCells are mean ± half-width of the 95% interval. Violation rate is the share of weeks in which the real books breach a constraint.\n`;
for (const sc of SCENARIOS) {
  md += `\n## ${sc.replace(/_/g, ' ')}\n\n| Variant | Violation rate | Stock-out units | Operating profit (Rs) | Min cash (Rs) |\n|---|---|---|---|---|\n`;
  for (const [name, summary] of rows) { const s = summary.find(x => x.scenario === sc); md += `| ${name} | ${f(s.violation_rate)} | ${f(s.stockout_units, 0)} | ${inr(s.profit_inr)} | ${inr(s.min_cash_inr)} |\n`; }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(md);
