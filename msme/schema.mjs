// Structured proposals. A department agent answers with JSON only; this file decides whether the
// answer is acceptable. Malformed output is rejected and the agent is asked again, a bounded number
// of times (proposeWithRetry). Nothing here calls a model except through the `ask` it is handed.

export const FIELDS = ['agent', 'action_type', 'amount_inr', 'timing_week', 'cash_impact_inr', 'confidence', 'rationale'];
export const MAX_PER_AGENT = 3;
export const MAX_AMOUNT_INR = 20_000_000;

const isInt = x => typeof x === 'number' && Number.isInteger(x);

/**
 * Validate one proposal object.
 * ctx = { agentId, allowed: [action types], week, horizon }
 * Returns { ok, value, errors }; value has the agent id filled in canonically.
 */
export function validateProposal(o, ctx) {
  const errors = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['a proposal must be a JSON object'] };
  for (const k of Object.keys(o)) if (!FIELDS.includes(k)) errors.push(`unknown field "${k}"`);
  for (const k of FIELDS) if (!(k in o)) errors.push(`missing field "${k}"`);
  if (errors.length) return { ok: false, errors };
  if (o.agent !== ctx.agentId) errors.push(`agent must be "${ctx.agentId}"`);
  if (!ctx.allowed.includes(o.action_type)) errors.push(`action_type must be one of: ${ctx.allowed.join(', ')}`);
  if (!isInt(o.amount_inr) || o.amount_inr <= 0 || o.amount_inr > MAX_AMOUNT_INR) errors.push(`amount_inr must be a positive whole number of rupees up to ${MAX_AMOUNT_INR}`);
  if (!isInt(o.timing_week) || o.timing_week < ctx.week || o.timing_week > ctx.week + ctx.horizon - 1) errors.push(`timing_week must be a whole week from ${ctx.week} to ${ctx.week + ctx.horizon - 1}`);
  if (!isInt(o.cash_impact_inr)) errors.push('cash_impact_inr must be a whole number of rupees (negative = cash out)');
  else if (isInt(o.amount_inr) && Math.abs(o.cash_impact_inr) > o.amount_inr * 1.5) errors.push('cash_impact_inr cannot exceed 1.5 times amount_inr');
  if (typeof o.confidence !== 'number' || !(o.confidence >= 0 && o.confidence <= 1)) errors.push('confidence must be a number from 0 to 1');
  if (typeof o.rationale !== 'string' || !o.rationale.trim() || o.rationale.length > 400) errors.push('rationale must be a non-empty string of at most 400 characters');
  return errors.length ? { ok: false, errors } : { ok: true, value: { ...o, rationale: o.rationale.trim() }, errors: [] };
}

/** Pull the JSON out of a model reply (it may be wrapped in a code fence) and return a list of raw proposals. */
export function extractProposals(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? Infinity : i; }));
  if (!Number.isFinite(a)) throw new Error('no JSON found in the reply');
  const close = s[a] === '[' ? ']' : '}', b = s.lastIndexOf(close);
  if (b < a) throw new Error('the JSON is not closed');
  const j = JSON.parse(s.slice(a, b + 1));
  const list = Array.isArray(j) ? j : Array.isArray(j.proposals) ? j.proposals : [j];
  return list;
}

/** Validate a whole reply: every proposal must be valid and there must be 1..MAX_PER_AGENT of them. */
export function validateReply(text, ctx) {
  let list;
  try { list = extractProposals(text); } catch (e) { return { ok: false, errors: [e.message] }; }
  if (!list.length) return { ok: false, errors: ['the reply holds no proposals; propose between 1 and ' + MAX_PER_AGENT] };
  if (list.length > MAX_PER_AGENT) return { ok: false, errors: [`at most ${MAX_PER_AGENT} proposals per reply (got ${list.length})`] };
  const value = [], errors = [];
  list.forEach((o, i) => { const r = validateProposal(o, ctx); if (r.ok) value.push(r.value); else errors.push(...r.errors.map(e => `proposal ${i + 1}: ${e}`)); });
  return errors.length ? { ok: false, errors } : { ok: true, value, errors: [] };
}

/**
 * Ask until the reply validates, at most 1 + maxRetries times. The agent is told exactly what was
 * wrong. `ask(system, user)` -> { text, usage? }.  Returns { proposals, attempts, tokens (input+output), tokenDetail {in,out,cache}, errors }.
 * When every attempt fails, proposals is [] and errors lists the last problems; the caller counts it.
 */
export async function proposeWithRetry({ ask, system, user, ctx, maxRetries = 2 }) {
  const tk = { in: 0, out: 0, cache: 0 }; let last = [], prompt = user;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    let reply;
    try { reply = await ask(system, prompt); } catch (e) { last = [e.message]; continue; }
    const u = reply.usage || {};
    tk.in += u.input_tokens || 0; tk.out += u.output_tokens || 0; tk.cache += (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const v = validateReply(reply.text, ctx);
    if (v.ok) return { proposals: v.value, attempts: attempt, tokens: tk.in + tk.out, tokenDetail: tk, errors: [] };
    last = v.errors;
    prompt = `${user}\n\nYour previous reply was rejected:\n- ${v.errors.join('\n- ')}\nReply again with the JSON only.`;
  }
  return { proposals: [], attempts: maxRetries + 1, tokens: tk.in + tk.out, tokenDetail: tk, errors: last };
}
