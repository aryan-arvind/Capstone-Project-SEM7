"""
================================================================================
INTEGRATION NOTES (FOR FUTURE INTEGRATION STEP)
================================================================================
This standalone application runs the SME Data Digitalization module in full
isolation on Port 8001 using its own dedicated database (data/ingestion_standalone.db).

To integrate this module into a shared, centralized team FastAPI app later:
1. Do NOT run this standalone file. Instead, import `ingestion_router` from
   `src.ingestion.router` into the shared main API file (e.g. `src/api/main.py`).
2. Mount the router onto the shared FastAPI instance:
   `app.include_router(ingestion_router)`
3. Change `STANDALONE_DB_PATH` below or set `DEFAULT_DB_PATH` in `src.core.database`
   to point to the shared team database path (e.g. `data/sme_digitalized_data.db`).
4. Update frontend API client configuration (`VITE_API_BASE_URL`) to target the
   shared FastAPI server port (e.g. 8000).
================================================================================
"""

import os
import json
import sqlite3
import uvicorn
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.ingestion.digitalizer import SMEDigitalizerEngine
from src.ingestion.column_resolver import ColumnResolver
from src.ingestion.schemas import DocumentType
from src.ingestion.cascade import resolve_document_type_cascade, CASCADE_CONFIDENCE_THRESHOLD
from src.core.database import (
    init_db,
    create_import_batch,
    insert_staged_record,
    get_staged_records,
    commit_staged_records
)

# Isolated Standalone Database Path
STANDALONE_DB_PATH = os.path.join("data", "ingestion_standalone.db")
os.makedirs(os.path.dirname(os.path.abspath(STANDALONE_DB_PATH)), exist_ok=True)
init_db(STANDALONE_DB_PATH)

# Standalone FastAPI Application Instance
app = FastAPI(
    title="Standalone SME Data Digitalization API",
    description="Isolated API for multi-file upload, global column resolution, and database staging on Port 8001.",
    version="1.0.0"
)

# Enable CORS for standalone Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def warmup_ocr_models():
    """Pre-warm EasyOCR neural models in a background thread so first upload is fast."""
    import threading
    from src.ingestion.digitalizer import get_shared_easyocr_reader

    def _warm():
        try:
            get_shared_easyocr_reader()
        except Exception as _we:
            print(f"[OCR-WARMUP] Notice: {_we}", flush=True)

    threading.Thread(target=_warm, daemon=True).start()


# Pydantic Schemas
class ResolveRequest(BaseModel):
    import_batch_ids: List[int] = Field(..., description="List of import_batch IDs to resolve globally")
    vertical_overrides: Optional[Dict[int, str]] = Field(None, description="Optional manual vertical override per import_batch_id")


class ManualResolveRequest(BaseModel):
    staged_record_id: int = Field(..., description="ID of the staged_record to manually map")
    field_mapping: str = Field(..., description="Canonical field key from CANONICAL_MAPPINGS")


class CommitRequest(BaseModel):
    import_batch_ids: List[int] = Field(..., description="List of import_batch IDs to commit")
    staged_record_ids: Optional[List[int]] = Field(None, description="Optional list of specific staged record IDs")


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy", "service": "Standalone Ingestion API", "port": 8001}


