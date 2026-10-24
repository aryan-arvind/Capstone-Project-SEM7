// Structured proposals. Every proposal an agent makes is a JSON object with exactly these seven fields;
// this file decides whether it is acceptable. An invalid proposal is rejected before it reaches the Arbiter.

export const FIELDS = ['agent', 'action_type', 'amount_inr', 'timing_week', 'cash_impact_inr', 'confidence', 'rationale', 'source'];
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
  for (const k of FIELDS) if (!(k in o) && k !== 'source') errors.push(`missing field "${k}"`);
  if (!('source' in o)) o.source = 'rule-fallback';
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
