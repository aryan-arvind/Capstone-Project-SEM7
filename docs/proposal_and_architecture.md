# Capstone Technical Proposal & System Architecture
## AI-Powered Business Decision Intelligence Platform for MSMEs

---

### Document Overview
- **Project Title**: Multi-Agent Business Decision Intelligence Platform with Deterministic Conflict Arbitration
- **Domain**: Agentic AI, Multi-Agent Orchestration, Multi-Criteria Decision Making (MCDM), Human-in-the-Loop Operations
- **Target Context**: Small and Medium Enterprises (SMEs / MSMEs) with resource constraints
- **Core Technical Contribution**: A hybrid architecture combining tool-grounded domain agents, a deterministic non-LLM conflict arbitration engine, and an actionable decision-card interface with immutable audit logging.

---

## 1. Literature Survey & Systematic Research Gap Matrix

A comprehensive literature synthesis was conducted across twelve key research papers spanning multi-agent systems (MAS), agentic workflows, financial AI, decision support systems (DSS), domain adaptation (LoRA), and digital twins.

### 1.1 Summary of Literature & Critical Gaps

| Ref | Study & Domain | Core Technical Contribution | Specific Limitation / Open Research Gap | Relevance to Our Scope |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | **Chen et al. (2026)**<br>*Well-log MAS (Elsevier)* | Role-based agent decomposition + tool-grounded hybrid physics/ML reasoning; human-in-the-loop reduced error from 47% to 17%. | Highly single-domain (petroleum engineering) and relies on domain-expert supervision; not generalized to multi-domain business operations. | Validates that role decomposition + read-only tool grounding works effectively. |
| **P2** | **Massoudi & Fuge (2025)**<br>*Agentic LLMs for Design (ASME)* | Multi-agent graph framework out-performed 2-agent setup on coverage, but failed on exact numeric reasoning. | LLM reasoning alone is inherently unreliable for exact numeric/financial calculations over long contexts; arithmetic must reside outside LLM. | Justifies moving all financial and inventory calculations into deterministic tools/Python logic. |
| **P3** | **Thakker (2026)**<br>*Cloud-Edge Orchestration (IEEE)* | RL-scheduled hierarchical orchestration; self-healing gives 99.7% completion under infrastructure failures. | Validates resilience and self-monitoring patterns for cloud-edge orchestration, but applied strictly to network infra, not business logic. | Provides architectural pattern for agent resilience and state isolation. |
| **P4** | **Pendyala et al. (2026)**<br>*AI Payment Orchestration (Springer)* | Identifies fraud, compliance, and routing as fragmented silos; solves with federated learning + blockchain audit trail. | Blockchain consensus overhead is unjustified at single-SME scale; compliance checks are rule-based under RL routing, not human-checked per action. | Inspires human-gated payment execution with local hash-chained audit logging instead of public blockchain. |
| **P5** | **Devi et al. (2026)**<br>*Big Data & Strategic DSS (IEEE)* | Empirically links analytics maturity to enterprise performance across retail and finance sectors. | Confirms the "analytics-to-action gap": systems produce analytics/reports, but lack mechanisms to convert insights into executable workflows. | Directly motivates our card-based Decision Workspace over traditional charts/dashboards. |
| **P6** | **Khan et al. (2026)**<br>*Agile+TensorFlow DSS (IEEE)* | Delivery methodology for deploying AI-based DSS in enterprises using Agile sprints. | Process guidance only; leaves technical multi-agent architecture, conflict resolution, and explainability completely unaddressed. | Confirms the need for a concrete multi-agent architecture specification. |
| **P7** | **Hasan & Nguyen (2026)**<br>*Agentic AI + Digital Twins (Elsevier)* | Layered *perception → reasoning → decision → action → feedback* loop for power-grid load balancing. | Assumes a continuous physical digital twin with IoT sensor streams—too heavy and impractical for digital/partially-digital SMEs. | Adapts the closed perception-action loop into a lightweight "Business Context State". |
| **P8** | **Santhosh et al. (2026)**<br>*BridgeRock AI, Financial MAS (IEEE)* | Multi-agent (Data, Insight, Thesis) + RAG architecture for institutional equity research with evidence pointers. | Output delivered as a conversational chatbot for financial analysts; RAG optimized for documents, not structured SQL database tables. | Borrows evidence traceability, but replaces document RAG with structured SQL tools and replaces chat with decision cards. |
| **P9** | **Ma et al. (2026)**<br>*Lightweight Edge MAS (Elsevier)* | Hierarchical edge/cloud tiers; uses game-theoretic (Nash equilibrium) consensus to cut communication overhead. | Game-theoretic consensus is mathematically complex and opaque (black-box) to a non-technical business owner; lacks explainability. | Direct motivation to replace game theory/RL arbitration with a transparent MCDM scoring model. |
| **P10**| **Electronic Markets (2026)**<br>*MAAI Conceptual Framework* | 5-layer framework (*Foundation Model, Perception, Orchestration, Workflow, Interface*). | Explicitly identifies Dynamic Orchestration (Layer 3) and the User Interaction Layer (Layer 5) as the least studied areas in literature. | Confirms that our core contributions (arbitration engine + non-chat decision UI) hit real academic gaps. |
| **P11**| **Kirchdorfer et al. (2025)**<br>*AgentSimulator (Springer)* | Discovers MAS workflows from event logs; demonstrates orchestration vs autonomy must be selected per process. | Coordination rules are discovered post-hoc from historical logs, rather than arbitrated in real-time for live competing agent outputs. | Validates real-time arbitration as an unaddressed requirement. |
| **P12**| **Yang et al. (2026)**<br>*SimLoRA (Springer)* | Demonstrates standard LoRA under-learns sparse personalized signals; proposes attention-weighted LoRA + RLHF. | Highlights that domain fine-tuning requires substantial annotation and engineering; unneeded if structured context + tools yield high precision. | Guides our design choice: keep general-purpose LLM + tool grounding as core baseline; treat LoRA fine-tuning as a gated stretch goal. |

