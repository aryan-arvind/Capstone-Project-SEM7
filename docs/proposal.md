# Capstone Project Proposal: Multi-Agent Decision Coordination System for MSME Operations Management

## Project Overview

- **Title**: Multi-Agent Decision Coordination System for MSME Operations Management
- **Domain**: Artificial Intelligence / Multi-Agent Systems / Operations Management
- **Target Audience**: Micro, Small, and Medium Enterprises (MSMEs) in India
- **Core Innovation**: An intelligent arbitration and resource-constrained coordination engine that reconciles conflicting recommendations from independent AI agents under hard real-world constraints (limited cash flow and time).

---

# Section 1: Problem Statement & Project Objectives (Person A)

## 1.1 Problem Statement: The Shallow Automation vs. Deep Arbitration Gap

In recent multi-agent system (MAS) implementations, operational software often deploys specialized agents—such as **Finance, Inventory, Customer Service, Compliance, and Growth**—to monitor specific domain domains. However, existing architectures treat these as **five isolated tools** operating in silos. 

The primary structural bottleneck in autonomous multi-agent systems occurs the moment two or more agents generate **competing recommendations requiring access to the same finite resource** (e.g., liquid working capital or operational bandwidth).

### The Real-World MSME Scenario
Consider an Indian retail or manufacturing MSME with a liquid bank balance of **₹40,000**:
1. **Inventory Agent Recommendation**: Detects incoming festival season demand for high-velocity SKUs and issues an urgent recommendation: *"Reorder Inventory Batch #A42 immediately to avoid stockout. Cash required: ₹45,000."*
2. **Compliance Agent Recommendation**: Monitors statutory deadlines and issues a critical alert: *"Goods and Services Tax (GST) filing deadline due in 3 days. Penalty-free tax liability payment required: ₹20,000."*

```
                         ┌───────────────────────────┐
                         │   Shared Cash Constraint  │
                         │      Available: ₹40,000   │
                         └─────────────┬─────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │                                             │
    ┌───────────▼───────────┐                     ┌───────────▼───────────┐
    │    Inventory Agent    │                     │    Compliance Agent   │
    │  Reorder Batch #A42   │                     │    Pay GST Liability  │
    │   Required: ₹45,000   │                     │   Required: ₹20,000   │
    └───────────────────────┘                     └───────────────────────┘
                                Total Required: ₹65,000
                                Deficit: -₹25,000 (CONFLICT)
```

Combined, both recommendations demand **₹65,000**, exceeding available liquid capital by **₹25,000**. 

### Why Current Tools Fail
Existing MSME software solutions (e.g., Tally Prime, Vyapar, OkCredit, WhatsApp Business API) fail to address this problem because:
- **No Shared Constraint Awareness**: Current tools operate as passive record-keeping systems or notification triggers. They alert the owner to stock levels and tax deadlines separately without modeling liquidity interdependence.
- **Siloed Optimization**: An Inventory module optimizes purely for zero stockout risk; a Compliance module optimizes purely for zero penalty risk. Neither has visibility into overall cash flow or opportunity costs.
- **Owner as Manual Arbitrator**: In current setups, the shop owner receives multiple disconnected notifications and is forced to manually reconcile financial trade-offs. This is not autonomous automation—it is **manual decision-making augmented by alert fatigue**.

### Problem Statement Summary
> **Indian MSMEs cannot benefit from autonomous multi-agent automation because independently-optimizing agents generate conflicting recommendations under shared, hard constraints (limited cash and time), and no existing system arbitrates these conflicts intelligently. Owners are either overwhelmed by disconnected alerts or forced to manually reconcile every recommendation, defeating the purpose of automation.**

---

## 1.2 Project Objectives

The objective of this project is to build the **Arbitration and Coordination Layer** that transforms disconnected AI agents into an integrated, constraint-aware operations management system.

