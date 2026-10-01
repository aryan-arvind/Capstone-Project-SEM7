import sqlite3, json, sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

db = 'data/ingestion_standalone.db'
conn = sqlite3.connect(db)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
print('========================================================================')
print(f'Database file: {db}')
print('Tables present:', tables)
print('========================================================================')

for t in tables:
    cursor.execute(f'SELECT count(*) FROM {t}')
    cnt = cursor.fetchone()[0]
    print(f'Table [{t}]: {cnt} total rows')

print('\n' + '='*70)
print('TABLE: import_batch')
print('='*70)
cursor.execute('SELECT * FROM import_batch')
cols = [d[0] for d in cursor.description]
print('Columns:', cols)
for r in cursor.fetchall():
    print(dict(zip(cols, r)))

print('\n' + '='*70)
print('TABLE: staged_records')
print('='*70)
cursor.execute('SELECT id, import_batch_id, row_number, validation_status, committed FROM staged_records')
for r in cursor.fetchall():
    print(f'Record #{r[0]}: batch_id={r[1]} | row={r[2]} | status={r[3]} | committed={r[4]}')

if 'invoices' in tables:
    print('\n' + '='*70)
    print('TABLE: invoices (Live Operational Table)')
    print('='*70)
    cursor.execute('SELECT invoice_id, supplier_name, date, grand_total, verification_status FROM invoices')
    rows = cursor.fetchall()
    if rows:
        for r in rows:
            print(f'Invoice: {r[0]} | Supplier: {r[1]} | Date: {r[2]} | Total: ₹{r[3]:,.2f} | Status: {r[4]}')
    else:
        print('(No rows committed to invoices table yet)')

if 'inventory_items' in tables:
    print('\n' + '='*70)
    print('TABLE: inventory_items (Live Operational Table)')
    print('='*70)
    cursor.execute('SELECT item_id, item_name, current_stock, unit_cost FROM inventory_items')
    rows = cursor.fetchall()
    if rows:
        for r in rows:
            print(f'Item: {r[0]} | Name: {r[1]} | Stock: {r[2]} | Cost: ₹{r[3]:,.2f}')
    else:
        print('(No rows committed to inventory_items table yet)')

conn.close()
