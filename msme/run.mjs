#!/usr/bin/env node
// Experiment runner: N seeds x scenarios x strategies on the same simulator.
//
//   node msme/run.mjs --seeds 30                      all scenarios, all strategies, deterministic proposers
//   node msme/run.mjs --seeds 5 --scenarios baseline,demand_surge --strategies independent,constraint_aware
//   node msme/run.mjs --seeds 3 --llm --explain       real Claude proposals (+ explanations for the Arbiter)
//   node msme/run.mjs --seeds 30 --set objective.w_liquidity=1 --out results/sens-liquidity   a sensitivity run
//
// Writes results/results.csv (one row per episode) and results/results.json (rows, weekly traces,
// summary with 95% intervals, paired comparisons, run metadata). Every strategy sees the same world
// for a given (seed, scenario): the noise is drawn once per seed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PARAMS, loadParams } from './params.mjs';
import { SCENARIOS } from './sim.mjs';
import { STRATEGIES } from './strategies.mjs';
import { runEpisode } from './episode.mjs';
import { summarize, paired } from './stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runExperiment({ seeds = 30, firstSeed = 1, scenarios = SCENARIOS, strategies = STRATEGIES, weeks, mode = 'mock', llm = null, explain = false, p = loadParams(), onProgress = () => {} } = {}) {
  if (weeks) p = { ...p, sim: { ...p.sim, episode_weeks: weeks } };
  const rows = [], weekly = [];
  const total = seeds * scenarios.length * strategies.length; let done = 0;
  for (let k = 0; k < seeds; k++) for (const scenario of scenarios) for (const strategy of strategies) {
    const seed = firstSeed + k;
    const r = await runEpisode({ seed, scenario, strategy, p, mode, llm, explain });
    rows.push(r.row);
    for (const w of r.weekly) weekly.push({ seed, scenario, strategy, ...w });
    onProgress(++done, total, r.row);
  }
  return {
    meta: { created: new Date().toISOString(), mode, llm_backend: llm?.backend || null, llm_model: llm?.model || null, explain, seeds, first_seed: firstSeed, scenarios, strategies,
      episode_weeks: p.sim.episode_weeks, params_sha256: createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0, 16), params: p },
    rows, weekly, summary: summarize(rows),
    comparisons: Object.fromEntries(scenarios.map(sc => [sc, Object.fromEntries(strategies.filter(s => s !== 'constraint_aware').map(s => [s, paired(rows, sc, 'constraint_aware', s)]))])),
  };
}

export function toCsv(rows) {
  const cols = Object.keys(rows[0] || {});
  const esc = v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';
}

export function writeResults(result, dir = path.join(ROOT, 'results')) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(dir, 'results.csv'), toCsv(result.rows));
  return dir;
}

/** --set objective.w_liquidity=1 --set constraints.stress_largest_receivable_delay_weeks=3 : override a parameter for a sensitivity run. */
export function applyOverrides(p, sets) {
  const q = structuredClone(p);
  for (const kv of [].concat(sets || [])) {
    const m = /^([\w.]+)=(.+)$/.exec(kv); if (!m) throw new Error('--set expects path=value, got ' + kv);
    const keys = m[1].split('.'); let o = q;
    for (const k of keys.slice(0, -1)) { if (!(k in o)) throw new Error('unknown parameter: ' + m[1]); o = o[k]; }
    if (!(keys.at(-1) in o)) throw new Error('unknown parameter: ' + m[1]);
    o[keys.at(-1)] = isNaN(+m[2]) ? m[2] : +m[2];
  }
  return q;
}

function parseArgs(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) {
    const k = argv[i]; if (!k.startsWith('--')) continue;
    const key = k.slice(2), nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) a[key] = true;
    else { if (key === 'set') (a.set = a.set || []).push(nxt); else a[key] = nxt; i++; }
  } return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  const list = (v, all) => !v || v === 'all' ? all : String(v).split(',').map(s => s.trim());
  const scenarios = list(a.scenarios, SCENARIOS), strategies = list(a.strategies, STRATEGIES);
  for (const s of scenarios) if (!SCENARIOS.includes(s)) { console.error('unknown scenario: ' + s + ' (' + SCENARIOS.join(', ') + ')'); process.exit(2); }
  for (const s of strategies) if (!STRATEGIES.includes(s)) { console.error('unknown strategy: ' + s + ' (' + STRATEGIES.join(', ') + ')'); process.exit(2); }
  let llm = null;
  if (a.llm) { const { createLLM } = await import('./llm.mjs'); llm = await createLLM({ model: a.model || 'sonnet' }); console.log('LLM proposals via ' + llm.backend + ' (' + llm.model + ')'); }
  const t0 = Date.now();
  const result = await runExperiment({
    seeds: +a.seeds || 30, firstSeed: +a['first-seed'] || 1, scenarios, strategies, weeks: a.weeks ? +a.weeks : undefined,
    mode: a.llm ? 'llm' : 'mock', llm, explain: !!a.explain, p: applyOverrides(loadParams(), a.set),
    onProgress: (d, t) => { if (d % Math.max(1, Math.floor(t / 20)) === 0 || d === t) process.stdout.write(`\r${d}/${t} episodes`); },
  });
  const dir = writeResults(result, a.out ? path.resolve(a.out) : undefined);
  console.log(`\nwrote ${path.join(dir, 'results.csv')} and results.json (${result.rows.length} episodes, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const f = x => typeof x === 'number' ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-IN') : x.toFixed(2)) : x;
  console.log('\nscenario'.padEnd(26) + 'strategy'.padEnd(18) + 'viol.rate'.padStart(10) + 'min cash'.padStart(12) + 'stockouts'.padStart(11) + 'end cash'.padStart(13) + 'profit'.padStart(12));
  for (const s of result.summary) console.log(s.scenario.padEnd(26) + s.strategy.padEnd(18) + f(s.violation_rate.mean).padStart(10) + f(s.min_cash_inr.mean).padStart(12) + f(s.stockout_units.mean).padStart(11) + f(s.ending_cash_inr.mean).padStart(13) + f(s.profit_inr.mean).padStart(12));
}
