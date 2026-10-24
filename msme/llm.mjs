// Provider adapter for Real LLM agents with fallback.
// Priority: Groq (Llama 3.3 70B) -> Gemini (gemini-2.5-flash) -> Rule-based fallback.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.mjs';

// Simple dotenv-style loader
export function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}
loadEnv();

const CACHE_FILE = path.join(ROOT, 'data', 'llm_cache.json');
let cacheMap = null;

function loadCache() {
  if (cacheMap) return cacheMap;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cacheMap = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } else {
      cacheMap = {};
    }
  } catch { cacheMap = {}; }
  return cacheMap;
}

function saveCache() {
  if (!cacheMap) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheMap, null, 2), 'utf8');
  } catch {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options, maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      const signal = AbortSignal.timeout(15000);
      const res = await fetch(url, { ...options, signal });
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        attempt++;
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (attempt < maxRetries && (err.name === 'TimeoutError' || err.message?.includes('network'))) {
        attempt++;
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Call Groq (OpenAI-compatible) -> Gemini -> null
 */
export async function callLLM({ systemPrompt, userPrompt, schemaName, mockHandler }) {
  if (mockHandler) {
    return mockHandler({ systemPrompt, userPrompt });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // 1. Try Groq (Llama 3.3 70B)
  if (groqKey) {
    try {
      const body = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt + '\nRespond with valid JSON only.' },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      };
      const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        return { text: content, model: 'llm:llama-3.3-70b' };
      }
    } catch (e) {
      console.warn('[LLM Groq Warning]', e.message);
    }
  }

  // 2. Try Gemini (gemini-2.5-flash / gemini-1.5-flash via generateContent)
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}\n\nRespond STRICTLY with JSON matching schema: ${schemaName}` }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      };
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text, model: 'llm:gemini-2.5-flash' };
      }
    } catch (e) {
      console.warn('[LLM Gemini Warning]', e.message);
    }
  }

  return null;
}

export function getCachedResponse(scenario, week, key) {
  const cache = loadCache();
  const cKey = `${scenario || 'baseline'}:w${week}:${key}`;
  return cache[cKey] || null;
}

export function setCachedResponse(scenario, week, key, value) {
  const cache = loadCache();
  const cKey = `${scenario || 'baseline'}:w${week}:${key}`;
  cache[cKey] = value;
  saveCache();
}