---

### 1.2 Synthesized Cross-Paper Research Gaps

By synthesizing the limitations across the literature, we isolate **five major cross-paper research gaps**:

```
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                               CROSS-PAPER RESEARCH GAPS                          │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ GAP 1: The Analytics-to-Action Gap (P5, P8, P10)                                 │
 │        Existing systems generate charts or conversational text, requiring manual  │
 │        human translation into operational actions.                               │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ GAP 2: Numeric & Financial Unreliability in LLMs (P2, P8)                        │
 │        Pure LLM agents fail at exact numeric, financial, and inventory math      │
 │        over long contexts.                                                       │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ GAP 3: Opaque or Non-Existent Conflict Arbitration (P4, P9, P10, P11)             │
 │        Multi-agent outputs that contend for shared capital are either ignored,    │
 │        negotiated via unexplainable RL/game theory, or left to owner manual work.│
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ GAP 4: Lack of Lightweight Business Context / Onboarding for SMEs (P7, P10)     │
 │        Digital twin architectures demand IoT sensor streams, whereas SMEs        │
 │        possess fragmented tabular data and unwritten owner constraints.          │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ GAP 5: Unverifiable & Uncontrolled Autonomous Execution (P4, P5)                 │
 │        Systems either execute autonomously without safety guardrails or lack      │
 │        tamper-evident audit logging for financial transactions.                   │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Problem Statement & Research Questions

### 2.1 Problem Statement
> **Resource-constrained SMEs generate fragmented operational data across inventory, sales, and finance, but lack an integrated decision-support system capable of converting this data into prioritized, explainable, and executable actions. Existing multi-agent systems operate in domain silos, produce unverified numeric outputs via LLM reasoning, resolve recommendation conflicts through opaque algorithms (or leave them to owner manual labor), and present outputs through conversational chat interfaces that induce alert fatigue.**

### 2.2 Formal Research Questions (RQs)

- **RQ1 (Context & Grounding)**: *How can domain-specialized AI agents be reliably grounded in structured SME database context to prevent numeric hallucinations and arithmetic errors?*
- **RQ2 (Conflict Arbitration)**: *How can conflicting recommendations from independent agents competing for finite liquid capital be systematically detected and arbitrated using a transparent, inspectable multi-criteria model?*
- **RQ3 (Human-Centered Explainability)**: *How can complex multi-agent reasoning and arbitration traces be transformed into a prioritized visual decision interface without resorting to conversational free text?*
- **RQ4 (Governance & Auditability)**: *How can execution safety guardrails and tamper-evident audit logging be integrated into an AI-assisted business action workflow?*

---

## 3. Proposed Solution Architecture

We propose the **AI-Powered Business Decision Intelligence Platform**. The system enforces a strict **separation of concerns**: Large Language Models are used solely for natural language understanding and contextual reasoning, while all numeric calculations, conflict checks, priority scoring, and guardrail routing are performed by deterministic Python code.

### 3.1 System Architecture Diagram

```mermaid
flowchart TB

