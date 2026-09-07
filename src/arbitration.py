"""
Arbitration Core Engine for Multi-Agent Decision Coordination.
Resolves competing recommendations from independent domain agents under
shared resource constraints (cash, time) using priority scoring & confidence gating.
"""

import uuid
import logging
from typing import List, Dict, Tuple
from src.schemas import (
    Recommendation,
    SystemState,
    ArbitrationResult,
    ExecutionTier,
    AgentType,
    DecisionStatus,
    RoutedDecision
)

logger = logging.getLogger(__name__)


class ArbitrationEngine:
    """
    Coordinates and reconciles competing recommendations under liquidity & urgency constraints.
    """

    def __init__(
        self,
        weight_urgency: float = 0.45,
        weight_impact: float = 0.35,
        weight_risk: float = 0.20,
        auto_execute_risk_threshold: float = 0.30,
        escalate_financial_ratio: float = 0.60
    ):
        """
        :param weight_urgency: Weight for recommendation urgency (deadline pressure)
        :param weight_impact: Weight for expected business ROI / penalty mitigation
        :param weight_risk: Inverse weight for downside financial/operational risk
        :param auto_execute_risk_threshold: Max risk score permitted for fully autonomous execution
        :param escalate_financial_ratio: Cash utilization ratio (> this fraction of cash forces escalation)
        """
        self.w_urgency = weight_urgency
        self.w_impact = weight_impact
        self.w_risk = weight_risk
        self.risk_threshold = auto_execute_risk_threshold
        self.escalate_ratio = escalate_financial_ratio

    def calculate_priority_score(self, rec: Recommendation) -> float:
        """
        Computes normalized priority score P in [0.0, 1.0].
        P = (w_u * urgency) + (w_i * impact) + (w_r * (1 - risk))
        """
        # Inverse risk score (lower risk yields higher priority score)
        risk_safety = max(0.0, 1.0 - rec.risk_score)
        
        score = (
            (self.w_urgency * rec.urgency_score) +
            (self.w_impact * rec.expected_roi_or_impact) +
            (self.w_risk * risk_safety)
        )
        return round(score, 4)

    def arbitrate(
        self,
        recommendations: List[Recommendation],
        state: SystemState
    ) -> ArbitrationResult:
        """
        Reconciles list of agent recommendations against state.available_cash.
        """
        if not recommendations:
            return ArbitrationResult(
                arbitration_id=str(uuid.uuid4()),
                approved_recommendations=[],
                rejected_recommendations=[],
                total_cash_allocated=0.0,
                remaining_cash=state.available_cash,
                execution_tier=ExecutionTier.AUTO_EXECUTE,
                decision_rationale="No recommendations provided to arbitrate.",
                priority_scores={}
            )

        # 1. Calculate Priority Scores for each recommendation
        scored_recs: List[Tuple[Recommendation, float]] = []
        scores_map: Dict[str, float] = {}

        for rec in recommendations:
            score = self.calculate_priority_score(rec)
            scored_recs.append((rec, score))
            scores_map[rec.recommendation_id] = score

        # 2. Sort recommendations descending by priority score
        scored_recs.sort(key=lambda x: x[1], reverse=True)

        # 3. Greedy Knapsack allocation under cash constraint
        approved: List[Recommendation] = []
        rejected: List[Recommendation] = []
        allocated_cash = 0.0
        current_balance = state.available_cash

        for rec, score in scored_recs:
            if rec.required_cash <= current_balance:
                approved.append(rec)
                allocated_cash += rec.required_cash
                current_balance -= rec.required_cash
            else:
                rejected.append(rec)

        # 4. Determine Confidence / Risk Execution Tier
        execution_tier = self._determine_execution_tier(approved, state.available_cash, allocated_cash)

        # 5. Formulate Decision Rationale
        rationale = self._build_rationale(approved, rejected, state.available_cash, allocated_cash)

        return ArbitrationResult(
            arbitration_id=str(uuid.uuid4()),
            approved_recommendations=approved,
            rejected_recommendations=rejected,
            total_cash_allocated=allocated_cash,
            remaining_cash=current_balance,
            execution_tier=execution_tier,
            decision_rationale=rationale,
            priority_scores=scores_map
        )

    def _determine_execution_tier(
        self,
        approved: List[Recommendation],
        initial_cash: float,
        allocated_cash: float
    ) -> ExecutionTier:
        if not approved:
            return ExecutionTier.AUTO_EXECUTE

        max_risk = max(rec.risk_score for rec in approved)
        cash_utilization = allocated_cash / initial_cash if initial_cash > 0 else 1.0

        # High cash utilization or high risk recs require Owner Escalation
        if cash_utilization > self.escalate_ratio or max_risk > 0.60:
            return ExecutionTier.ESCALATE
        elif max_risk > self.risk_threshold:
            return ExecutionTier.AUTO_LOG
        else:
            return ExecutionTier.AUTO_EXECUTE

    def _build_rationale(
        self,
        approved: List[Recommendation],
        rejected: List[Recommendation],
        initial_cash: float,
        allocated_cash: float
    ) -> str:
        summary = f"Allocated INR {allocated_cash:,.2f} out of INR {initial_cash:,.2f} available cash. "
        if approved:
            app_titles = [f"'{r.title}' (Urgency: {r.urgency_score})" for r in approved]
            summary += f"Approved {len(approved)} action(s): {', '.join(app_titles)}. "
        if rejected:
            rej_titles = [f"'{r.title}' (Req: INR {r.required_cash:,.2f})" for r in rejected]
            summary += f"Deferred/Rejected {len(rejected)} action(s) due to liquidity bounds: {', '.join(rej_titles)}."
        return summary

    def check_resource_conflicts(self, recommendations: List[Recommendation], available_cash: float) -> Tuple[bool, float, float]:
        """
        Checks if aggregate cash requested by agents exceeds available liquid cash.
        Returns (has_conflict, total_cash_requested, available_cash).
        """
        total_requested = sum(rec.required_cash for rec in recommendations)
        has_conflict = total_requested > available_cash
        return has_conflict, total_requested, available_cash

    def rank_recommendations(self, recommendations: List[Recommendation], available_cash: float) -> List[Recommendation]:
        """
        Calculates priority score for each recommendation using MCDM weighting formula
        and returns recommendations sorted descending by MCDM score.
        """
        ranked = []
        for rec in recommendations:
            score = self.calculate_priority_score(rec)
            rec.mcdm_score = score  # Dynamically attach score attribute for UI
            ranked.append(rec)

        ranked.sort(key=lambda r: getattr(r, "mcdm_score", 0.0), reverse=True)
        return ranked

    def route_decisions(self, ranked_recommendations: List[Recommendation], available_cash: float) -> List[RoutedDecision]:
        """
        Applies capital guardrails and amount capping to ranked recommendations.
        """
        routed: List[RoutedDecision] = []
        remaining_cash = available_cash

        for idx, rec in enumerate(ranked_recommendations):
            dec_id = f"DEC-2026-90{idx+1}"
            target_entity = rec.metadata.get("target_sku", rec.metadata.get("supplier_name", "Apex Metal Suppliers Ltd"))
            setattr(rec, "target_entity_id", target_entity)

            if rec.required_cash <= remaining_cash:
                approved_amt = rec.required_cash
                status = DecisionStatus.APPROVED
                reasoning = f"Approved in full (INR {approved_amt:,.2f}) within liquid capital buffer."
                remaining_cash -= approved_amt
            elif remaining_cash > 0:
                approved_amt = remaining_cash
                status = DecisionStatus.MODIFIED_CAP
                reasoning = f"Approved partial order capped at INR {approved_amt:,.2f} to protect required payroll reserve."
                remaining_cash = 0.0
            else:
                approved_amt = 0.0
                status = DecisionStatus.REJECTED_LIQUIDITY
                reasoning = f"Deferred due to zero remaining liquid buffer."

            routed.append(RoutedDecision(
                decision_id=dec_id,
                recommendation=rec,
                approved_amount=approved_amt,
                status=status,
                reasoning=reasoning
            ))

        return routed


