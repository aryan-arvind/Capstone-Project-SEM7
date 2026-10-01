"""
Before/After OCR comparison test.
Shows at each stage for the restaurant receipt AND the waybill:
  Stage 0: Raw EasyOCR on ORIGINAL image (no preprocessing)
  Stage 1: EasyOCR on PREPROCESSED image (preprocess log shown)
  Stage 2: Currency correction applied to Stage 1 output
  Stage 3: Arithmetic validation of the parsed receipt
"""
import sys
import os

# Force UTF-8 on Windows PowerShell console (avoids charmap encode errors)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.ingestion.digitalizer import SMEDigitalizerEngine

# Use in-memory DB so init_sqlite_tables() creates invoices/inventory tables
eng = SMEDigitalizerEngine(db_path=":memory:")

IMAGES = [
    ("RESTAURANT RECEIPT (clean printed)", "data/ocr_9cb6853263e7f86f.jpg"),
    ("WAYBILL (dense print, partial hand)", "data/1391982_20190304094004_img_20190304_093425.jpg"),
    ("R.G. IMPEX RECEIPT (low-res, garbled)", "data/ocr_59d3e96288ec6c9d.jpg"),
]


def run_easyocr_raw(img_path: str) -> str:
    """Run EasyOCR directly on original image, no preprocessing."""
    try:
        import easyocr
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        results = reader.readtext(img_path, detail=0)
        return "\n".join([r.strip() for r in results if r.strip()])
    except Exception as e:
        return f"EasyOCR failed: {e}"


def SEP(title: str, width: int = 70):
    print(f"\n{'='*width}")
    print(f"  {title}")
    print(f"{'='*width}")


for label, img_path in IMAGES:
    if not os.path.exists(img_path):
        print(f"[SKIP] {img_path} not found")
        continue

    SEP(f"IMAGE: {label}")
    print(f"File : {img_path}  ({os.path.getsize(img_path)} bytes)")

    with open(img_path, "rb") as f:
        raw_bytes = f.read()

    # ── STAGE 0: Raw EasyOCR, no preprocessing ──────────────────────────
    SEP("STAGE 0 — Raw EasyOCR (original image, no preprocessing)", 60)
    stage0_text = run_easyocr_raw(img_path)
    print(stage0_text)

    # ── STAGE 1: Full preprocessing → EasyOCR ───────────────────────────
    SEP("STAGE 1 — After preprocessing (upscale + grayscale + denoise + threshold + deskew)", 60)
    tmp_path = None
    stage1_text = ""
    try:
        tmp_path, prep_log = SMEDigitalizerEngine.preprocess_image_bytes_for_ocr(raw_bytes, img_path)
        print("Preprocessing log:")
        for k, v in prep_log.items():
            if k != "output":
                print(f"  {k}: {v}")

        import easyocr
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        results = reader.readtext(tmp_path, detail=0)
        stage1_text = "\n".join([r.strip() for r in results if r.strip()])
        print(f"\nEasyOCR on preprocessed image ({len(stage1_text)} chars):")
        print(stage1_text)
    except Exception as e:
        stage1_text = f"[PREPROCESSING FAILED: {e}]"
        print(stage1_text)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    # ── STAGE 2: Currency symbol post-processing ─────────────────────────
    SEP("STAGE 2 — After currency-symbol correction", 60)
    if stage1_text and not stage1_text.startswith("[PREPROCESSING"):
        corrected, corrections = SMEDigitalizerEngine.postprocess_currency_symbols(stage1_text)
        if corrections:
            print("Corrections made:")
            for c in corrections:
                print(f"  {c}")
        else:
            print("  No currency symbol corrections needed.")
        print(f"\nCorrected text ({len(corrected)} chars):")
        print(corrected)
    else:
        corrected = stage1_text
        print("  (skipped — no stage 1 output)")

    # ── STAGE 3: Arithmetic validation ────────────────────────────────────
    SEP("STAGE 3 — Arithmetic cross-validation", 60)
    try:
        invoice = eng.parse_text_invoice(corrected, source_filename=os.path.basename(img_path))

        print(f"Parsed invoice ID  : {invoice.invoice_id}")
        print(f"Supplier           : {invoice.supplier_name}")
        print(f"Extracted subtotal : {invoice.subtotal}")
        print(f"Extracted tax      : {invoice.tax_amount}")
        print(f"Extracted grand tot: {invoice.grand_total}")
        print(f"\nLine items ({len(invoice.line_items)}):")
        for item in invoice.line_items:
            arith_ok = abs(item.quantity * item.unit_price - item.line_total) < 0.02
            flag = "PASS" if arith_ok else "MISMATCH"
            print(f"  [{flag}] {item.item_name!r:40s}  "
                  f"qty={item.quantity}  price={item.unit_price}  total={item.line_total}  "
                  f"expected={round(item.quantity * item.unit_price, 2)}")

        arith_warnings = SMEDigitalizerEngine.validate_receipt_arithmetic(
            invoice.line_items,
            invoice.subtotal,
            invoice.tax_amount,
            invoice.grand_total,
            tolerance_pct=1.0,
        )
        print(f"\nArithmetic validation ({len(arith_warnings)} warning(s)):")
        if not arith_warnings:
            print("  ALL CHECKS PASSED")
        else:
            for w in arith_warnings:
                print(f"  [{w['level']}] {w['check']}")
                print(f"         {w['details']}")
    except Exception as e:
        print(f"  parse/validate failed: {e}")

    print()

print("\nDone.")
