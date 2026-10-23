// MSME working-capital arbiter: the server.
//   npm start  ->  http://localhost:4520
// Serves the 3D office (dist/command-centre-v2.html) and the engine API under /api/msme (see
// msme/session.mjs). Nothing here makes a financial decision: the engine does, in plain code.
// Real model calls (agents written by Claude, the Arbiter's explanations) go through msme/llm.mjs,
// on your own Claude Code login or ANTHROPIC_API_KEY; the default agents are rule-based and free.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from './config.mjs';
import { createLLM } from './msme/llm.mjs';
import { createSession } from './msme/session.mjs';
import { DEPARTMENTS } from './msme/roster.mjs';

const cfg = loadConfig();
const DATA = path.join(ROOT, 'data');
const HTML = path.join(ROOT, 'dist', 'command-centre-v2.html');
const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const session = createSession({ dataDir: DATA, llmFactory: () => createLLM({ model: cfg.model }) });

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
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
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version, name: cfg.name, model: cfg.model, backend: process.env.ANTHROPIC_API_KEY ? 'anthropic-sdk' : 'claude-cli', departments: DEPARTMENTS.map(d => d.key) });
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
      return json(res, 404, { error: 'unknown msme endpoint' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  } catch (e) { json(res, 500, { error: e.message }); }
});

server.listen(cfg.port, () => {
  console.log(`MSME working-capital arbiter ${version} → http://localhost:${cfg.port}`);
  console.log(`  company: ${cfg.name}   departments: ${DEPARTMENTS.length}   audit log: ${path.join(DATA, 'audit.jsonl')}`);
  console.log(`  model for Claude agents: ${cfg.model} (${process.env.ANTHROPIC_API_KEY ? 'Anthropic API' : 'your Claude Code login'}); default agents are rule-based and free`);
});
