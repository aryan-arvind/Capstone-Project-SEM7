import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeDepartmentLLM, arbitrateWithLLM } from '../msme/llm_agents.mjs';
import { initState } from '../msme/sim.mjs';
import { PARAMS } from '../msme/params.mjs';
import { createSession } from '../msme/session.mjs';
import path from 'node:path';
import { ROOT } from '../config.mjs';

test('llm: department agent handles valid JSON from mocked LLM', async () => {
  const st = initState(1, 'baseline', PARAMS);
  const mockHandler = ({ systemPrompt }) => {
    return {
      text: JSON.stringify({
        proposals: [
          {
            action_type: 'accept_bulk_order',
            amount_inr: 80000,
            target: 'distributor_north',
            week: 0,
            reasoning: 'Profitable bulk volume available.',
            confidence: 0.88,
          }
        ]
      }),
      model: 'llm:mock-llama-3.3'
    };
  };

  const props = await proposeDepartmentLLM('sales', st, PARAMS, { mockHandler });
  assert.equal(props.length, 1);
  assert.equal(props[0].action_type, 'accept_bulk_order');
  assert.equal(props[0].amount_inr, 80000);
  assert.equal(props[0].source, 'llm:mock-llama-3.3');
  assert.equal(props[0].confidence, 0.88);
});

test('llm: department agent safely falls back to rules on invalid JSON after retry', async () => {
  const st = initState(1, 'baseline', PARAMS);
  let calls = 0;
  const mockHandler = () => {
    calls++;
    return {
      text: 'INVALID_NON_JSON_MALFORMED_OUTPUT',
      model: 'llm:broken'
    };
  };

  const props = await proposeDepartmentLLM('sales', st, PARAMS, { mockHandler, seed: 1 });
  assert.ok(calls >= 2, 'Should attempt retry on malformed JSON');
  assert.ok(props.length > 0, 'Should fall back to rule-based proposals');
  assert.equal(props[0].source, 'rule-fallback');
});

test('llm: full decision cycle with mocked LLM carries source tags into snapshot', async () => {
  const session = createSession({ dataDir: path.join(ROOT, 'data') });
  session.reset({ seed: 1, live: false });

  const mockLLMHandler = ({ systemPrompt }) => {
    if (systemPrompt.includes('Arbiter')) {
      return {
        text: JSON.stringify({
          decisions: [
            { proposal_id: 'w0-sales_agent-1', verdict: 'approve', modified_amount: 0, reason: 'High margin order' }
          ]
        }),
        model: 'llm:mock-arbiter'
      };
    }
    return {
      text: JSON.stringify({
        proposals: [
          { action_type: 'accept_bulk_order', amount_inr: 40000, target: 'client', week: 0, reasoning: 'Strong volume', confidence: 0.9 }
        ]
      }),
      model: 'llm:mock-department'
    };
  };

  const snap = await session.propose({ mockLLMHandler });
  assert.ok(snap.tasks.length > 0);
  assert.equal(snap.tasks[0].source, 'llm:mock-department');
});