1. **Design and Implement a Constraint-Aware Arbitration Engine**: Develop a centralized decision orchestrator that receives multi-agent recommendations, evaluates them against real-time cash/time constraints, and applies a multi-criteria priority scoring policy.
2. **Establish Confidence-Gated Autonomous Execution**: Define and evaluate a confidence and risk-threshold matrix that dynamically categorizes system outputs into three execution tiers: *(a) Fully Auto-Execute*, *(b) Auto-Execute with Audit Logging*, and *(c) Escalate to Owner with Ranked Trade-off Recommendations*.
3. **Multi-Modal / Unstructured Input Integration**: Build a working **Customer Agent** accepting WhatsApp-style unstructured natural language input in **Hindi and English (Hinglish)**, demonstrating that the arbitration engine seamlessly handles both structured system data and unstructured real-world customer requests.
4. **Validation on Simulated MSME Datasets**: Test and benchmark the arbitration engine across $\ge 50$ real-world MSME stress-test scenarios, evaluating decision accuracy, liquidity preservation, and reduction in owner decision overhead.

---

# Section 2: Literature Survey & Scope of Work (Person B)

## 2.1 Literature Survey

### 2.1.1 Multi-Agent Coordination & Conflict Resolution
Classical Multi-Agent Systems (MAS) research has long addressed coordination through auction mechanisms, Markov Decision Processes (MDPs), and dynamic priority scoring. However, traditional MAS approaches assume either complete communication transparency or high computational bandwidth for negotiation games. In MSME operations, agents must operate under **hard dynamic financial constraints** where information is asymmetric, and decisions must be made in near real-time without computationally expensive bargaining rounds.

### 2.1.2 Existing Agent Orchestration Frameworks (LangGraph, CrewAI, AutoGen)
Modern LLM-based agent frameworks provide robust task chaining and role delegation, but lack built-in **resource-constrained arbitration layers**:
- **LangGraph**: Excellent for stateful cyclic graphs and routing, but does not natively provide mathematical constraint optimization or priority scoring across parallel agent recommendations.
- **CrewAI**: Focuses on role-playing sequential or hierarchical task execution, assuming agent outputs complement each other rather than contend for shared budgets.
- **AutoGen**: Enables multi-agent conversation, but conflict resolution relies on open-ended LLM chatter rather than deterministic, confidence-gated policy scoring.

| Framework / Aspect | Agent Communication | Cyclic State Graphs | Dynamic Resource Arbitration | Hard Constraint Satisfaction |
| :--- | :--- | :--- | :--- | :--- |
| **LangGraph** | Supported | Advanced | Custom Implementation Needed | Manual Guardrails |
| **CrewAI** | Role-Based | Linear / Hierarchical | Not Supported | Not Supported |
| **AutoGen** | Conversational | Dynamic | LLM Negotiation (Nondeterministic) | Not Supported |
| **Our Proposed System** | Event/Recommendation Driven | Directed State Graphs | **Built-in Priority & Liquidity Engine** | **Deterministic Constraint Scoring** |

### 2.1.3 Indian MSME Digitization Landscape
Current software solutions targeting Indian MSMEs (Tally, Vyapar, OkCredit, Khatabook) focus predominantly on accounting, ledger entry, and billing. While they record transaction history, they lack **predictive multi-agent planning** and **conflict arbitration**. 

---

## 2.2 Scope of Work

The scope of this project is intentionally structured to maximize novel research contribution (arbitration under constraints) while maintaining a feasible build schedule.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   PROPOSED ARBITRATION ARCHITECTURE                      │
│                                                                          │
│  ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐ │
│  │   Finance Agent   │    │  Inventory Agent  │    │  Customer Agent   │ │
│  │    (FULL BUILD)   │    │    (FULL BUILD)   │    │   (DEMONSTRATOR)  │ │
│  └─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘ │
│            │                        │                        │           │
│            └───────────────────┐    │    ┌───────────────────┘           │
│                                ▼    ▼    ▼                               │
│                         ┌───────────────────────┐                        │
│                         │ ARBITRATION ENGINE    │                        │
│                         │  - Priority Scoring   │                        │
│                         │  - Cash/Time Check    │                        │
│                         │  - Confidence Gating  │                        │
│                         └───────────┬───────────┘                        │
│                                     │                                    │
│        ┌────────────────────────────┼────────────────────────────┐       │
│        ▼                            ▼                            ▼       │
│  (a) Auto-Execute           (b) Auto-Log                  (c) Escalate   │
│                                                                          │
│  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  │
│  FUTURE / DESIGN-ONLY PLUGINS: [Compliance Agent]  [Growth Agent]        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Scope Boundary Summary Paragraph
The project fully implements the core **Arbitration Engine**, along with two primary operational agents (**Finance Agent** and **Inventory Agent**) that feed structured recommendations into the engine. To demonstrate processing of unstructured real-world inputs, a secondary **Customer Agent** (WhatsApp integration supporting English and Hindi/Hinglish) is built partially as a demonstrator. Additional domain agents (**Compliance Agent** and **Growth Agent**) are specified at the design level (architecture diagram and OpenAPI/JSON schema contracts) to prove system extensibility without overburdening implementation scope.

