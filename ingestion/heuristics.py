"""
Heuristic Classifier for Document Types and Structural Signals.
Provides cheap, deterministic signal extraction from filenames and resolved column headers
before escalating to LLM or manual selection.
"""

import re
from typing import Dict, List, Tuple, Optional

FILENAME_TYPE_HINTS: Dict[str, List[str]] = {
    "INVOICE": [r"invoice", r"inv[-_]?\d", r"bill", r"receipt"],
    "PURCHASE_ORDER": [r"purchase[-_]?order", r"\bpo[-_]?\d", r"order"],
    "SALES_LOG": [r"sales", r"register", r"ledger"],
    "INVENTORY_LIST": [r"inventory", r"stock", r"catalog"],
}

STRUCTURAL_SIGNALS: Dict[str, List[str]] = {
    "INVOICE": ["gstin", "invoice_no", "invoice_id", "tax_amount", "grand_total", "subtotal", "freight"],
    "INVENTORY_LIST": ["current_stock", "reorder", "min_threshold", "unit_cost", "sku"],
    "PURCHASE_ORDER": ["po_number", "delivery_date", "vendor", "supplier_name"],
    "SALES_LOG": ["sale_date", "customer_name", "amount_paid"],
}


def guess_document_type_from_filename(filename: str) -> Tuple[Optional[str], float]:
    """
    Analyzes filename for regex patterns.
    Returns (DocumentType enum value string or None, confidence 0.0-1.0).
    """
    fname = filename.lower()
    for doc_type, patterns in FILENAME_TYPE_HINTS.items():
        if any(re.search(p, fname) for p in patterns):
            return doc_type, 0.7  # Heuristic confidence capped at 0.7
    return None, 0.0


def guess_document_type_from_columns(resolved_columns: List[str]) -> Tuple[Optional[str], float]:
    """
    Analyzes resolved canonical column headers for structural signals.
    Returns (DocumentType enum value string or None, confidence 0.0-1.0).
    """
    normalized_cols = [c.lower().replace(" ", "_") for c in resolved_columns]
    scores: Dict[str, int] = {dt: 0 for dt in STRUCTURAL_SIGNALS}
    
    for dt, signals in STRUCTURAL_SIGNALS.items():
        scores[dt] = sum(1 for s in signals if any(s in c for c in normalized_cols))
        
    best_dt = max(scores, key=scores.get) if scores else None
    if not best_dt or scores[best_dt] == 0:
        return None, 0.0
        
    confidence = min(0.6 + 0.1 * scores[best_dt], 0.85)
    return best_dt, confidence


def combine_heuristics(filename: str, resolved_columns: List[str]) -> Tuple[Optional[str], float, bool]:
    """
    Combines filename and column structural heuristics.
    Returns (suggested_doc_type, confidence, is_ambiguous).
    If filename and structural signals conflict, treats as ambiguous.
    """
    fname_type, fname_conf = guess_document_type_from_filename(filename)
    cols_type, cols_conf = guess_document_type_from_columns(resolved_columns)

    if fname_type and cols_type:
        if fname_type == cols_type:
            return fname_type, max(fname_conf, cols_conf), False
        else:
            # Disagreement between filename and column structure -> mark ambiguous
            return None, 0.0, True

    if fname_type:
        return fname_type, fname_conf, False

    if cols_type:
        return cols_type, cols_conf, False

    return None, 0.0, True
