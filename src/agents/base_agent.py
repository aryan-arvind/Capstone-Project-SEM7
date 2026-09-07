"""
Base Abstract Domain Agent Schema.
Provides standardized interfaces for specialized domain intelligence agents.
"""

import uuid
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from src.schemas import Recommendation, AgentType, SystemState


class BaseDomainAgent(ABC):
    """
    Abstract base class for all domain intelligence agents.
    """

    def __init__(self, agent_name: str, agent_type: AgentType):
        self.agent_name = agent_name
        self.agent_type = agent_type

    @abstractmethod
    def evaluate(
        self,
        state: SystemState,
        business_data: Dict[str, Any]
    ) -> List[Recommendation]:
        """
        Analyzes current business state & digitalized data to generate domain recommendations.
        """
        pass

    def create_recommendation(
        self,
        title: str,
        description: str,
        required_cash: float,
        urgency_score: float,
        expected_roi_or_impact: float,
        risk_score: float,
        deadline_days: float,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Recommendation:
        """
        Helper method to instantiate a standardized Recommendation object.
        """
        return Recommendation(
            recommendation_id=f"REC-{self.agent_type.value[:3]}-{uuid.uuid4().hex[:8].upper()}",
            agent_type=self.agent_type,
            title=title,
            description=description,
            required_cash=round(required_cash, 2),
            urgency_score=round(max(0.0, min(1.0, urgency_score)), 2),
            expected_roi_or_impact=round(max(0.0, min(1.0, expected_roi_or_impact)), 2),
            risk_score=round(max(0.0, min(1.0, risk_score)), 2),
            deadline_days=round(deadline_days, 1),
            metadata=metadata or {}
        )
