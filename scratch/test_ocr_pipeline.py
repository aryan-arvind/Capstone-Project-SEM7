"""
Standalone OCR pipeline test — verifies PIL downscale + EasyOCR chain.
Run: python scratch/test_ocr_pipeline.py
"""
import sys, os, hashlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

IMAGE_PATH = r"d:\ARYAN ACADEMIC\SEM7\Capstone Project\data\1391982_20190304094004_img_20190304_093425.jpg"

print("=" * 60)
print("OCR PIPELINE TEST")
print("=" * 60)

# 1. Hash the raw bytes
with open(IMAGE_PATH, "rb") as f:
    raw = f.read()
fhash = hashlib.sha256(raw).hexdigest()
print(f"[1] File     : {os.path.basename(IMAGE_PATH)}")
print(f"[1] SHA-256  : {fhash}")
print(f"[1] Size     : {len(raw):,} bytes ({len(raw)/1024:.1f} KB)")

# 2. PIL downscale
from PIL import Image
img = Image.open(IMAGE_PATH).convert("RGB")
w, h = img.size
print(f"\n[2] Original dims : {w} x {h} px")

MAX_DIM = 2000
ds_path = IMAGE_PATH + "_ds.png"
if max(w, h) > MAX_DIM:
    ratio = MAX_DIM / max(w, h)
    nw, nh = int(w * ratio), int(h * ratio)
    img_ds = img.resize((nw, nh), Image.LANCZOS)
    img_ds.save(ds_path, format="PNG")
    print(f"[2] Downscaled to : {nw} x {nh} px → {ds_path}")
    ocr_path = ds_path
else:
    print(f"[2] No downscale needed (within 2000px)")
    ocr_path = IMAGE_PATH

# 3. EasyOCR
print(f"\n[3] Running EasyOCR on: {os.path.basename(ocr_path)}")
try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    results = reader.readtext(ocr_path, detail=0)
    text = "\n".join([r.strip() for r in results if r.strip()])
    print(f"[3] EasyOCR extracted {len(text)} chars\n")
    print("=" * 60)
    print("EXTRACTED TEXT:")
    print("=" * 60)
    print(text)
except Exception as e:
    print(f"[3] EasyOCR FAILED: {e}")