### Scope Breakdown Table

| Component | Implementation Status | Justification / Role |
| :--- | :--- | :--- |
| **Arbitration / Orchestrator Engine** | **Full Build** | Novel core contribution. Handles priority scoring, liquidity check, confidence gating, and execution policy. |
| **Finance Agent** | **Full Build** | Tracks cash balances, accounts payable/receivable, upcoming cash flow requirements. |
| **Inventory Agent** | **Full Build** | Monitors stock levels, calculates reorder urgency scores based on lead time and demand velocity. |
| **Customer Agent** | **Partial Build (Demonstrator)** | WhatsApp channel integration, handling natural language sales/order queries in Hindi & English. |
| **Compliance Agent** | **Design Only (API Schema)** | Pluggable agent specification for GST/tax obligations, demonstrated via simulated payload. |
| **Growth Agent** | **Design Only (API Schema)** | Pluggable agent specification for marketing/ad spend recommendations, demonstrated via simulated payload. |

---

# Section 3: Feasibility Analysis & Presentation Prep (Person C)

## 3.1 Feasibility Analysis

### 3.1.1 Technical Feasibility
- **Orchestration & LLM Framework**: LangGraph will serve as the underlying graph state machine, combined with lightweight LLMs (e.g., Gemini 1.5 Flash / GPT-4o-mini) for intent extraction and structured JSON output.
- **Cost Efficiency**: By enforcing deterministic rule-based priority scoring inside the arbitration core and reserving LLM calls for natural language interpretation (Customer Agent), token cost per decision cycle is minimized (< ₹0.50 per arbitration run).
- **Extensibility**: Standardized JSON recommendation contracts ensure new agents can be added without modifying the core arbitration algorithm.

### 3.1.2 Timeline Feasibility (3-Month Development Roadmap)
- **Month 1**: Specification of agent schemas, synthetic dataset generator, base Finance & Inventory agent modules.
- **Month 2**: Core Arbitration Engine implementation (priority scoring, cash constraint evaluation, confidence gating).
- **Month 3**: WhatsApp Customer Agent demonstrator integration, scenario stress-testing ($\ge 50$ test cases), evaluation metrics gathering, final report & viva prep.

### 3.1.3 Data Feasibility
Since real MSME transaction data is restricted due to privacy concerns, the project utilizes a **Synthetic MSME Data Generator** producing realistic transaction ledgers, inventory movement logs, tax obligation calendars, and customer chat logs modeled on typical Indian retail/manufacturing profiles.

---

## 3.2 Presentation & Viva Strategy

### Proposed Presentation Flow (Slide Structure)
1. **Title & Team**: Multi-Agent Decision Coordination System for MSME Operations Management.
2. **The Problem**: 5 Isolated Agents $\neq$ Autonomous System. Illustrate the ₹40,000 Cash vs ₹65,000 Demand conflict.
3. **The Gap in Current Tools**: Why Tally / Vyapar / OkCredit leave the owner as a manual arbitrator.
4. **Our Solution**: The Arbitration & Coordination Engine under hard liquidity and time constraints.
5. **System Architecture**: Flow of recommendations from Finance, Inventory, and Customer agents into the confidence-gated decision engine.
6. **Confidence & Risk Gating**: Auto-Execute vs Auto-Log vs Escalate policy logic.
7. **Scope & Roadmap**: Full implementation vs design-only pluggable agents.
8. **Expected Outcomes**: Metrics on decision accuracy, liquidity safety, and manual overhead reduction.
