// MSME working-capital office — the build loop.
//   node check.mjs        config + build + offline page smoke + unit tests (no Claude calls)
// Every step prints ✓ or ✗ with the reason; the process exits 1 if anything failed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const results = [];
const ok = (name, detail = '') => { results.push(true); console.log(`✓ ${name}${detail ? '  — ' + detail : ''}`); };
const bad = (name, detail = '') => { results.push(false); console.log(`✗ ${name}${detail ? '  — ' + detail : ''}`); };
const step = async (name, fn) => { try { ok(name, (await fn()) || ''); return true; } catch (e) { bad(name, e.message); return false; } };
const sh = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === 'win32' }); let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', c => c === 0 ? resolve(out) : reject(new Error((err || out).trim().split('\n').slice(-4).join(' | '))));
  p.on('error', reject);
});

/* ---------- 1. the roster config ---------- */
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'msme', 'config', 'roster.json'), 'utf8'));
await step('roster: 7 departments, one agent + three desks each', async () => {
  if (roster.departments.length !== 7) throw new Error('departments: ' + roster.departments.length);
  const ids = new Set();
  for (const d of roster.departments) {
    if (d.desks.length !== 3) throw new Error(`${d.key} has ${d.desks.length} desks`);
    for (const s of [d.agent, ...d.desks]) { if (ids.has(s.id)) throw new Error('duplicate id ' + s.id); ids.add(s.id); }
  }
  return `${ids.size} seats`;
});
await step('roster: the 3D office and the engine read the same seats', async () => {
  const { AGENTS } = await import('./src/data.js');
  const { DEPARTMENTS } = await import('./msme/roster.mjs');
  const n = DEPARTMENTS.reduce((s, d) => s + 1 + d.desks.length, 0);
  if (AGENTS.length !== 28 || n !== 28) throw new Error(`office ${AGENTS.length}, engine ${n}`);
  return '28 seats';
});

/* ---------- 2. build ---------- */
await step('build: bundle', async () => {
  const out = await sh('node', ['build.mjs']);
  if (!fs.existsSync(path.join(ROOT, 'dist', 'command-centre-v2.html'))) throw new Error('no bundle');
  return out.trim().split('\n').pop();
});

/* ---------- 3. page smoke (Playwright) ---------- */
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = await import('playwright-core')); } catch {} }
if (!chromium) bad('smoke: playwright', 'not installed — npm i -D playwright-core');
else {
  let browser = null;
  try {
    const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
    const exe = process.env.CHROME_EXE; // optional: path to a Chrome/Chromium when Playwright's own build is missing
    try { browser = await chromium.launch({ args, executablePath: exe || undefined }); }
    catch { browser = await chromium.launch({ channel: 'chrome', args }); }
    const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(ROOT, 'dist', 'command-centre-v2.html')); await page.waitForTimeout(3000);
    await step('smoke: loads without page errors', async () => { if (errors.length) throw new Error(errors[0]); });
    await step('smoke: 28 seats at their desks', async () => { const n = await page.evaluate(() => Object.keys(window.CC.R).length); if (n !== 28) throw new Error('seats: ' + n); return n + ' seats'; });
    await step('smoke: seven department cards, none from the old office', async () => {
      const names = await page.$$eval('.badge .b-name', e => e.map(x => x.textContent.trim()));
      if (names.length !== 7) throw new Error('cards: ' + names.join(' | '));
      if (names.some(n => /EMAILS|MARKETING|DELIVERY|OPERATIONS|FINANCE|BRAIN/i.test(n.replace(/PRODUCTION \/ OPERATIONS/i, '')))) throw new Error('old name on a card: ' + names.join(' | '));
      return names.join(', ');
    });
  } catch (e) { bad('smoke: browser', e.message.split('\n')[0]); }
  finally { if (browser) await browser.close(); }
}

/* ---------- 4. the server and a full decision cycle over HTTP ---------- */
await step('server: a decision cycle over HTTP', async () => {
  const port = 4600 + Math.floor(Math.random() * 300);
  const srv = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    const base = `http://localhost:${port}`;
    for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
    const post = async (op, b = {}) => { const r = await fetch(`${base}/api/msme/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(op + ': ' + j.error); return j; };
    await post('reset', { seed: 3, strategy: 'constraint_aware', mode: 'mock' });
    const s = await post('cycle');
    if (s.week !== 1 || !s.tasks.length) throw new Error('cycle did not advance');
    if (!s.tasks.every(t => ['executed', 'rejected', 'blocked'].includes(t.state))) throw new Error('unresolved task states');
    const page = await (await fetch(base + '/')).text();
    if (!/MSME WORKING-CAPITAL ARBITER/.test(page)) throw new Error('page not served');
    return `week ${s.week}, ${s.tasks.length} proposals`;
  } finally { srv.kill(); }
});

/* ---------- 5. unit tests ---------- */
if (fs.existsSync(path.join(ROOT, 'test'))) await step('unit tests (node --test)', async () => (await sh('node', ['--test', 'test/*.test.mjs'])).split('\n').filter(l => /^# (pass|fail)/.test(l)).join(' · '));

const failed = results.filter(r => !r).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