@app.post("/ingestion/upload", status_code=status.HTTP_200_OK, tags=["Ingestion"])
async def upload_files(
    files: List[UploadFile] = File(...),
    business_id: int = Form(1)
) -> Dict[str, Any]:
    """
    Accepts one or more uploaded files (CSV, XLSX, TXT, PDF, images).
    Runs per-file extraction + Step A/B cascade classification per file.
    Creates an import_batch per file and populates staged_records in data/ingestion_standalone.db.
    """
    batch_summaries = []

    for upload_file in files:
        filename = upload_file.filename or "uploaded_file"
        file_bytes = await upload_file.read()
        ext = filename.split(".")[-1].upper() if "." in filename else "TXT"

        # 1. Create import_batch record in standalone DB
        source_type_val = "csv" if ext in ["CSV", "XLSX"] else "ocr"
        batch_id = create_import_batch(
            business_id=business_id,
            source_type=source_type_val,
            original_filename=filename,
            total_rows=0,
            valid_rows=0,
            error_rows=0,
            column_mapping={},
            db_path=STANDALONE_DB_PATH
        )

        # 2. Extract content & insert staged records
        staged_preview_rows = []
        total_rows = 0

        if ext == "CSV":
            try:
                import csv
                import io
                text_str = file_bytes.decode("utf-8", errors="ignore")
                reader = csv.DictReader(io.StringIO(text_str))
                rows = list(reader)
                total_rows = len(rows)

                for idx, row_dict in enumerate(rows):
                    cleaned_dict = {k: v for k, v in row_dict.items() if k is not None and v is not None}
                    insert_staged_record(
                        import_batch_id=batch_id,
                        row_number=idx + 1,
                        raw_row=cleaned_dict,
                        parsed_record=cleaned_dict,
                        validation_status="VALID",
                        validation_notes="Auto-ingested CSV row",
                        dedup_hash=f"hash_{filename}_{idx}",
                        db_path=STANDALONE_DB_PATH
                    )
                    if idx < 8:
                        staged_preview_rows.append(cleaned_dict)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing CSV file {filename}: {str(e)}")
        elif ext in ["PNG", "JPG", "JPEG", "WEBP"]:
            # ── Image OCR path ──────────────────────────────────────────
            # Magic-byte validation: JPEG starts with FF D8, PNG with 89 50 4E 47
            IMAGE_MAGIC = {
                "JPEG": (b"\xff\xd8",),
                "JPG":  (b"\xff\xd8",),
                "PNG":  (b"\x89PNG",),
                "WEBP": (b"RIFF",),
            }
            magic_ok = False
            for magic in IMAGE_MAGIC.get(ext, []):
                if file_bytes[:len(magic)] == magic:
                    magic_ok = True
                    break

            if not magic_ok:
                ocr_text = f"OCR failed: file {filename!r} does not have valid image magic bytes for extension .{ext.lower()}. Got: {file_bytes[:8]!r}"
                doc_dict = {"document_text": ocr_text}
                insert_staged_record(
                    import_batch_id=batch_id,
                    row_number=1,
                    raw_row=doc_dict,
                    parsed_record=doc_dict,
                    validation_status="ERROR",
                    validation_notes=ocr_text,
                    dedup_hash=f"hash_{filename}_0",
                    db_path=STANDALONE_DB_PATH
                )
                staged_preview_rows.append(doc_dict)
                total_rows = 1
            else:
                # Write to a temp file so digitalizer can open it with PIL
                import tempfile, io as _io
                _suffix = f".{ext.lower()}"
                ocr_text = ""
                ocr_error = ""
                try:
                    with tempfile.NamedTemporaryFile(suffix=_suffix, delete=False) as _tmp:
                        _tmp.write(file_bytes)
                        _tmp_path = _tmp.name

                    # Validate file can be opened by PIL before OCR
                    from PIL import Image as _PILCheck
                    try:
                        _pil_check = _PILCheck.open(_io.BytesIO(file_bytes))
                        _pil_check.verify()  # checks for corruption
                    except Exception as _pil_e:
                        raise ValueError(f"PIL could not open image: {_pil_e}")

                    # Run the full OCR cascade from digitalizer
                    from src.ingestion.digitalizer import SMEDigitalizerEngine
                    _eng = SMEDigitalizerEngine.__new__(SMEDigitalizerEngine)
                    _eng.db_path = STANDALONE_DB_PATH
                    ocr_text = _eng.extract_text_from_image_or_pdf(_tmp_path)
                    if not ocr_text.startswith("OCR failed:"):
                        ocr_text, _ = SMEDigitalizerEngine.normalize_indian_b2b_invoice_text(ocr_text)

                except Exception as _ocr_err:
                    ocr_error = f"OCR failed: {_ocr_err}"
                    ocr_text = ocr_error
                finally:
                    import os as _os
                    try:
                        _os.unlink(_tmp_path)
                    except Exception:
                        pass

                if ocr_text.startswith("OCR failed:"):
                    validation_status = "ERROR"
                    validation_notes = ocr_text[:200]
                    doc_dict = {"document_text": ocr_text[:1000]}
                else:
                    struct_fields, struct_warnings = SMEDigitalizerEngine.extract_structured_fields_from_text(ocr_text)
                    validation_status = "WARNING" if struct_warnings else "VALID"
                    validation_notes = "; ".join(struct_warnings) if struct_warnings else "Image OCR structured fields extracted & normalized"
                    doc_dict = {
                        **struct_fields,
                        "document_text": ocr_text[:1000],
                        "verification_status": "VALIDATED" if validation_status == "VALID" else "DISCREPANCY_FLAGGED"
                    }

                insert_staged_record(
                    import_batch_id=batch_id,
                    row_number=1,
                    raw_row=doc_dict,
                    parsed_record=doc_dict,
                    validation_status=validation_status,
                    validation_notes=validation_notes,
                    dedup_hash=f"hash_{filename}_0",
                    db_path=STANDALONE_DB_PATH
                )
                staged_preview_rows.append(doc_dict)
                total_rows = 1

        elif ext in ["TXT", "PDF"]:
            # ── Plain text / PDF ────────────────────────────────────────
            try:
                if ext == "PDF":
                    import tempfile, io as _io
                    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as _tmp:
                        _tmp.write(file_bytes)
                        _tmp_path = _tmp.name
                    try:
                        from src.ingestion.digitalizer import SMEDigitalizerEngine
                        _eng = SMEDigitalizerEngine.__new__(SMEDigitalizerEngine)
                        _eng.db_path = STANDALONE_DB_PATH
                        text_content = _eng.extract_text_from_image_or_pdf(_tmp_path)
                        text_content, _ = SMEDigitalizerEngine.normalize_indian_b2b_invoice_text(text_content)
                    finally:
                        import os as _os
                        try:
                            _os.unlink(_tmp_path)
                        except Exception:
                            pass
                else:
                    text_content = file_bytes.decode("utf-8", errors="ignore")
                    from src.ingestion.digitalizer import SMEDigitalizerEngine
                    text_content, _ = SMEDigitalizerEngine.normalize_indian_b2b_invoice_text(text_content)
            except Exception as _txt_e:
                text_content = f"Text extraction failed: {_txt_e}"

            if text_content.startswith("Text extraction failed:"):
                val_status = "ERROR"
                val_notes = text_content[:200]
                doc_dict = {"document_text": text_content[:1000]}
            else:
                from src.ingestion.digitalizer import SMEDigitalizerEngine
                struct_fields, struct_warnings = SMEDigitalizerEngine.extract_structured_fields_from_text(text_content)
                val_status = "WARNING" if struct_warnings else "VALID"
                val_notes = "; ".join(struct_warnings) if struct_warnings else "Document text structured fields extracted"
                doc_dict = {
                    **struct_fields,
                    "document_text": text_content[:1000],
                    "verification_status": "VALIDATED" if val_status == "VALID" else "DISCREPANCY_FLAGGED"
                }

            insert_staged_record(
                import_batch_id=batch_id,
                row_number=1,
                raw_row=doc_dict,
                parsed_record=doc_dict,
                validation_status=val_status,
                validation_notes=val_notes,
                dedup_hash=f"hash_{filename}_0",
                db_path=STANDALONE_DB_PATH
            )
            staged_preview_rows.append(doc_dict)
            total_rows = 1

        else:
            # Unknown extension — store as UTF-8 text best-effort
            text_content = file_bytes.decode("utf-8", errors="ignore")
            doc_dict = {"document_text": text_content[:500]}
            insert_staged_record(
                import_batch_id=batch_id,
                row_number=1,
                raw_row=doc_dict,
                parsed_record=doc_dict,
                validation_status="WARNING",
                validation_notes=f"Unknown extension .{ext.lower()} — treated as plain text",
                dedup_hash=f"hash_{filename}_0",
                db_path=STANDALONE_DB_PATH
            )
            staged_preview_rows.append(doc_dict)
            total_rows = 1

        # 3. Run Step A/B Cascade Classification
        raw_headers = list(staged_preview_rows[0].keys()) if staged_preview_rows else []
        cascade_info = resolve_document_type_cascade(filename, raw_headers)

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


