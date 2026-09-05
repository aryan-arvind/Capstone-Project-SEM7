"""
Pydantic Data Schemas for Multimodal SME Data Digitalization & Verification.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class VerificationStatus(str, Enum):
    VALIDATED = "VALIDATED"
    DISCREPANCY_FLAGGED = "DISCREPANCY_FLAGGED"
    PARTIAL_READ = "PARTIAL_READ"
    CORRUPTED = "CORRUPTED"


class DocumentType(str, Enum):
    INVOICE = "INVOICE"
    INVENTORY_LIST = "INVENTORY_LIST"
    PURCHASE_ORDER = "PURCHASE_ORDER"
    SALES_LOG = "SALES_LOG"


class RawLineItem(BaseModel):
    item_id: Optional[str] = None
    item_name: str
    quantity: float
    unit_price: float
    line_total: float
    is_arithmetic_valid: bool = True


class DigitalizedInvoice(BaseModel):
    invoice_id: str
    supplier_name: str
    date: str
    line_items: List[RawLineItem]
    subtotal: float
    tax_amount: float = 0.0
    grand_total: float
    verification_status: VerificationStatus = VerificationStatus.VALIDATED
    discrepancies: List[str] = Field(default_factory=list)


class DigitalizedInventoryItem(BaseModel):
    item_id: str
    item_name: str
    current_stock: float
    min_threshold: float = 10.0
    reorder_quantity: float = 50.0
    unit_cost: float
    category: Optional[str] = "General"


class IngestionSummary(BaseModel):
    document_type: DocumentType
    source_filename: str
    success: bool
    total_records: int
    valid_records: int
    discrepancy_records: int
    verification_status: VerificationStatus
    discrepancy_logs: List[str] = Field(default_factory=list)
