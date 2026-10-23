# MSME Working-Capital Arbiter - for Claude Code

A Semester 7 capstone: *Constraint-Aware Arbitration of Multi-Agent Recommendations for MSME
Working-Capital Decisions*. Six department agents propose conflicting uses of limited cash; a
deterministic Arbiter resolves them under hard financial constraints; experiments audit it against
two baselines. The 3D office is the front end. It is built on Agents Office by Sahni.ai (see LICENSE,
which stays in the repo).

## Where things live

- `msme/config/roster.json` - the single source for departments, the one LLM agent per department and
  the lightweight desk roles. `src/data.js`, `roster.mjs` and the engine read it. Do not hard-code
  department keys anywhere else.
- `msme/config/params.json` - simulator, constraint and objective parameters (INR).
- `msme/*.mjs` - the engine (simulator, schema, constraints, arbiter, strategies, runner).
- `test/*.test.mjs` - `npm test`.
- `src/*.js`, `src/shell.html`, `serve.mjs` - the 3D office and its server.

## Rules

- The LLM never decides feasibility or arbitration. It proposes (JSON, schema-validated) and it
  explains. Everything in `constraints.mjs` and `arbiter.mjs` is plain deterministic code.
- Same seed, same result: use the seeded RNG in `msme/sim.mjs`, never `Math.random()` in the engine.
- Amounts are integer INR. Show them with Indian grouping (`money()` in `src/v1data.js`).
- Run `npm run check` after changes; run `npm test` for the engine. Rebuild the page with `node build.mjs`.
- Keep secrets out of the repo.