@app.post("/ingestion/resolve", status_code=status.HTTP_200_OK, tags=["Ingestion"])
def resolve_batches(payload: ResolveRequest) -> Dict[str, Any]:
    """
    Runs multi-tier ColumnResolver globally across ALL specified import batches together:
      1. Core canonical resolution
      2. Authoritative vertical detection (majority HSN chapter or manual override)
      3. Extension resolution (Food, Fashion, Electronics)
      4. Noise-filtered catch-all attributes JSON
    """
    unified_preview = []
    seen_dedup_hashes = set()
    batch_verticals: Dict[int, str] = {}

    conn = sqlite3.connect(STANDALONE_DB_PATH)
    cursor = conn.cursor()

    for b_id in payload.import_batch_ids:
        staged_records = get_staged_records(import_batch_id=b_id, db_path=STANDALONE_DB_PATH)
        if not staged_records:
            continue

        batch_raw_rows = [json.loads(r["raw_row_json"]) for r in staged_records]

        # Collect ordered unique column headers for this batch
        batch_headers: List[str] = []
        for r_dict in batch_raw_rows:
            for col_name in r_dict.keys():
                if col_name not in batch_headers:
                    batch_headers.append(col_name)

        explicit_vertical = (payload.vertical_overrides or {}).get(b_id)

        # Multi-tier resolution
        mapping_result, raw_to_canonical, detected_vertical = ColumnResolver.resolve_columns_multi_tier(
            raw_columns=batch_headers,
            raw_rows=batch_raw_rows,
            explicit_vertical=explicit_vertical
        )

        batch_verticals[b_id] = detected_vertical

        # Update detected_vertical on import_batch in the DB
        cursor.execute("UPDATE import_batch SET detected_vertical = ? WHERE id = ?", (detected_vertical, b_id))

        # Check for SKU deduplication if item_id was mapped
        item_id_raw_col = None
        for raw_c, can_f in raw_to_canonical.items():
            if can_f == "item_id":
                item_id_raw_col = raw_c
                break

        for r, raw_dict in zip(staged_records, batch_raw_rows):
            sku_val = raw_dict.get(item_id_raw_col) if item_id_raw_col else None
            is_dup = False
            if sku_val:
                if sku_val in seen_dedup_hashes:
                    is_dup = True
                else:
                    seen_dedup_hashes.add(sku_val)

            val_status = "DUPLICATE" if is_dup else r["validation_status"]
            val_notes = (
                f"Cross-file duplicate SKU '{sku_val}' detected across batches"
                if is_dup
                else (r["validation_notes"] or f"Resolved via multi-tier ColumnResolver ({detected_vertical})")
            )

            # Build parsed_dict and row_attrs (combining extension fields & catch-all attributes)
            parsed_dict: Dict[str, Any] = {}
            row_attrs: Dict[str, Any] = {}

            for raw_col, val in raw_dict.items():
                canon = raw_to_canonical.get(raw_col)
                if canon and canon != "[system]":
                    if canon.startswith("attr:"):
                        attr_name = canon[5:]
                        row_attrs[attr_name] = val
                    elif canon in ColumnResolver.DOMAIN_EXTENSIONS.get(detected_vertical, {}):
                        # Extension field - store in parsed_dict AND fold into row_attrs
                        parsed_dict[canon] = val
                        row_attrs[canon] = val
                    else:
                        # Core field
                        parsed_dict[canon] = val

            parsed_dict["attributes"] = row_attrs

            # Update staged_records with parsed_record_json and attributes column
            cursor.execute(
                "UPDATE staged_records SET parsed_record_json = ?, attributes = ?, validation_status = ?, validation_notes = ? WHERE id = ?",
                (json.dumps(parsed_dict), json.dumps(row_attrs), val_status, val_notes, r["id"])
            )

            # Emit one entry per RAW COLUMN
            for raw_col in batch_headers:
                if raw_col not in raw_dict:
                    continue
                canonical_field = raw_to_canonical.get(raw_col)
                col_confidence = 0
                col_needs_review = True

                if canonical_field:
                    if canonical_field == "[system]" or canonical_field.startswith("attr:"):
                        col_confidence = 100
                        col_needs_review = False
                    else:
                        meta = mapping_result.get(canonical_field, {})
                        col_confidence = meta.get("confidence", 0)
                        col_needs_review = col_confidence < CASCADE_CONFIDENCE_THRESHOLD

                unified_preview.append({
                    "staged_record_id": r["id"],
                    "import_batch_id": b_id,
                    "source_filename": f"batch_{b_id}",
                    "original_header": raw_col,
                    "mapped_field": canonical_field,
                    "value": raw_dict.get(raw_col),
                    "confidence": col_confidence,
                    "validation_status": val_status,
                    "validation_notes": val_notes,
                    "needs_manual_review": col_needs_review,
                    "detected_vertical": detected_vertical
                })

    conn.commit()
    conn.close()

    return {
        "unified_preview": unified_preview,
        "batch_verticals": batch_verticals
    }


