// MSME working-capital arbiter: the server.
//   npm start  ->  http://localhost:4520
// Serves the 3D office (dist/command-centre-v2.html) and the engine API under /api/msme (see
// msme/session.mjs). Nothing here makes a financial decision: the engine does, in plain code.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, ROOT } from './config.mjs';
import { createSession } from './msme/session.mjs';
import { DEPARTMENTS } from './msme/roster.mjs';

const cfg = loadConfig();
const DATA = path.join(ROOT, 'data');
const HTML = path.join(ROOT, 'dist', 'command-centre-v2.html');
const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const session = createSession({ dataDir: DATA, live: cfg.live });

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/command-centre-v2.html' || url.pathname === '/dark')) {
      if (!fs.existsSync(HTML)) { res.writeHead(503, { 'content-type': 'text/plain' }); return res.end('The page is not built yet: run  node build.mjs'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      const page = fs.readFileSync(HTML, 'utf8');
      return res.end(url.pathname === '/dark' ? page.replace('<body>', '<body class="dark">') : page);
    }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version, name: cfg.name, departments: DEPARTMENTS.map(d => d.key) });
    if (!url.pathname.startsWith('/api/msme/')) { res.writeHead(404); return res.end('not found'); }

    const op = url.pathname.slice('/api/msme/'.length);
    try {
      if (op === 'state' && req.method === 'GET') return json(res, 200, session.snapshot());
      if (op === 'audit' && req.method === 'GET') return json(res, 200, { records: session.readAudit(Math.min(+url.searchParams.get('limit') || 200, 2000)) });
      if (op === 'results' && req.method === 'GET') return json(res, 200, session.latestResults() || { none: true });
      if ((op === 'export/csv' || op === 'export/json') && req.method === 'GET') {
        const f = path.join(ROOT, 'results', op === 'export/csv' ? 'results.csv' : 'results.json');
        if (!fs.existsSync(f)) return json(res, 404, { error: 'no results yet: run an experiment first' });
        res.writeHead(200, { 'content-type': op === 'export/csv' ? 'text/csv' : 'application/json', 'content-disposition': 'attachment; filename=' + path.basename(f) });
        return res.end(fs.readFileSync(f));
      }
      const ex = url.pathname.match(/^\/api\/msme\/experiments\/([^/]+)$/);
      if (ex && req.method === 'GET') { const j = session.job(ex[1]); return j ? json(res, 200, j) : json(res, 404, { error: 'unknown experiment' }); }
      if (req.method !== 'POST') return json(res, 405, { error: 'POST' });
      const b = await readBody(req);
      if (op === 'reset') return json(res, 200, session.reset(b));
      if (op === 'propose') return json(res, 200, await session.propose());
      if (op === 'arbitrate') return json(res, 200, await session.arbitrate());
      if (op === 'execute') return json(res, 200, await session.execute());
      if (op === 'cycle') return json(res, 200, await session.cycle());
      if (op === 'inject') return json(res, 200, session.inject(b.type));
      if (op === 'experiments') return json(res, 200, session.startExperiment(b));
      if (op === 'ledger/save') return json(res, 200, session.saveLedger(b));
      if (op === 'decision/override') return json(res, 200, session.overrideDecision(b));
      if (op === 'digitize/parse') {
        const uploadsDir = path.join(DATA, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const filename = b.filename || 'uploaded_doc.txt';
        const filePath = path.join(uploadsDir, filename);
        if (b.contentBase64) {
          fs.writeFileSync(filePath, Buffer.from(b.contentBase64, 'base64'));
        } else {
          fs.writeFileSync(filePath, b.content || '', 'utf8');
        }
        const result = await new Promise((resolve, reject) => {
          const py = spawn('python', ['ingestion/digitize_cli.py', 'parse', '--file', filePath], { cwd: ROOT });
          let stdout = '';
          let stderr = '';
          py.stdout.on('data', d => { stdout += d.toString(); });
          py.stderr.on('data', d => { stderr += d.toString(); });
          py.on('close', code => {
            try {
              resolve(JSON.parse(stdout));
            } catch (err) {
              if (code !== 0) reject(new Error(stderr || `Python digitizer failed with code ${code}`));
              else resolve({ success: false, raw: stdout, error: stderr });
            }
          });
          py.on('error', err => reject(err));
        });
        return json(res, 200, result);
      }
      if (op === 'digitize/commit') {
        const uploadsDir = path.join(DATA, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const payloadPath = path.join(uploadsDir, 'commit_payload.json');
        fs.writeFileSync(payloadPath, JSON.stringify(b, null, 2), 'utf8');
        const result = await new Promise((resolve, reject) => {
          const py = spawn('python', ['ingestion/digitize_cli.py', 'commit', '--file', payloadPath], { cwd: ROOT });
          let stdout = '';
          let stderr = '';
          py.stdout.on('data', d => { stdout += d.toString(); });
          py.stderr.on('data', d => { stderr += d.toString(); });
          py.on('close', code => {
            try {
              resolve(JSON.parse(stdout));
            } catch (err) {
              if (code !== 0) reject(new Error(stderr || `Python commit failed with code ${code}`));
              else resolve({ success: false, raw: stdout, error: stderr });
            }
          });
          py.on('error', err => reject(err));
        });
        session.reset({ live: true });
        result.live_ledger = session.getLedger ? session.getLedger() : null;
        return json(res, 200, result);
      }

      return json(res, 404, { error: 'unknown msme endpoint' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  } catch (e) { json(res, 500, { error: e.message }); }
});

server.listen(cfg.port, () => {
  console.log(`MSME working-capital arbiter ${version} → http://localhost:${cfg.port}`);
  console.log(`  company: ${cfg.name}   departments: ${DEPARTMENTS.length}   audit log: ${path.join(DATA, 'audit.jsonl')}`);
});
