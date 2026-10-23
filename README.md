# MSME Working-Capital Arbiter

Capstone project (Semester 7): **Constraint-Aware Arbitration of Multi-Agent Recommendations for MSME
Working-Capital Decisions: Design, Implementation, and Empirical Audit.**

Six specialist agents (Sales, Procurement/Inventory, Production/Operations, Collections/Receivables,
Treasury, Compliance/Risk) recommend actions that compete for the same cash. An Arbiter, which is plain
code, keeps the best feasible subset under hard financial constraints. A seeded simulator and an
experiment runner audit it against two baselines.

This is a work in progress; the README is completed at the end of the build (architecture, how to run
the experiments, and a map from components to paper sections).

## Run

```bash
npm install
node build.mjs
npm start        # http://localhost:4520
npm run check    # roster + build + page smoke + unit tests
```

## Attribution and licence

The 3D office front end is derived from **Agents Office by Sahni.ai** (PolyForm Noncommercial 1.0.0 plus
Sahni.ai's additional terms, in [LICENSE](LICENSE)). The Sahni.ai mark and licence line stay on the page. This
project is non-commercial coursework. The department/agent content, simulator, constraint layer,
arbiter and experiments are new.
