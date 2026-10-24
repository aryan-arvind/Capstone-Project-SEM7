import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../config.mjs';
import { createSession } from '../msme/session.mjs';
import { getLLMStatus } from '../msme/llm.mjs';
import { DEPARTMENTS } from '../msme/roster.mjs';

const cfg = loadConfig();
const DATA = process.env.VERCEL ? '/tmp/data' : path.join(ROOT, 'data');
const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const session = createSession({ dataDir: DATA, live: cfg.live });

const sendJson = (res, code, body) => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(code).json(body);
  }
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = req => new Promise((resolve) => {
  if (req.body && typeof req.body === 'object') return resolve(req.body);
  if (typeof req.body === 'string') {
    try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
  }
  let s = '';
  req.on('data', d => { s += d; });
  req.on('end', () => {
    try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); }
  });
});

export default async function handler(req, res) {
  // Determine route segments from req.query.slug or req.url
  let segments = [];
  if (req.query && req.query.slug) {
    segments = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
  } else {
    const rawPath = (req.url || '').split('?')[0].replace(/^\/api\//, '/').replace(/^\//, '');
    segments = rawPath.split('/').filter(Boolean);
  }

  const first = segments[0] || '';

  if (first === 'health') {
    return sendJson(res, 200, { ok: true, version, name: cfg.name, departments: DEPARTMENTS.map(d => d.key) });
  }

  if (first === 'msme') {
    const op = segments.slice(1).join('/');
    const url = new URL(req.url, 'http://localhost');
    try {
            if (op === 'llm-status' && req.method === 'GET') return sendJson(res, 200, getLLMStatus());
      if (op === 'state' && req.method === 'GET') return sendJson(res, 200, session.snapshot());
      if (op === 'audit' && req.method === 'GET') {
        const limit = Math.min(+url.searchParams.get('limit') || 200, 2000);
        return sendJson(res, 200, { records: session.readAudit(limit) });
      }
      if (op === 'results' && req.method === 'GET') return sendJson(res, 200, session.latestResults() || { none: true });
      if ((op === 'export/csv' || op === 'export/json') && req.method === 'GET') {
        const f = path.join(ROOT, 'results', op === 'export/csv' ? 'results.csv' : 'results.json');
        if (!fs.existsSync(f)) return sendJson(res, 404, { error: 'no results yet: run an experiment first' });
        res.setHeader('content-type', op === 'export/csv' ? 'text/csv' : 'application/json');
        res.setHeader('content-disposition', 'attachment; filename=' + path.basename(f));
        return res.end(fs.readFileSync(f));
      }
      const ex = op.match(/^experiments\/([^/]+)$/);
      if (ex && req.method === 'GET') {
        const j = session.job(ex[1]);
        return j ? sendJson(res, 200, j) : sendJson(res, 404, { error: 'unknown experiment' });
      }
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST' });
      const b = await readBody(req);
      if (op === 'chat') return sendJson(res, 200, await session.chat(b));
      if (op === 'client-action') return sendJson(res, 200, session.executeClientAction(b));
      if (op === 'reset') return sendJson(res, 200, session.reset(b));
      if (op === 'propose') return sendJson(res, 200, await session.propose());
      if (op === 'arbitrate') return sendJson(res, 200, await session.arbitrate());
      if (op === 'execute') return sendJson(res, 200, await session.execute());
      if (op === 'cycle') return sendJson(res, 200, await session.cycle());
      if (op === 'inject') return sendJson(res, 200, session.inject(b.type));
      if (op === 'experiments') return sendJson(res, 200, session.startExperiment(b));
      if (op === 'ledger/save') return sendJson(res, 200, session.saveLedger(b));
            if (op === 'digitize/parse' || op === 'digitize/commit') {
        return sendJson(res, 200, { success: false, error: 'Document Digitizer OCR runs locally via child_process Python engine (not supported on serverless cloud).' });
      }
      if (op === 'decision/override') return sendJson(res, 200, session.overrideDecision(b));
      return sendJson(res, 404, { error: 'unknown msme endpoint: ' + op });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'not found', segments });
}