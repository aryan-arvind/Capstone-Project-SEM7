import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../msme/session.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'msme-session-'));

test('a cycle runs in three phases and the task statuses follow them', async () => {
  const s = createSession({ dataDir: tmp() });
  let x = await s.propose();
  assert.equal(x.phase, 'proposed');
  assert.ok(x.tasks.length > 0 && x.tasks.every(t => t.state === 'proposed'));
  x = await s.arbitrate();
  assert.equal(x.phase, 'arbitrated');
  assert.ok(x.tasks.every(t => ['approved', 'modified', 'rejected', 'blocked'].includes(t.state) && t.reason));
  const week = x.week;
  x = await s.execute();
  assert.equal(x.week, week + 1); assert.equal(x.phase, 'idle');
  assert.ok(x.tasks.some(t => t.state === 'executed') || x.tasks.every(t => t.outcome === 'rejected'));
});

test('phases cannot be run out of order', async () => {
  const s = createSession({ dataDir: tmp() });
  await assert.rejects(() => s.arbitrate(), /propose first/);
  await assert.rejects(() => s.execute(), /arbitrate first/);
  await s.propose();
  await assert.rejects(() => s.propose(), /already under way/);
});

test('department counters add up and every decision reaches the audit log', async () => {
  const dir = tmp(), s = createSession({ dataDir: dir });
  const x = await s.cycle();
  const total = Object.entries(x.depts).filter(([k]) => k !== 'arbiter').reduce((n, [, d]) => n + d.proposed, 0);
  assert.equal(total, x.tasks.length);
  for (const [k, d] of Object.entries(x.depts)) if (k !== 'arbiter') assert.equal(d.accepted + d.modified + d.rejected, d.proposed, k);
  const lines = fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, x.tasks.length);
  for (const l of lines) for (const k of ['ts', 'strategy', 'week', 'id', 'outcome', 'reason', 'constraints_checked']) assert.ok(k in l, k);
  assert.equal(s.readAudit(100).length, lines.length);
});

test('the top-bar numbers are present and finite', async () => {
  const x = await createSession({ dataDir: tmp() }).cycle();
  for (const k of ['cash', 'runway', 'dso', 'dpo', 'ccc']) assert.ok(Number.isFinite(x.metrics[k]), k);
});

test('reset with a seed is reproducible; scenario injection takes effect', async () => {
  const run = async () => { const s = createSession({ dataDir: tmp() }); s.reset({ seed: 9, scenario: 'baseline', strategy: 'independent' }); for (let i = 0; i < 4; i++) await s.cycle(); return s.snapshot().metrics.cash; };
  assert.equal(await run(), await run());
  const s = createSession({ dataDir: tmp() }); s.reset({ seed: 9, strategy: 'independent' });
  s.inject('credit_limit_tightened'); await s.cycle();
  assert.equal(s.snapshot().books.od_limit, 1_250_000);
  assert.throws(() => s.inject('baseline'));
});

test('an experiment job reports progress and a summary', async () => {
  const dir = tmp(), s = createSession({ dataDir: path.join(dir, 'data') });
  const { id } = s.startExperiment({ seeds: 2, scenarios: ['baseline'], weeks: 4 });
  for (let i = 0; i < 200 && s.job(id).state === 'running'; i++) await new Promise(r => setTimeout(r, 25));
  const j = s.job(id);
  assert.equal(j.state, 'done'); assert.equal(j.done, 6); assert.equal(j.summary.summary.length, 3);
  assert.ok(fs.existsSync(path.join(dir, 'results', 'results.csv')));
  assert.ok(s.latestResults().summary.length === 3);
});
