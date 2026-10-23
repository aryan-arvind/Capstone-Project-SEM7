// Summary statistics for the experiment: per (scenario, strategy) means with 95% intervals, and
// paired comparisons of the constraint-aware Arbiter against each baseline on the same seeds.

export const METRICS = [
  ['violation_rate', 'Constraint-violation rate (share of weeks)'],
  ['min_cash_inr', 'Minimum cash (Rs)'],
  ['stockout_units', 'Stock-out units'],
  ['ccc_days', 'Cash conversion cycle (days)'],
  ['ending_cash_inr', 'Ending cash (Rs)'],
  ['ending_net_worth_inr', 'Ending net worth (Rs)'],
  ['profit_inr', 'Operating profit (Rs)'],
];

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = xs => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
// two-sided 95% t critical values; beyond 30 degrees of freedom the normal 1.96 is used
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const t95 = df => df <= 0 ? NaN : df <= 30 ? T95[df] : 1.96;

export function describe(xs) {
  const n = xs.length, m = mean(xs), s = sd(xs), half = n > 1 ? t95(n - 1) * s / Math.sqrt(n) : 0;
  return { n, mean: m, sd: s, ci95: [m - half, m + half] };
}

/** rows: the per-episode rows. Returns [{scenario, strategy, n, metric: {mean, sd, ci95}}...]. */
export function summarize(rows) {
  const keys = [...new Set(rows.map(r => r.scenario + '|' + r.strategy))];
  return keys.map(k => {
    const [scenario, strategy] = k.split('|'), rs = rows.filter(r => r.scenario === scenario && r.strategy === strategy);
    return { scenario, strategy, n: rs.length, ...Object.fromEntries(METRICS.map(([m]) => [m, describe(rs.map(r => r[m]))])) };
  });
}

/** Paired differences (a - b) on shared seeds. A negative difference in a "lower is better" metric favours a. */
export function paired(rows, scenario, a, b) {
  const A = rows.filter(r => r.scenario === scenario && r.strategy === a), B = rows.filter(r => r.scenario === scenario && r.strategy === b);
  const bySeed = new Map(B.map(r => [r.seed, r]));
  const pairs = A.filter(r => bySeed.has(r.seed)).map(r => [r, bySeed.get(r.seed)]);
  return Object.fromEntries(METRICS.map(([m]) => {
    const d = pairs.map(([x, y]) => x[m] - y[m]), s = describe(d);
    return [m, { ...s, wins_a: d.filter(x => x < 0).length, ties: d.filter(x => x === 0).length, pairs: d.length }];
  }));
}
