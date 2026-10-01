"""
Test Pipeline Paths:
1. PDF file -> verifies mandatory direct_text_extraction path via pdfplumber.
2. Scanned image (Dell Invoice) -> verifies tuned EasyOCR + Indian B2B normalizer.
3. Scanned image (Vigil Safety) -> verifies tuned EasyOCR + Indian B2B normalizer.
"""
import sys, os
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.ingestion.digitalizer import SMEDigitalizerEngine

engine = SMEDigitalizerEngine(db_path=":memory:")

print("=" * 80)
print("  TEST 1: DIGITAL PDF FILE (Mandatory Direct Text Path)")
print("=" * 80)
pdf_path = "Master Project Blueprint (Review 2).pdf"
if os.path.exists(pdf_path):
    pdf_text = engine.extract_text_from_image_or_pdf(pdf_path)
    print(f"Extracted {len(pdf_text)} characters.")
    print("Preview of first 250 characters:")
    print("-" * 50)
    print(pdf_text[:250])
    print("-" * 50)
else:
    print(f"File {pdf_path} not found.")

print("\n" + "=" * 80)
print("  TEST 2: SCANNED INVOICE IMAGE (Dell International) - Tuned EasyOCR + Normalizer")
print("=" * 80)
dell_img = os.path.join("data", "invoice_dell_international.jpg")
if os.path.exists(dell_img):
    dell_text = engine.extract_text_from_image_or_pdf(dell_img)
    print(f"\nExtracted {len(dell_text)} characters.")
    print("Full Extracted & Normalized Text:")
    print("-" * 50)
    print(dell_text)
    print("-" * 50)
else:
    print(f"File {dell_img} not found.")

print("\n" + "=" * 80)
print("  TEST 3: SCANNED INVOICE IMAGE (Vigil Safety) - Tuned EasyOCR + Normalizer")
print("=" * 80)
vigil_img = os.path.join("data", "invoice_vigil_safety.jpg")
if os.path.exists(vigil_img):
    vigil_text = engine.extract_text_from_image_or_pdf(vigil_img)
    print(f"\nExtracted {len(vigil_text)} characters.")
    print("Preview of first 400 characters:")
    print("-" * 50)
    print(vigil_text[:400])
    print("-" * 50)
else:
    print(f"File {vigil_img} not found.")

print("\n" + "=" * 80)
print("  ALL TESTS COMPLETED!")
print("=" * 80)
