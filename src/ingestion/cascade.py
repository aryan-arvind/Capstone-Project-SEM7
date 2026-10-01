"""
4-Step Resolution Cascade Engine for Closed-Vocabulary Document Classification and Column Mapping.
Enforces deterministic gates to prevent silent schema drift.

Cascade Steps:
  Step A: Deterministic / Fuzzy ColumnResolver (confidence gate = 65)
  Step B: Filename and Structural Signal Heuristics
  Step C: LLM Fallback (Constrained to closed enum/keys)
  Step D: Manual Closed-Vocabulary Selection (st.selectbox)
"""

from typing import Dict, Any, List, Tuple, Optional
import sqlite3

from src.ingestion.column_resolver import ColumnResolver
from src.ingestion.schemas import DocumentType
from src.ingestion.heuristics import combine_heuristics

CASCADE_CONFIDENCE_THRESHOLD = 65  # Confidence floor for auto-acceptance without escalation


def needs_escalation(field_mapping: Dict[str, Any]) -> bool:
    """
    Checks if a column mapping requires escalation to heuristics / LLM / manual review.
    """
    return (
        field_mapping.get("suggested") is None
        or field_mapping.get("confidence", 0) < CASCADE_CONFIDENCE_THRESHOLD
        or field_mapping.get("ambiguous", False) is True
    )


def classify_document_type_llm(sample_rows: List[Dict[str, Any]], filename: str) -> Tuple[Optional[str], float]:
    """
    Step C LLM Fallback for Document Classification.
    Constrained strictly to DocumentType enum values: {INVOICE, INVENTORY_LIST, PURCHASE_ORDER, SALES_LOG}.
    
    Note: Stubbed for Review 2 to prevent network/API-key failure on critical path.
    Returns (None, 0.0) to fall through safely to Step D manual review.
    """
    # Designed interface: when live LLM package is connected, call structured tool output here.
    return None, 0.0


def suggest_field_mapping_llm(unmapped_column_name: str) -> Tuple[Optional[str], float]:
    """
    Step C LLM Fallback for Field Mapping.
    Constrained strictly to ColumnResolver.CANONICAL_MAPPINGS.keys().
    
    Note: Stubbed for Review 2 to prevent network/API-key failure on critical path.
    """
    return None, 0.0


def resolve_document_type_cascade(filename: str, resolved_columns: List[str]) -> Dict[str, Any]:
    """
    Runs the 4-step cascade to determine the document type for an uploaded file.
    Returns metadata detailing which step made the final classification.
    """
    # Step B: Heuristics Check (Filename + Column Structure)
    heuristic_type, confidence, is_ambiguous = combine_heuristics(filename, resolved_columns)
    
    if heuristic_type and confidence >= 0.70 and not is_ambiguous:
        return {
            "document_type": heuristic_type,
            "confidence": int(confidence * 100),
            "step_applied": "Step B (Heuristics)",
            "needs_manual_review": False
        }

    # Step C: LLM Fallback (attempted if enabled)
    llm_type, llm_conf = classify_document_type_llm([], filename)
    if llm_type and llm_conf >= 0.80:
        return {
            "document_type": llm_type,
            "confidence": int(llm_conf * 100),
            "step_applied": "Step C (LLM Classifier)",
            "needs_manual_review": False
        }

    # Step D: Fallback to Manual Selection
    default_guess = heuristic_type or "INVENTORY_LIST"
    return {
        "document_type": default_guess,
        "confidence": int(confidence * 100) if confidence else 50,
        "step_applied": "Step D (Manual Selection Required)",
        "needs_manual_review": True
    }


def register_new_canonical_field(
    new_field_name: str,
    business_id: int = 1,
    db_path: str = "data/sme_digitalized_data.db"
) -> Tuple[bool, str]:
    """
    Admin-only action: Registers a brand-new canonical field name.
    Validates name format, logs to schema_change_log in SQLite, and updates in-memory mapping.
    """
    normalized = ColumnResolver.normalize_header(new_field_name)
    if not normalized or len(normalized) < 2:
        return False, "Invalid field name format. Must be lowercase alphanumeric with underscores."

    if normalized in ColumnResolver.CANONICAL_MAPPINGS:
        return False, f"Field '{normalized}' is already registered as a canonical field."

    # Log to SQLite schema_change_log table
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_change_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_id INTEGER NOT NULL,
                field_name TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
        """)
        import datetime
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute(
            "INSERT INTO schema_change_log (business_id, field_name, timestamp) VALUES (?, ?, ?)",
            (business_id, normalized, ts)
        )
        conn.commit()
        conn.close()

        # Add to session canonical mapping dictionary
        ColumnResolver.CANONICAL_MAPPINGS[normalized] = [normalized]
        return True, f"Successfully registered new canonical field '{normalized}' for business #{business_id}."
    except Exception as e:
        return False, f"Database error registering field: {str(e)}"
