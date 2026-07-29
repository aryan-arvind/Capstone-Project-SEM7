# Multi-Agent Decision Coordination System for MSME Operations Management

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Domain: Multi-Agent Systems](https://img.shields.io/badge/Domain-Multi--Agent%20Systems-purple.svg)]()

> **Semester 7 Capstone Project**  
> An intelligent arbitration and coordination layer for autonomous multi-agent MSME operations under shared financial and time constraints.

---

## 📌 Executive Summary

Modern AI solutions for Micro, Small, and Medium Enterprises (MSMEs) often deploy independent agents (Finance, Inventory, Customer Service, Compliance, Growth). However, when two agents demand access to the same limited resource simultaneously—such as cash or operational bandwidth—existing systems fail to arbitrate, leaving the business owner as a manual decision-maker.

This project introduces a **Multi-Agent Arbitration and Coordination Engine** that evaluates conflicting recommendations from domain agents against real-world liquidity and urgency constraints, executing or escalating actions based on dynamic confidence and risk thresholds.

---

## 💡 The Core Problem (Worked Example)

Consider an Indian retail MSME with **₹40,000** available cash:

1. **Inventory Agent**: Recommends reordering stock ahead of festival season ($₹45,000$).
2. **Compliance Agent**: Recommends paying GST tax liability due in 3 days ($₹20,000$).

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

**Our Core Contribution:** The **Arbitration Engine** computes priority scores, cash constraints, and penalty costs to make optimal trade-off decisions automatically or escalate ranked recommendations to the owner.

---

## 🏗️ System Architecture & Scope

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

### Module Status Matrix

| Component | Status | Role |
| :--- | :--- | :--- |
| **Arbitration / Orchestrator Engine** | 🚀 **Full Build** | Novel priority scoring, cash/time constraint reconciliation, and confidence gating. |
| **Finance Agent** | 🟢 **Full Build** | Cash balance tracking, cash-flow forecasting, obligations monitoring. |
| **Inventory Agent** | 🟢 **Full Build** | Stockout probability, demand velocity calculation, automated purchase recommendations. |
| **Customer Agent** | 🟡 **Partial Build** | WhatsApp natural language processing (Hindi + English) for sales/order queries. |
| **Compliance Agent** | 🔵 **Design Only** | OpenAPI/JSON recommendation schema for tax/GST obligations (Future Plugin). |
| **Growth Agent** | 🔵 **Design Only** | OpenAPI/JSON recommendation schema for marketing/ad spend (Future Plugin). |

---

## 👥 One-Day Team Task Allocation

- **Person A**: Problem Statement & Worked Example + Measurable Project Objectives
- **Person B**: Literature Survey (MAS, Orchestration Frameworks, Indian MSME Tools) + Scope of Work
- **Person C**: Feasibility Analysis (Technical, Timeline, Data) + Presentation & Viva Prep

*Detailed proposal document is available in [`docs/proposal.md`](file:///d:/ARYAN%20ACADEMIC/SEM7/Capstone%20Project/docs/proposal.md).*

---

## 📂 Repository Structure

```
Capstone Project/
├── docs/
│   └── proposal.md         # Full Capstone Proposal Document
├── src/
│   ├── data_loader.py      # Basic data ingestion and validation utilities
│   └── ...                 # Core agent modules & arbitration engine (in progress)
├── data/                   # Synthetic MSME transaction logs & scenarios (ignored in git)
├── notebooks/              # Exploratory analysis & simulation benchmarks
├── requirements.txt        # Python dependencies
└── README.md               # Project overview (this file)
```

---

## 🚀 Getting Started

### Environment Setup
```bash
# Clone the repository
git clone <repository-url>
cd "Capstone Project"

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 📜 License
This project is licensed under the MIT License - see the LICENSE file for details.
