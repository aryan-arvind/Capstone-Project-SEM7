"""
Step 5: Run OCR on the real receipt images in data/.
Prints raw pytesseract/EasyOCR output BEFORE any downstream parsing.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.ingestion.digitalizer import SMEDigitalizerEngine

_eng = SMEDigitalizerEngine.__new__(SMEDigitalizerEngine)
_eng.db_path = ":memory:"

receipt_images = [
    os.path.join("data", "ocr_59d3e96288ec6c9d.jpg"),   # smaller receipt
    os.path.join("data", "ocr_9cb6853263e7f86f.jpg"),   # another receipt
    os.path.join("data", "ocr_22f2c4dffcaf023d.jpg"),   # larger image
    os.path.join("data", "1391982_20190304094004_img_20190304_093425.jpg"),
]

for img_path in receipt_images:
    if not os.path.exists(img_path):
        print(f"[SKIP] Not found: {img_path}")
        continue

    size = os.path.getsize(img_path)
    print(f"\n{'='*70}")
    print(f"FILE: {os.path.basename(img_path)}  ({size} bytes)")
    print(f"{'='*70}")

    # Magic byte check
    with open(img_path, "rb") as f:
        magic = f.read(4)
    is_jpeg = magic[:2] == b"\xff\xd8"
    print(f"Magic: {magic!r}  JPEG={is_jpeg}")

    print("\n--- RAW OCR OUTPUT ---")
    result = _eng.extract_text_from_image_or_pdf(img_path)
    print(result)
    print("--- END OCR OUTPUT ---")
