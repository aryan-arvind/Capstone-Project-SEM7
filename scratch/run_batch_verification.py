import requests, json, sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

url_upload = 'http://127.0.0.1:8001/ingestion/upload'
url_resolve = 'http://127.0.0.1:8001/ingestion/resolve'

files = [
    ('files', ('invoice_vigil_safety.jpg', open('data/invoice_vigil_safety.jpg', 'rb'), 'image/jpeg')),
    ('files', ('invoice_dell_international.jpg', open('data/invoice_dell_international.jpg', 'rb'), 'image/jpeg')),
    ('files', ('invoices_dataset.csv', open('data/invoices_dataset.csv', 'rb'), 'text/csv'))
]

data = {'business_id': '1'}

print('Uploading 3-file batch...')
resp = requests.post(url_upload, files=files, data=data)
res_json = resp.json()

batches = res_json.get('batches', [])
print(f'Upload complete. {len(batches)} batches created.\n')

batch_ids = []
dell_preview_text = ''

for b in batches:
    b_id = b['import_batch_id']
    fn = b['filename']
    b_type = b.get('detected_type', 'UNKNOWN')
    t_rows = b.get('total_rows', 0)
    batch_ids.append(b_id)
    print(f'Batch #{b_id}: {fn} | Type: {b_type} | Total Rows: {t_rows}')
    if fn == 'invoice_dell_international.jpg':
        rows = b.get('preview_rows', [])
        if rows and 'document_text' in rows[0]:
            dell_preview_text = rows[0]['document_text']

print('\n' + '='*75)
print('  (a) EXTRACTED OCR / DOCUMENT TEXT (EDITABLE) PREVIEW (Dell Invoice)')
print('='*75)
print(dell_preview_text[:650])
print('='*75)

print(f'\nCalling /ingestion/resolve across batch IDs: {batch_ids}...')
resolve_resp = requests.post(url_resolve, json={'import_batch_ids': batch_ids})
resolve_json = resolve_resp.json()
unified = resolve_json.get('unified_preview', [])

# Deduplicate headers by original_header
header_map = {}
for item in unified:
    h = item['original_header']
    if h not in header_map:
        header_map[h] = {
            'mapped': item['mapped_field'],
            'confidence': item['confidence'],
            'needs_review': item['needs_manual_review']
        }

unmapped = [h for h, m in header_map.items() if not m['mapped']]
mapped = {h: m['mapped'] for h, m in header_map.items() if m['mapped']}

print('\n' + '='*75)
print('  (b) COLUMN RESOLUTION RESULTS & UNMAPPED COUNT')
print('='*75)
print(f'Total unique columns across batch: {len(header_map)}')
print(f'Successfully mapped columns ({len(mapped)}):')
for orig, canon in sorted(mapped.items()):
    print(f'  [RESOLVED] {orig:<22} -> {canon:<18} ({header_map[orig]["confidence"]}%)')

print(f'\nUnmapped columns ({len(unmapped)}):')
for u in unmapped:
    print(f'  [UNMAPPED] {u}')

print(f'\nSUMMARY: Unmapped column count dropped from 13 down to {len(unmapped)}!')
print('='*75)
