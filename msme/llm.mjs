// The one place the engine talks to Claude. Same two backends as the server: the Anthropic API when
// ANTHROPIC_API_KEY is set and @anthropic-ai/sdk is installed, otherwise the `claude` CLI on the
// owner's own login. No tools are allowed. Returns { text, usage:{input_tokens, output_tokens} }.
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { modelId, modelArgs } from '../src/models.js';

const CLI_CWD = path.join(os.tmpdir(), 'msme-arbiter-cli'); // an empty folder: no repo context for the model

/**
 * How to start Claude Code. On Windows a global npm install is a .cmd shim that spawn() cannot run
 * without a shell, so run its cli.js with node instead. CLAUDE_BIN overrides everything.
 */
export function claudeCommand() {
  if (process.env.CLAUDE_BIN) return { cmd: process.env.CLAUDE_BIN, prefix: [] };
  if (process.platform === 'win32' && process.env.APPDATA) {
    const cli = path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(cli)) return { cmd: process.execPath, prefix: [cli] };
  }
  return { cmd: 'claude', prefix: [] };
}

export async function createLLM({ model = 'sonnet', timeoutMs = 120000 } = {}) {
  let sdk = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try { const { default: Anthropic } = await import('@anthropic-ai/sdk'); sdk = new Anthropic(); } catch { /* fall back to the CLI */ }
  }
  const backend = sdk ? 'anthropic-sdk' : 'claude-cli';
  const ask = (system, user) => (sdk ? askSdk(sdk, model, system, user) : askCli(model, system, user, timeoutMs));
  return { ask, backend, model };
}

async function askSdk(sdk, model, system, user) {
  const res = await sdk.messages.create({ model: modelId(model), max_tokens: 1200, system, messages: [{ role: 'user', content: user }] });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request');
  return { text: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), usage: res.usage };
}

function askCli(model, system, user, timeoutMs) {
  fs.mkdirSync(CLI_CWD, { recursive: true });
  const args = ['-p', user, '--output-format', 'json', '--no-session-persistence', '--system-prompt', system,
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,Agent,NotebookEdit,Task,WebFetch,WebSearch', '--no-chrome', ...modelArgs(model, null)];
  const env = { ...process.env }; delete env.CLAUDECODE;
  return new Promise((resolve, reject) => {
    const { cmd, prefix } = claudeCommand();
    const p = spawn(cmd, [...prefix, ...args], { cwd: CLI_CWD, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`Claude took longer than ${timeoutMs / 1000} s`)); }, timeoutMs);
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? 'Claude Code is not installed (claude not found on PATH)' : e.message)); });
    p.on('close', code => {
      clearTimeout(timer);
      let j = null; try { j = JSON.parse(out); } catch { /* handled below */ }
      if (!j) return reject(new Error(`claude exited ${code}: ${(err || out).trim().slice(0, 300)}`));
      if (j.is_error) return reject(new Error(String(j.result || 'claude reported an error').slice(0, 300)));
      resolve({ text: String(j.result || '').trim(), usage: j.usage || {} });
    });
  });
}