subgraph FE["FRONTEND — React + TypeScript"]
    direction LR
    F1["Onboarding Form
    (Business Profile Setup)"]
    F2["Decision Feed UI
    (Action Cards + Agent Trace)"]
end

subgraph API["BACKEND — FastAPI Layer"]
    A1["/onboard"]
    A2["/agent-query"]
    A3["/action/confirm"]
end

subgraph LG["ORCHESTRATION — LangGraph State Machine"]
    direction TB
    LG1(["StateGraph
    Shared State: business_profile + operational_data + rec_pool"])
    LG2["Node: Inventory Agent"]
    LG3["Node: Finance Agent"]
    LG4["Node: Operations Agent"]
    LG5["Node: Arbitration Engine Node"]
    
    LG1 --> LG2 & LG3 & LG4 --> LG5
end

subgraph LC["LANGCHAIN & TOOL LAYER"]
    direction LR
    C1["Prompt Templates
    (Inject business_profile)"]
    C2["Output Parsers
    (Enforce JSON Schema)"]
    C3["Read-Only DB Tools
    (SQL Queries for Stock/Cash)"]
end

subgraph ML["LLM SERVING LAYER"]
    M1["General-Purpose LLM
    (Tool-Calling Enabled via API)"]
end

subgraph ARBE["DETERMINISTIC ARBITRATION ENGINE (Python Core)"]
    direction TB
    R1["conflict_check()
    (Pairwise Entity/Resource Check)"]
    R2["priority_rank()
    (MCDM Weighted Scoring)"]
    R3["decision_router()
    (Hard Capital Guardrails)"]
    
    R1 --> R2 --> R3
end

subgraph DB["PERSISTENCE & AUDIT — SQLite + SQLAlchemy"]
    direction LR
    D1[("business_profile")]
    D2[("operational_data")]
    D3[("decision_log
    (Hash-Chained Audit Trail)")]
end

%% Connections
F1 -->|POST Profile| A1 --> D1
F2 -->|POST Trigger| A2 --> LG1
LG2 & LG3 & LG4 -.-> C1
C1 --> M1
M1 --> C2
C2 -.-> LG2 & LG3 & LG4
LG2 & LG3 & LG4 -.->|"SQL Query"| C3
C3 <--> D2
LG5 -->|"Execute Engine"| R1
R3 -->|"Routed Decisions"| A3 --> F2
R3 -->|"Write Audit Entry"| D3

%% Styling
classDef fe fill:#DCE6F2,stroke:#1B2A4A,color:#1B2A4A,stroke-width:2px
classDef api fill:#F4F6FA,stroke:#5B6B82,color:#1B2A4A,stroke-width:2px
classDef lg fill:#2A3D63,stroke:#D97706,color:#FFFFFF,stroke-width:2px
classDef lc fill:#FFFFFF,stroke:#1B2A4A,color:#1B2A4A,stroke-width:2px
classDef ml fill:#5B6B82,stroke:#D97706,color:#FFFFFF,stroke-width:2px
classDef core fill:#1B2A4A,stroke:#D97706,color:#FFFFFF,stroke-width:2px
classDef data fill:#FCEED2,stroke:#D97706,color:#1B2A4A,stroke-width:2px

class F1,F2 fe
class A1,A2,A3 api
class LG1,LG2,LG3,LG4,LG5 lg
class C1,C2,C3 lc
class M1 ml
class R1,R2,R3 core
class D1,D2,D3 data
```

---

### 3.2 Deep Technical Component Breakdown

#### 1. Onboarding & Business Context Store (`F1`, `A1`, `D1`)
- **Function**: Captures near-static business parameters: business category (e.g., retail, light manufacturing), monthly revenue band, minimum required cash reserve ($\text{MCR}$), key supplier lead times, and critical SKUs.
- **Implementation**: React form submitting to FastAPI `/onboard`, persisted in `business_profile`. Injected directly into LangGraph state for every agent cycle.

#### 2. Domain Agents & Read-Only Tool Grounding (`LG2`, `LG3`, `LG4`, `C3`, `D2`)
- **Inventory Agent**: Evaluates stockout risks, demand velocity, and reorder points.
- **Finance Agent**: Evaluates cash flow liquidity, accounts payable, tax liabilities, and working capital buffers.
- **Operations Agent**: Evaluates supplier lead-time reliability, order fulfillment delays, and batch constraints.
- **Tool-Grounding Contract**: Agents **never write numbers directly from LLM memory**. All stock balances, revenue figures, and days-to-stockout calculations are returned by deterministic SQL tool calls (`C3`) against `operational_data` (`D2`). This directly resolves **P2's numeric unreliability gap**.

#### 3. Standardized Recommendation Schema (`C2`)
Each agent node must produce a strictly validated JSON recommendation object:
```json
{
  "recommendation_id": "REC-INV-2026-089",
  "agent_id": "Inventory_Agent",
  "entity_id": "SKU-PROD-X",
  "action_type": "RESTOCK",
  "proposed_quantity": 150,
  "estimated_cost": 25000.00,
  "expected_benefit": 40000.00,
  "urgency_score": 0.85,
  "confidence_score": 0.92,
  "reasoning_summary": "Stock level (12 units) below safety threshold (30 units); demand up 23%.",
  "evidence_pointers": ["stock_ledger:row_402", "sales_velocity:row_118"]
}
```

#### 4. Deterministic Arbitration Engine (`R1`, `R2`, `R3`)
The arbitration engine is written entirely in **pure, unit-testable Python** with zero ML or LLM dependencies during execution.

##### Step A: `conflict_check()` (`R1`)
Performs pairwise inspection across all generated recommendations in the pool:
1. **Entity-Level Conflict**: Two recommendations target the same entity with contradictory actions (e.g., Inventory recommends *Restock SKU-X*, Operations recommends *Hold/Discontinue SKU-X*).
2. **Resource-Level Conflict**: The combined estimated cost of recommendations exceeds available liquid capital:
$$\sum \text{estimated\_cost}_i > \text{Available Cash} - \text{Minimum Cash Reserve}$$

##### Step B: `priority_rank()` MCDM Engine (`R2`)
Scans all non-conflicting and conflicting recommendations using a transparent Multi-Criteria Decision Making (MCDM) weighted sum model:

$$\text{Priority Score} = w_1 \cdot S_{\text{rev}} + w_2 \cdot S_{\text{urg}} + w_3 \cdot S_{\text{cash}} + w_4 \cdot S_{\text{conf}}$$

Where:
- $S_{\text{rev}}$: Revenue at risk / expected net benefit (normalized $0.0 - 1.0$)
- $S_{\text{urg}}$: Urgency score based on days until stockout or deadline ($0.0 - 1.0$)
- $S_{\text{cash}}$: Cash buffer impact ratio ($1.0 - \frac{\text{cost}}{\text{available\_cash}}$)
- $S_{\text{conf}}$: Agent confidence score ($0.0 - 1.0$)
- Default Weights: $w_1 = 0.40, w_2 = 0.30, w_3 = 0.20, w_4 = 0.10$ (configurable per profile)

*Why MCDM over Game Theory/RL (P4, P9)?* Game-theoretic Nash equilibria and RL reward functions are opaque black boxes. MCDM weighted scoring allows the business owner to click "Why this rank?" and see the four exact component scores behind any decision.

##### Step C: `decision_router()` (`R3`)
Applies hard business guardrails:
- **Capital Cap**: If an Inventory recommendation asks for ₹45,000 but available cash buffer is ₹30,000, the router **automatically caps the purchase order** to ₹30,000 (partial restock) rather than rejecting it or allowing an overdraft.
- **Risk Routing**:
  - *Low Risk / Zero Spend*: Auto-execute or render as standard task card.
  - *Medium Spend (< ₹10,000)*: Surfaced on Decision Feed UI requiring single-tap approval.
  - *High Spend / High Financial Risk (> ₹10,000)*: Triggers double-confirmation modal with full agent trace view.

#### 5. Decision Feed UI & Action Cards (`F2`)
Replaces open-ended chatbot prompts with a visual card feed:
- **Header**: Business Health Indicators (Inventory Alert, Cash Status, Ops Delay).
- **Priority Action Cards**: Displays Top 3 prioritized decisions.
- **Card Elements**: Title, Action Type, Urgency Badge, Financial Impact (₹), "Why?" Accordion (showing evidence pointers and individual agent stances), and Action Buttons (**[Approve & Execute]**, **[Modify Quantity]**, **[Defer]**).

#### 6. Immutable Hash-Chained Audit Log (`D3`)
Every generated recommendation, conflict flag, MCDM score, routed decision, and user action is written as an append-only, cryptographic hash-chained database row:

$$\text{Hash}_k = \text{SHA-256}(\text{Hash}_{k-1} \parallel \text{Timestamp}_k \parallel \text{DecisionData}_k)$$

This guarantees tamper-evident auditability (**P4 requirement**) without the massive performance overhead of public blockchain consensus.

---

### 3.3 End-to-End Decision Flow Example

```
SCENARIO: Retailer has ₹40,000 available cash. Minimum cash reserve = ₹10,000. Liquid Buffer = ₹30,000.

1. Inventory Agent detects SKU-A depletion:
   -> Proposes: Restock Batch #101 | Cost: ₹25,000 | Urgency: 0.90 | Impact: ₹40,000
   
2. Finance Agent detects upcoming Supplier Invoice due in 4 days:
   -> Proposes: Pay Invoice #INV-88 | Cost: ₹15,000 | Urgency: 0.85 | Impact: Avoid 5% penalty (₹2,500)

3. Combined Cost = ₹25,000 + ₹15,000 = ₹40,000.
   Exceeds Liquid Buffer (₹30,000) by ₹10,000!

4. conflict_check() flags RESOURCE_OVERALLOCATION between Inventory and Finance.

5. priority_rank() calculates MCDM Scores:
   - Invoice #INV-88 Score: 0.40*(2500) + 0.30*(0.85) + 0.20*(0.50) + 0.10*(0.95) = 0.785
   - Restock Batch #101 Score: 0.40*(40000) + 0.30*(0.90) + 0.20*(0.16) + 0.10*(0.90) = 0.892
   -> Inventory Restock ranked #1, Supplier Invoice ranked #2.

6. decision_router() applies Guardrails:
   - Pays Restock Batch #101 at ₹25,000 (Rank 1).
   - Remaining Liquid Buffer = ₹30,000 - ₹25,000 = ₹5,000.
   - For Supplier Invoice (Rank 2), router caps partial payment to ₹5,000 or defers payment by 3 days.

7. Decision Feed UI renders Card:
   "Restock Batch #101 (₹25,000) Approved | Defer Invoice #INV-88 Partial Payment (₹5,000)"
   Owner sees both agent positions, evidence rows, and approves with 1 click.
```

---

## 4. Implementation Plan & Milestone Roadmap

The project is structured into **five sequential phases**, each governed by a strict, verifiable exit criterion to ensure architectural stability.

| Phase | Duration | Focus Area | Deliverables | Verifiable Exit Criterion |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | Weeks 1–2 | **Foundation & Data Layer** | SQLite schema (`business_profile`, `operational_data`, `decision_log`), FastAPI seed script, synthetic data generator. | End-to-end SQL query execution for synthetic store profile + 30 days of sales/stock logs. |
| **Phase 1** | Weeks 3–4 | **Single-Agent MVP** | Inventory Agent with read-only SQL tool calls, LangChain JSON output parser, basic card UI renderer. | Inventory Agent produces 100% schema-valid recommendation cards without numeric hallucinations. |
| **Phase 2** | Weeks 5–7 | **Multi-Agent + Arbitration Engine** | Finance & Operations Agents added; LangGraph state graph; `conflict_check()`, `priority_rank()`, `decision_router()` implemented. | System resolves a synthetic cash-conflict test case (Section 3.3) to a single capped decision with full trace. |
| **Phase 3** | Weeks 8–9 | **Decision Workspace & Audit Log** | React Decision Feed UI, agent "Why?" trace accordion, SHA-256 hash-chained `decision_log` table. | Every card on screen traces to a verifiable hash-chained audit row; manual tampering fails chain test. |
| **Phase 4** | Weeks 10–12 | **Controlled Action Gate & Viva Prep** | Governed action execution (simulated payment gate with amount cap + approval modal), evaluation metrics benchmark. | Complete end-to-end live demonstration; benchmark report against baseline rule system ready for defense. |

---

## 5. Defense Strategy: Faculty "Bouncer" Questions & Technical Answers

Below are the **top 10 toughest technical questions** likely to be asked during faculty reviews, along with exact, literature-grounded answers.

### Q1: "Why use a Multi-Agent architecture? Couldn't a single large LLM prompt analyze inventory, finance, and operations all at once?"
> **Answer**: Single-prompt monolithic LLMs suffer from three proven failure modes: **context dilution**, **role confusion**, and **numeric hallucination**. Paper **P2 (Massoudi & Fuge, ASME 2025)** empirically demonstrated that multi-agent graph decomposition beats single/two-agent setups in task coverage, while **P10 (Electronic Markets 2026)** validates role decomposition as essential for domain specialization. More importantly, isolated agents allow us to ground each agent with specific, read-only SQL tools (`C3`) for its own domain, ensuring arithmetic calculations stay outside the LLM.

### Q2: "If your arbitration engine uses plain Python and rule-based MCDM, where is the 'AI' in arbitration?"
> **Answer**: That is a deliberate architectural choice grounded in academic literature. Papers **P4** (RL payment routing) and **P9** (game-theoretic Nash equilibria) show that while ML/game theory can arbitrate conflicts, the resulting decisions become **opaque black boxes** that business owners cannot trust or audit. Paper **P10** highlights that interaction and explainability are where existing MAS systems fail. We deliberately restrict LLMs to language understanding and domain reasoning, while keeping the decision arbitration engine deterministic and inspectable ($Score = w_1 S_{\text{rev}} + w_2 S_{\text{urg}} + \dots$). This ensures 100% mathematical auditability.

### Q3: "How do you guarantee that your agents will not hallucinate numbers like stock quantities or cash balances?"
> **Answer**: Agents are strictly prohibited from generating numbers out of parametric memory. Every numeric quantity in a recommendation (e.g., units left, days to stockout, cash buffer) must originate from a **read-only database tool call** (`C3`) executed against SQLite (`D2`). If an agent output contains a numeric claim unsupported by a tool return payload, the LangChain Output Parser (`C2`) fails validation and triggers a retry. This directly resolves **P2's numeric unreliability gap**.

### Q4: "What happens if two agents produce completely contradictory recommendations that cannot be partially fulfilled?"
> **Answer**: The `conflict_check()` module detects entity-level and resource-level contradictions. If two recommendations are mutually exclusive (e.g., *Restock SKU-A* vs *Discontinue SKU-A*), `priority_rank()` scores both using the MCDM formula. The lower-scoring recommendation is suppressed by `decision_router()`, but it is **not deleted**. It is stored in the audit log and displayed in the UI under the winning card's "Conflicting Stances" accordion so the owner has full visibility into the trade-off.

### Q5: "How does your system handle un-digitized or traditional SMEs that don't have an ERP or POS software?"
> **Answer**: This is handled by our **Onboarding & Business Context Layer** (`F1`). During initial setup, the owner completes a structured 5-minute onboarding form capturing business type, revenue tier, minimum cash threshold, and key suppliers. For ongoing operations, the platform supports CSV/Excel uploads and manual ledger entries. This lightweight business profile forms the shared state (`LG1`) without requiring an expensive IoT or digital twin sensor setup (**P7 gap**).

### Q6: "Why did you build a Decision Card UI instead of a conversational Chatbot like ChatGPT or WhatsApp AI?"
> **Answer**: Literature explicitly shows that conversational interfaces create **alert fatigue** and force the human user to act as a manual data parser (**P5 analytics-to-action gap**, **P8 conversational limitation**). Paper **P10** identifies the user interface as the least mature layer in agentic AI. Business owners do not want to chat; they want to see prioritized, high-impact decisions with clear trade-offs and single-tap approval buttons (**[Approve]**, **[Modify]**, **[Defer]**).

### Q7: "Why did you use an append-only hash-chained table instead of a Blockchain for audit logging?"
> **Answer**: Paper **P4 (Pendyala et al., 2026)** utilizes blockchain for cross-border multi-bank payment orchestration, where consensus between untrusted institutions is required. However, for a single SME enterprise, distributed consensus introduces unnecessary latency, complexity, and cost. An append-only database table where each row stores $\text{SHA-256}(\text{Hash}_{k-1} \parallel \text{Data}_k)$ provides the exact same **tamper-evident auditability guarantee** at zero network cost.

### Q8: "How do you handle latency when multiple agents are running LLM queries in parallel?"
> **Answer**: We leverage **LangGraph's fan-out / fan-in execution nodes** (`LG2`, `LG3`, `LG4`). Since domain agents are independent, LangGraph invokes all three agents asynchronously in parallel over the snapshot state `LG1`. Using fast API models (e.g., Gemini Flash / vLLM Llama-3-8B), parallel agent execution completes in $< 1.5$ seconds, followed by deterministic Python arbitration in $< 10$ milliseconds.

### Q9: "Why is LoRA fine-tuning listed as an optional stretch goal rather than a core requirement?"
> **Answer**: Paper **P12 (Yang et al., SimLoRA 2026)** demonstrates that domain fine-tuning requires specialized attention-weighting and extensive RLHF annotation to beat general-purpose models. In our architecture, domain knowledge is supplied dynamically via structured prompt injection (`C1`) and real-time SQL tool grounding (`C3`). General-purpose models excel at structured JSON generation when given clear schemas. Fine-tuning will only be pursued if empirical evaluation shows an accuracy deficit in intent classification.

### Q10: "How will you evaluate whether your proposed system is actually better than traditional software or single agents?"
> **Answer**: We evaluate the platform across three empirical metrics:
> 1. **Decision Accuracy & Conflict Resolution Rate**: Benchmark against 50+ synthetic stress-test scenarios comparing (a) Single LLM Prompt, (b) Multi-Agent without Arbitration, and (c) Our Proposed System.
> 2. **Liquidity Preservation Score**: Measuring whether arbitrated decisions prevent cash overdrafts compared to unconstrained multi-agent execution.
> 3. **Latency & Token Efficiency**: Quantifying response latency and token costs per decision cycle.

---
