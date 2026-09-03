# Hackathon Integration & Agentic Commerce Execution Guide
## Razorpay Track 01: AI Growth & Agentic Commerce

---

### 1. Hackathon Overview & Problem Statement
- **Track**: Track 01 — AI Growth & Agentic Commerce
- **Goal**: Build an agent that grows merchant revenue and makes them transactable by AI buyers on Razorpay test-mode APIs.
- **Key Mandate**: *"Every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully."*

---

### 2. Integration with Capstone Architecture
This module seamlessly extends Phase 4 of our Capstone Architecture:
1. **Explainable**: The Razorpay Order payload attaches AI reasoning metadata in notes.
2. **Bounded**: MCDM arbitration engine caps spend to fit cash buffer (e.g. max ₹20,000).
3. **Gated**: 1-click merchant sign-off required before dispatching Razorpay API payloads.
4. **Audit Trail**: Every transaction is logged with cryptographic SHA-256 hash chains.
5. **Graceful Failure**: Dedicated exception handler catches payment API drops and sets state to `HELD_IN_AUDIT_STATE`.

---

### 3. Team Work Breakdown for Submission

#### AryanT (Lead & Commerce Integration)
- Implements `src/payment/razorpay_client.py` and FastAPI `/action/confirm`.
- Handles SHA-256 hash logging (`src/core/audit.py`).
- Prepares video demo and Hackathon submission form.

#### Soham (Core Backend & Arbitration Engine)
- Implements SQLite DB models and seed scripts.
- Implements deterministic MCDM arbitration logic (`src/core/arbitration.py`).

#### Kohli (React UI & Governed Checkout Modal)
- Builds Action Card Feed UI and Razorpay Test Checkout modal.
- Implements `[Simulate Payment API Failure]` toggle switch on the UI.

---
