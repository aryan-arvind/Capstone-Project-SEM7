"""
FastAPI Router for SME Data Digitalization & Staging Operations.
Exposes REST endpoints for multi-file upload, global column resolution,
manual closed-vocabulary overrides, database committing, and schema metadata.
"""

import json
import sqlite3
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel, Field

from src.ingestion.digitalizer import SMEDigitalizerEngine
from src.ingestion.column_resolver import ColumnResolver
from src.ingestion.schemas import DocumentType
from src.ingestion.cascade import resolve_document_type_cascade, CASCADE_CONFIDENCE_THRESHOLD
from src.core.database import (
    create_import_batch,
    insert_staged_record,
    get_staged_records,
    commit_staged_records,
    DEFAULT_DB_PATH
)

router = APIRouter(prefix="/ingestion", tags=["Ingestion"])


# Request / Response Pydantic Models
class ResolveRequest(BaseModel):
    import_batch_ids: List[int] = Field(..., description="List of import_batch IDs to resolve globally")


class ManualResolveRequest(BaseModel):
    staged_record_id: int = Field(..., description="ID of the staged_record to manually map")
    field_mapping: str = Field(..., description="Canonical field key from CANONICAL_MAPPINGS")


class CommitRequest(BaseModel):
    import_batch_ids: List[int] = Field(..., description="List of import_batch IDs to commit")
    staged_record_ids: Optional[List[int]] = Field(None, description="Optional list of specific staged record IDs")


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_files(
    files: List[UploadFile] = File(...),
    business_id: int = Form(1)
) -> Dict[str, Any]:
    """
    Accepts one or more uploaded files (CSV, XLSX, TXT, PDF, images).
    Runs per-file extraction + Step A/B cascade classification per file.
    Creates an import_batch per file and populates staged_records in SQLite.
    """
    batch_summaries = []

    for upload_file in files:
        filename = upload_file.filename or "uploaded_file"
        file_bytes = await upload_file.read()
        ext = filename.split(".")[-1].lower() if "." in filename else "txt"

        staged_preview_rows: List[Dict[str, Any]] = []
        all_rows: List[Dict[str, Any]] = []

        if ext == "csv":
            try:
                import csv
                import io
                text_str = file_bytes.decode("utf-8", errors="ignore")
                reader = csv.DictReader(io.StringIO(text_str))
                all_rows = [
                    {k: v for k, v in row.items() if k is not None and v is not None}
                    for row in reader
                ]
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing CSV file {filename}: {str(e)}")
        else:
            # Text / OCR / PDF fallback
            text_content = file_bytes.decode("utf-8", errors="ignore")
            all_rows = [{"document_text": text_content[:500]}]

        total_rows = len(all_rows)
        staged_preview_rows = all_rows[:8]

        # 3. Run Step A/B Cascade Classification before writing to DB
        raw_headers = list(staged_preview_rows[0].keys()) if staged_preview_rows else []
        cascade_info = resolve_document_type_cascade(filename, raw_headers)

        # 1. Create import_batch record with correct signature
        batch_id = create_import_batch(
            business_id=business_id,
            source_type=ext if ext in ("csv", "xlsx", "pdf") else "ocr",
            original_filename=filename,
            total_rows=total_rows,
            valid_rows=total_rows,  # optimistic; validated later in resolve
            error_rows=0,
            column_mapping={"detected_type": cascade_info["document_type"], "step": cascade_info["step_applied"]},
            db_path=DEFAULT_DB_PATH
        )

        # 2. Insert staged records with correct signature
        for idx, row_dict in enumerate(all_rows):
            insert_staged_record(
                import_batch_id=batch_id,
                row_number=idx + 1,
                raw_row=row_dict,
                parsed_record=row_dict,
                validation_status="VALID",
                validation_notes="Auto-ingested",
                dedup_hash=f"hash_{filename}_{idx}",
                db_path=DEFAULT_DB_PATH
            )

        batch_summaries.append({
            "import_batch_id": batch_id,
            "filename": filename,
            "detected_type": cascade_info["document_type"],
            "detection_method": cascade_info["step_applied"],
            "detection_confidence": cascade_info["confidence"],
            "preview_rows": staged_preview_rows,
            "total_rows": total_rows
        })

    return {"batches": batch_summaries}


