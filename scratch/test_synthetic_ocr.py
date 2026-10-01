"""
Step 6: Synthetic image OCR test.
Generates a clean PIL text image, saves it, then runs the full
extract_text_from_image_or_pdf pipeline on it.
If this fails, the bug is still in plumbing. If it passes, the pipeline is correct.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw, ImageFont

# 1. Generate a synthetic clean text image
test_text = (
    "SME Invoice Test\n"
    "Invoice No: TEST-001\n"
    "Supplier: Test Vendor Ltd\n"
    "Date: 2026-09-08\n"
    "Item A | 10 | 50.00 | 500.00\n"
    "Subtotal: 500.00\n"
    "Tax: 90.00\n"
    "Grand Total: 590.00"
)

img_width, img_height = 800, 400
img = Image.new("RGB", (img_width, img_height), color=(255, 255, 255))
draw = ImageDraw.Draw(img)

# Use default font (always available)
try:
    font = ImageFont.truetype("arial.ttf", 22)
except Exception:
    font = ImageFont.load_default()

y_pos = 20
for line in test_text.split("\n"):
    draw.text((30, y_pos), line, fill=(0, 0, 0), font=font)
    y_pos += 40

test_image_path = os.path.join(os.path.dirname(__file__), "synthetic_ocr_test.png")
img.save(test_image_path, format="PNG")
print(f"[SYNTH] Saved test image: {test_image_path}")
print(f"[SYNTH] Image size: {img.size}")

# 2. Verify magic bytes
with open(test_image_path, "rb") as f:
    magic = f.read(4)
print(f"[SYNTH] Magic bytes: {magic!r} — PNG check: {magic == b'\\x89PNG'}")

# 3. Run the full OCR pipeline
print("\n[PIPELINE] Running extract_text_from_image_or_pdf...")
from src.ingestion.digitalizer import SMEDigitalizerEngine
_eng = SMEDigitalizerEngine.__new__(SMEDigitalizerEngine)
_eng.db_path = ":memory:"

result = _eng.extract_text_from_image_or_pdf(test_image_path)

print("\n" + "="*60)
print("RAW OCR OUTPUT:")
print("="*60)
print(result)
print("="*60)

if "TEST-001" in result or "Invoice" in result or "Subtotal" in result:
    print("\n[PASS] OCR pipeline correctly extracted text from synthetic image.")
elif "[NOTE: OCR_FALLBACK" in result:
    print("\n[FAIL] All OCR engines failed — fell back to template. Check EasyOCR install.")
else:
    print("\n[PARTIAL] OCR ran but may have low accuracy on synthetic image.")
