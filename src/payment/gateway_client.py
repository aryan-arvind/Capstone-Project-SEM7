"""
B2B Payment Settlement Gateway Client.
Handles test-mode financial settlement with embedded AI metadata and fault-tolerant error handling.
"""

import os
import uuid
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class PaymentGatewayError(Exception):
    """Custom exception raised when payment gateway settlement fails."""
    pass


class B2BPaymentGatewayClient:
    """
    Settlement gateway client for executing governed B2B payment transactions.
    Supports test-mode integration (e.g. Razorpay test mode or robust simulated gateway).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        test_mode: bool = True
    ):
        self.api_key = api_key or os.getenv("RAZORPAY_KEY_ID", "rzp_test_mock12345")
        self.api_secret = api_secret or os.getenv("RAZORPAY_KEY_SECRET", "mock_secret_67890")
        self.test_mode = test_mode

    def create_order(
        self,
        amount_in_rupees: float,
        decision_id: str,
        supplier_id: str,
        ai_rationale: str,
        currency: str = "INR",
        simulate_failure: bool = False
    ) -> Dict[str, Any]:
        """
        Creates a B2B payment order with embedded AI explanation notes.
        
        :param amount_in_rupees: Payment amount in INR.
        :param decision_id: Unique identifier of the arbitration decision.
        :param supplier_id: Merchant/Supplier identifier.
        :param ai_rationale: Plain-text AI explanation note attached to the transaction.
        :param currency: Currency code (default: INR).
        :param simulate_failure: If True, simulates a payment gateway timeout/failure.
        :return: Dict containing order details (order_id, transaction_id, status, metadata).
        """
        amount_in_paise = int(amount_in_rupees * 100)

        # 1. Simulate gateway failure for fault-tolerance testing
        if simulate_failure:
            logger.error(f"Payment gateway failure triggered for decision {decision_id}")
            raise PaymentGatewayError(
                f"Gateway Timeout: Failed to reach payment settlement server for decision {decision_id}."
            )

        # 2. Construct metadata notes with embedded AI explanation
        notes_metadata = {
            "decision_id": decision_id,
            "supplier_id": supplier_id,
            "ai_rationale": ai_rationale[:250],  # Embedded AI explanation note
            "governance_status": "GOVERNED_AUTO_SETTLED"
        }

        # 3. Generate B2B Order / Transaction
        order_id = f"order_{uuid.uuid4().hex[:12]}"
        transaction_id = f"pay_{uuid.uuid4().hex[:14]}"

        order_payload = {
            "order_id": order_id,
            "transaction_id": transaction_id,
            "amount": amount_in_rupees,
            "amount_paise": amount_in_paise,
            "currency": currency,
            "supplier_id": supplier_id,
            "status": "CREATED",
            "test_mode": self.test_mode,
            "notes": notes_metadata
        }

        logger.info(f"Successfully created B2B order {order_id} (Txn: {transaction_id}) for ₹{amount_in_rupees:,.2f}")
        return order_payload