@app.post("/ingestion/resolve-manual", status_code=status.HTTP_200_OK, tags=["Ingestion"])
def resolve_manual(payload: ManualResolveRequest) -> Dict[str, Any]:
    """
    Submits a manual closed-vocabulary column mapping override.
    Validates server-side against CORE_CANONICAL_MAPPINGS + DOMAIN_EXTENSIONS or attr:<name>.
    """
    valid_keys = list(ColumnResolver.CORE_CANONICAL_MAPPINGS.keys())
    for ext_dict in ColumnResolver.DOMAIN_EXTENSIONS.values():
        valid_keys.extend(ext_dict.keys())

    if payload.field_mapping not in valid_keys and not payload.field_mapping.startswith("attr:"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field mapping '{payload.field_mapping}'. Must be one of: {valid_keys} or attr:<name>"
        )

    conn = sqlite3.connect(STANDALONE_DB_PATH)
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


@app.post("/ingestion/commit", status_code=status.HTTP_200_OK, tags=["Ingestion"])
def commit_batches(payload: CommitRequest) -> Dict[str, Any]:
    """
    Commits valid staged records from specified import batches into production database tables in data/ingestion_standalone.db.
    """
    total_committed = 0
    batch_statuses: Dict[str, str] = {}

    for b_id in payload.import_batch_ids:
        if payload.staged_record_ids:
            record_ids = payload.staged_record_ids
        else:
            records = get_staged_records(import_batch_id=b_id, db_path=STANDALONE_DB_PATH)
            record_ids = [r["id"] for r in records if r.get("committed") == 0]

        count = commit_staged_records(
            import_batch_id=b_id,
            record_ids_to_commit=record_ids,
            db_path=STANDALONE_DB_PATH
        )
        total_committed += count
        batch_statuses[str(b_id)] = "COMMITTED"

    return {
        "committed_count": total_committed,
        "batch_statuses": batch_statuses
    }


@app.get("/ingestion/canonical-fields", status_code=status.HTTP_200_OK, tags=["Ingestion"])
def get_canonical_fields() -> Dict[str, Any]:
    """
    Returns closed-vocabulary canonical fields, domain extension sets, and document types.
    """
    all_fields = list(ColumnResolver.CORE_CANONICAL_MAPPINGS.keys())
    for v_dict in ColumnResolver.DOMAIN_EXTENSIONS.values():
        for f in v_dict.keys():
            if f not in all_fields:
                all_fields.append(f)

    return {
        "fields": all_fields,
        "core_fields": list(ColumnResolver.CORE_CANONICAL_MAPPINGS.keys()),
        "domain_extensions": ColumnResolver.DOMAIN_EXTENSIONS,
        "available_verticals": list(ColumnResolver.DOMAIN_EXTENSIONS.keys()) + ["general"],
        "document_types": [dt.value for dt in DocumentType]
    }


if __name__ == "__main__":
    uvicorn.run("src.ingestion.standalone_app:app", host="127.0.0.1", port=8001, reload=True)
