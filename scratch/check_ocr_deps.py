"""Check which OCR engines are available."""
import subprocess, sys, os

results = {}

# PIL
try:
    from PIL import Image
    results['PIL'] = 'OK'
except Exception as e:
    results['PIL'] = f'FAIL: {e}'

# EasyOCR
try:
    import easyocr
    results['easyocr'] = 'OK'
except Exception as e:
    results['easyocr'] = f'FAIL: {e}'

# Tesseract
tess_found = None
for cmd in ['tesseract', r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe']:
    try:
        r = subprocess.run([cmd, '--version'], capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            tess_found = cmd
            results['tesseract'] = f'OK at {cmd!r}: ' + (r.stdout or r.stderr).splitlines()[0]
            break
    except FileNotFoundError:
        continue
    except Exception as e:
        results[f'tesseract({cmd})'] = f'FAIL: {e}'
if not tess_found:
    results['tesseract'] = 'FAIL: not found in PATH or default locations'

# WinRT script
ps_path = os.path.join('src', 'ingestion', 'win_ocr.ps1')
results['winrt_script'] = 'OK' if os.path.exists(ps_path) else f'FAIL: not found at {ps_path}'

for k, v in results.items():
    print(f'[{k}] {v}')