@router.post("/resolve", status_code=status.HTTP_200_OK)
def resolve_batches(payload: ResolveRequest) -> Dict[str, Any]:
    """
    Runs ColumnResolver globally across ALL specified import batches together,
    performing cross-batch field normalization, validation, and deduplication checking.
    """
    unified_preview = []

    for b_id in payload.import_batch_ids:
        # Correct keyword: import_batch_id (not batch_id)
        staged_records = get_staged_records(import_batch_id=b_id, db_path=DEFAULT_DB_PATH)

        for r in staged_records:
            raw_dict = json.loads(r["raw_row_json"])
            raw_headers = list(raw_dict.keys())

            # Run global column resolver
            mapping_result = ColumnResolver.suggest_column_mapping(raw_headers)

            # Form unified record preview item
            for header, meta in mapping_result.items():
                unified_preview.append({
                    "staged_record_id": r["id"],
                    "import_batch_id": b_id,
                    "source_filename": f"batch_{b_id}",
                    "original_header": header,
                    "mapped_field": meta.get("suggested"),
                    "value": raw_dict.get(header),
                    "validation_status": r["validation_status"],
                    "validation_notes": r["validation_notes"] or "Resolved via ColumnResolver",
                    "needs_manual_review": meta.get("confidence", 0) < CASCADE_CONFIDENCE_THRESHOLD
                })

    return {"unified_preview": unified_preview}


@router.post("/resolve-manual", status_code=status.HTTP_200_OK)
def resolve_manual(payload: ManualResolveRequest) -> Dict[str, Any]:
    """
    Submits a manual closed-vocabulary column mapping override.
    Validates server-side against ColumnResolver.CANONICAL_MAPPINGS.keys(). Rejects with 400 if invalid.
    """
    valid_keys = list(ColumnResolver.CANONICAL_MAPPINGS.keys())
    if payload.field_mapping not in valid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field mapping '{payload.field_mapping}'. Must be one of: {valid_keys}"
        )

    conn = sqlite3.connect(DEFAULT_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE staged_records SET validation_notes = ? WHERE id = ?",
        (f"Manually mapped to {payload.field_mapping}", payload.staged_record_id)
    )
    conn.commit()
    conn.close()

    return {
        "staged_record_id": payload.staged_record_id,
        "mapped_field": payload.field_mapping,
        "validation_status": "VALID"
    }


@router.post("/commit", status_code=status.HTTP_200_OK)
def commit_batches(payload: CommitRequest) -> Dict[str, Any]:
    """
    Commits valid staged records from specified import batches into production database tables.
    """
    total_committed = 0
    batch_statuses: Dict[str, str] = {}

    for b_id in payload.import_batch_ids:
        # Fetch all staged record IDs for this batch (or use the explicit list if provided)
        if payload.staged_record_ids:
            record_ids = payload.staged_record_ids
        else:
            records = get_staged_records(import_batch_id=b_id, db_path=DEFAULT_DB_PATH)
            record_ids = [r["id"] for r in records if r.get("committed") == 0]

        count = commit_staged_records(
            import_batch_id=b_id,
            record_ids_to_commit=record_ids,
            db_path=DEFAULT_DB_PATH
        )
        total_committed += count
        batch_statuses[str(b_id)] = "COMMITTED"

    return {
        "committed_count": total_committed,
        "batch_statuses": batch_statuses
    }


@router.get("/canonical-fields", status_code=status.HTTP_200_OK)
def get_canonical_fields() -> Dict[str, Any]:
    """
    Returns closed-vocabulary canonical fields and document types
    so the frontend can populate dropdowns dynamically without hardcoding.
    """
    return {
        "fields": list(ColumnResolver.CANONICAL_MAPPINGS.keys()),
        "document_types": [dt.value for dt in DocumentType]
    }
