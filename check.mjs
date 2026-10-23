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
await step('roster: server loads the same seats', async () => {
  const { loadRoster } = await import('./roster.mjs');
  const r = loadRoster(); if (r.agents.length !== 28) throw new Error('agents: ' + r.agents.length);
  if (r.problems.length) throw new Error(r.problems[0]);
  return '28 agents';
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

/* ---------- 4. unit tests ---------- */
if (fs.existsSync(path.join(ROOT, 'test'))) await step('unit tests (node --test)', async () => (await sh('node', ['--test', 'test/'])).split('\n').filter(l => /^# (pass|fail)/.test(l)).join(' · '));

const failed = results.filter(r => !r).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
