import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from './config';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BatchSummary {
  import_batch_id: number;
  filename: string;
  detected_type: string;
  detection_method: string;
  detection_confidence: number;
  preview_rows: Record<string, string>[];
  total_rows: number;
}

interface UnifiedItem {
  staged_record_id: number;
  import_batch_id: number;
  source_filename: string;
  original_header: string;
  mapped_field: string | null;
  value: unknown;
  validation_status: 'VALID' | 'WARNING' | 'ERROR' | 'DUPLICATE';
  validation_notes: string;
  needs_manual_review: boolean;
}

type DocTypeKey = 'inventory' | 'invoice' | 'ocr' | 'mixed';
type Step = 1 | 2 | 3 | 4;

const SYSTEM_METADATA_COLS = new Set(['document_text', 'verification_status', '[system]']);

const DOC_TYPES: { key: DocTypeKey; label: string; icon: string; exts: string; accept: string; description: string }[] = [
  {
    key: 'inventory',
    label: 'Inventory / Stock CSV',
    icon: '📦',
    exts: '.csv  .xlsx',
    accept: '.csv,.xlsx',
    description: 'Item master, stock sheets, purchase order lines',
  },
  {
    key: 'invoice',
    label: 'Invoice / Purchase Order',
    icon: '🧾',
    exts: '.txt  .pdf',
    accept: '.txt,.pdf',
    description: 'B2B invoices, supplier bills, PO documents',
  },
  {
    key: 'ocr',
    label: 'Scanned / OCR Text',
    icon: '🔍',
    exts: '.txt  .png  .jpg',
    accept: '.txt,.png,.jpg,.jpeg',
    description: 'Paper receipts, handwritten notes, camera scans',
  },
  {
    key: 'mixed',
    label: 'Mixed Batch',
    icon: '📂',
    exts: 'all types',
    accept: '.csv,.xlsx,.txt,.pdf,.png,.jpg,.jpeg',
    description: 'Multiple file types — auto-classified per file',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileExt(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

function chipClass(ext: string): string {
  if (['csv', 'xlsx'].includes(ext)) return 'chip-csv';
  if (ext === 'pdf') return 'chip-pdf';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'chip-other';
  if (ext === 'txt') return 'chip-txt';
  return 'chip-other';
}

function badgeClass(status: string): string {
  if (status === 'VALID') return 'badge badge-valid';
  if (status === 'WARNING') return 'badge badge-warning';
  if (status === 'ERROR') return 'badge badge-error';
  if (status === 'DUPLICATE') return 'badge badge-duplicate';
  return 'badge badge-valid';
}

function stepDone(current: Step, s: Step) { return current > s; }
function stepActive(current: Step, s: Step) { return current === s; }

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Select Data Type' },
    { n: 2, label: 'Upload & Ingest' },
    { n: 3, label: 'Resolve & Map' },
    { n: 4, label: 'Commit to DB' },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <div className="logo-icon">D</div>
          <div>
            <div className="logo-text">SME Digitalize</div>
            <div className="logo-sub">Ingestion Pipeline</div>
          </div>
        </div>
      </div>
      <div className="sidebar-section-label" style={{ marginBottom: 12 }}>Pipeline Steps</div>
      {steps.map(({ n, label }) => (
        <div
          key={n}
          className={`sidebar-step ${stepActive(step, n) ? 'active' : ''} ${stepDone(step, n) ? 'done' : ''}`}
        >
          <div className="step-num">{stepDone(step, n) ? '✓' : n}</div>
          {label}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 20px' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <div>Backend: <span style={{ color: 'var(--green)' }}>port 8001</span></div>
          <div>DB: ingestion_standalone.db</div>
          <div style={{ marginTop: 8, color: 'var(--accent)' }}>
            <a href={`${API_BASE}/docs`} target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>
              API Docs →
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Stepper (top bar) ────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Data Type' },
    { n: 2, label: 'Ingest' },
    { n: 3, label: 'Resolve' },
    { n: 4, label: 'Commit' },
  ];
  return (
    <div className="stepper">
      {steps.map(({ n, label }, i) => (
        <React.Fragment key={n}>
          <div className="stepper-item">
            <div className={`stepper-node ${stepActive(step, n) ? 'active' : ''} ${stepDone(step, n) ? 'done' : ''}`}>
              {stepDone(step, n) ? '✓' : n}
            </div>
            <div className={`stepper-label ${stepActive(step, n) ? 'active' : ''} ${stepDone(step, n) ? 'done' : ''}`}>
              {label}
            </div>
          </div>
          {i < steps.length - 1 && <div className={`stepper-line ${stepDone(step, steps[i + 1].n) || step > n ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export const DigitalizationPage: React.FC = () => {
  const [step, setStep] = useState<Step>(1);
  const [selectedDocType, setSelectedDocType] = useState<DocTypeKey>('mixed');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [unifiedPreview, setUnifiedPreview] = useState<UnifiedItem[]>([]);
  const [canonicalFields, setCanonicalFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [commitResult, setCommitResult] = useState<{ count: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState({ VALID: true, WARNING: true, ERROR: true, DUPLICATE: true });
  const [verticalOverrides, setVerticalOverrides] = useState<Record<number, string>>({});
  const [batchVerticals, setBatchVerticals] = useState<Record<number, string>>({});

  // Fetch vocabulary on mount
  useEffect(() => {
    fetch(`${API_BASE}/ingestion/canonical-fields`)
      .then(r => r.json())
      .then(d => { if (d.fields) setCanonicalFields(d.fields); })
      .catch(() => {});
  }, []);

  const currentDocType = DOC_TYPES.find(d => d.key === selectedDocType)!;

  // ── File Selection ──
  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !existing.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => setPendingFiles(prev => prev.filter(f => f.name !== name));

  // ── Step 2: Upload ──
  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setLoading(true);

    const hasImages = pendingFiles.some(f => /\.(png|jpe?g|webp)$/i.test(f.name));
    setLoadingMsg(hasImages ? 'Uploading files & preparing OCR...' : 'Uploading and parsing files...');

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 3;
      if (elapsed === 3) {
        setLoadingMsg(hasImages ? 'Running neural OCR & layout detection...' : 'Validating tabular schema...');
      } else if (elapsed === 6) {
        setLoadingMsg(hasImages ? 'Extracting statutory GSTIN, totals & items...' : 'Staging records...');
      } else if (elapsed >= 9) {
        setLoadingMsg('Finalizing extraction batch...');
      }
    }, 3000);

    const formData = new FormData();
    pendingFiles.forEach(f => formData.append('files', f));
    formData.append('business_id', '1');

    try {
      const res = await fetch(`${API_BASE}/ingestion/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.batches) {
        setBatches(data.batches);
        setStep(3);
      }
    } catch {
      alert('Upload failed — is the backend running on port 8001?');
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingMsg('');
    }
  };

  // ── Step 3: Resolve ──
  const handleResolve = async (overrides?: Record<number, string>) => {
    setLoading(true);
    setLoadingMsg('Running 3-tier domain-agnostic resolution cascade...');
    const batchIds = batches.map(b => b.import_batch_id);

    // Guard against React SyntheticEvent / MouseEvent passed by onClick={handleResolve}
    const isCleanDict = overrides && typeof overrides === 'object' && !('nativeEvent' in overrides) && !('_reactName' in overrides);
    const activeOverrides = isCleanDict ? overrides : verticalOverrides;

    try {
      const res = await fetch(`${API_BASE}/ingestion/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_batch_ids: batchIds,
          vertical_overrides: Object.keys(activeOverrides).length > 0 ? activeOverrides : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Resolve failed: ${err.detail || res.statusText || 'Server error'}`);
        return;
      }
      const data = await res.json();
      if (data.unified_preview) {
        setUnifiedPreview(data.unified_preview);
      }
      if (data.batch_verticals) {
        setBatchVerticals(data.batch_verticals);
      }
    } catch (err: any) {
      console.error('Resolve error:', err);
      alert(`Resolve failed: ${err?.message || 'Network error'}`);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleManualOverride = async (stagedRecordId: number, fieldMapping: string) => {
    try {
      const res = await fetch(`${API_BASE}/ingestion/resolve-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staged_record_id: stagedRecordId, field_mapping: fieldMapping }),
      });
      const data = await res.json();
      if (data.mapped_field) {
        setUnifiedPreview(prev =>
          prev.map(item =>
            item.staged_record_id === stagedRecordId
              ? { ...item, mapped_field: data.mapped_field, validation_status: 'VALID' as const }
              : item
          )
        );
      }
    } catch {}
  };

  // ── Step 4: Commit ──
  const handleCommit = async () => {
    setLoading(true);
    setLoadingMsg('Committing to production database...');
    const batchIds = batches.map(b => b.import_batch_id);
    try {
      const res = await fetch(`${API_BASE}/ingestion/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ import_batch_ids: batchIds }),
      });
      const data = await res.json();
      setCommitResult({ count: data.committed_count });
      setStep(4);
    } catch {
      alert('Commit failed.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const filteredPreview = unifiedPreview.filter(item => statusFilter[item.validation_status]);

  // Count by status at the RECORD level (unique staged_record_id)
  const uniqueRecords = Array.from(
    new Map(unifiedPreview.map(item => [item.staged_record_id, item])).values()
  );
  const countByStatus = (s: string) => uniqueRecords.filter(r => r.validation_status === s).length;

  // ── Grouped table: one row per record ──
  // Collect ordered unique column headers (preserving first-seen order)
  const allHeaders: Array<{ original: string; canonical: string | null; confidence: number }> = [];
  const seenHeaders = new Set<string>();
  for (const item of unifiedPreview) {
    if (!seenHeaders.has(item.original_header)) {
      seenHeaders.add(item.original_header);
      allHeaders.push({
        original: item.original_header,
        canonical: item.mapped_field,
        confidence: (item as any).confidence ?? 0,
      });
    }
  }

  // Group items by staged_record_id → map of original_header → item
  const recordMap = new Map<number, { batchId: number; status: string; items: Map<string, UnifiedItem> }>();
  for (const item of unifiedPreview) {
    if (!recordMap.has(item.staged_record_id)) {
      recordMap.set(item.staged_record_id, { batchId: item.import_batch_id, status: item.validation_status, items: new Map() });
    }
    recordMap.get(item.staged_record_id)!.items.set(item.original_header, item);
  }

  // Apply status filter at record level
  const visibleRecords = Array.from(recordMap.entries()).filter(
    ([, rec]) => statusFilter[rec.status as keyof typeof statusFilter]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-shell">
      <Sidebar step={step} />

      <main className="main-content">
        <div className="page-header">
          <div className="page-title">SME Data Digitalization</div>
          <div className="page-subtitle">
            Multi-source document intake — closed-vocabulary column resolution — cross-file deduplication
          </div>
        </div>

        <Stepper step={step} />

        {/* ── STEP 1: Select Document Type ── */}
        <div className="card">
          <div className="card-title">
            <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}>01</span>
            Select Document Type
          </div>
          <div className="card-desc">
            Choose the type of data you are ingesting. This pre-configures the resolution cascade for that document structure.
          </div>

          <div className="doctype-tabs">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.key}
                className={`doctype-tab ${selectedDocType === dt.key ? 'selected' : ''}`}
                onClick={() => { setSelectedDocType(dt.key); if (step === 1) setStep(1); }}
              >
                <span className="tab-icon">{dt.icon}</span>
                <div>
                  <div>{dt.label}</div>
                  <div className="tab-exts">{dt.exts}</div>
                </div>
              </button>
            ))}
          </div>

          {selectedDocType && (
            <div className="alert alert-info" style={{ marginTop: 0, marginBottom: 0 }}>
              <span>ℹ</span>
              <span><strong>{currentDocType.label}:</strong> {currentDocType.description}</span>
            </div>
          )}

          {step === 1 && (
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button className="btn-primary" onClick={() => setStep(2)}>
                Continue to Upload →
              </button>
            </div>
          )}
        </div>

        {/* ── STEP 2: Upload ── */}
        {step >= 2 && (
          <div className="card">
            <div className="card-title">
              <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}>02</span>
              Upload Files — {currentDocType.icon} {currentDocType.label}
            </div>
            <div className="card-desc">
              Drop one or more files. Multiple files are processed as a unified batch with cross-file deduplication.
            </div>

            <label
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <input
                type="file"
                multiple
                accept={currentDocType.accept}
                onChange={e => addFiles(e.target.files)}
              />
              <div className="dropzone-icon">{currentDocType.icon}</div>
              <div className="dropzone-main">Drop files here or click to browse</div>
              <div className="dropzone-sub">Accepts {currentDocType.exts.trim()}</div>
              <div className="dropzone-accept">{currentDocType.accept}</div>
            </label>

            {pendingFiles.length > 0 && (
              <div className="file-chips">
                {pendingFiles.map(f => {
                  const ext = fileExt(f.name);
                  return (
                    <div key={f.name} className="file-chip">
                      <span className={`chip-type ${chipClass(ext)}`}>{ext.toUpperCase()}</span>
                      {f.name}
                      <button className="chip-remove" onClick={() => removeFile(f.name)}>×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {batches.length > 0 && (
              <>
                <div className="divider" />
                <div className="card-title" style={{ marginBottom: 12 }}>Ingested Batches — Extraction Preview</div>
                {batches.map(b => {
                  const isTextOCR = b.preview_rows.length > 0 && 'document_text' in b.preview_rows[0];
                  const ocrText: string = isTextOCR ? (b.preview_rows[0] as any).document_text as string : '';
                  const csvHeaders = !isTextOCR && b.preview_rows.length > 0 ? Object.keys(b.preview_rows[0]) : [];
                  return (
                    <div key={b.import_batch_id} style={{ marginBottom: 20 }}>
                      {/* Batch header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <span className="code-tag" style={{ fontSize: '0.76rem' }}>{b.filename}</span>
                        <span className="batch-badge-type">{b.detected_type}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {b.total_rows} rows — {b.detection_method} — {b.detection_confidence}% confidence
                        </span>
                        <div className="confidence-bar-track" style={{ flex: 1, maxWidth: 120 }}>
                          <div className="confidence-bar-fill" style={{ width: `${b.detection_confidence}%` }} />
                        </div>
                      </div>

                      {/* OCR / Text preview */}
                      {isTextOCR ? (
                        <div style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '14px 16px',
                        }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Extracted OCR Text — first 500 chars
                          </div>
                          <pre style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.7,
                            maxHeight: 220,
                            overflowY: 'auto',
                            margin: 0,
                          }}>{ocrText || '(no text extracted)'}</pre>
                          <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Verify the text above matches your source document before proceeding.
                          </div>
                        </div>
                      ) : (
                        /* CSV / structured preview table */
                        csvHeaders.length > 0 && (
                          <div className="table-wrapper">
                            <table className="custom-table">
                              <thead>
                                <tr>
                                  <th style={{ color: 'var(--text-muted)' }}>#</th>
                                  {csvHeaders.map(h => <th key={h}>{h}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {b.preview_rows.map((row, i) => (
                                  <tr key={i}>
                                    <td style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>{i + 1}</td>
                                    {csvHeaders.map(h => (
                                      <td key={h} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.73rem', color: 'var(--text-primary)' }}>
                                        {row[h] ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {b.total_rows > b.preview_rows.length && (
                              <div style={{ padding: '8px 14px', fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                                Showing {b.preview_rows.length} of {b.total_rows} rows
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <div className="btn-row" style={{ marginTop: 20 }}>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={loading || pendingFiles.length === 0}
              >
                {loading ? <><span className="spinner" /> {loadingMsg}</> : `Ingest ${pendingFiles.length} File${pendingFiles.length !== 1 ? 's' : ''}`}
              </button>
              {batches.length > 0 && step >= 2 && (
                <button className="btn-secondary" onClick={() => setStep(3)}>
                  Go to Resolution →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Resolve & Map ── */}
        {step >= 3 && (
          <div className="card">
            <div className="card-title">
              <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}>03</span>
              Column Resolution & Deduplication
            </div>
            <div className="card-desc">
              Runs the 4-step cascade (deterministic → heuristics → LLM fallback → manual) across all batches simultaneously.
              Flags cross-file duplicate SKUs.
            </div>

            {unifiedPreview.length === 0 ? (
              <div className="btn-row">
                <button className="btn-primary" onClick={() => handleResolve()} disabled={loading || batches.length === 0}>
                  {loading ? <><span className="spinner" /> {loadingMsg}</> : 'Run Resolution Cascade'}
                </button>
              </div>
            ) : (
              <>
                {/* ── Detected Business Type & Vertical Override Banner ── */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.25rem' }}>🏷️</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Detected Business Type:
                        </span>
                        <span style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          letterSpacing: '0.04em'
                        }}>
                          {Object.values(batchVerticals)[0] || 'GENERAL'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Inferred via majority HSN Chapter analysis or line-item semantic lexicon
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Override Vertical:</span>
                    <select
                      className="select-box"
                      style={{ fontSize: '0.78rem', padding: '4px 10px', height: 32, minWidth: 180 }}
                      value={Object.values(verticalOverrides)[0] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const newOverrides: Record<number, string> = {};
                        batches.forEach(b => {
                          if (val) newOverrides[b.import_batch_id] = val;
                        });
                        setVerticalOverrides(newOverrides);
                        handleResolve(newOverrides);
                      }}
                    >
                      <option value="">Auto-detect from HSN</option>
                      <option value="fashion">Fashion & Apparel (Ch. 50–63)</option>
                      <option value="food">Food & Agriculture (Ch. 01–24)</option>
                      <option value="electronics">Electronics & Machinery (Ch. 84–85)</option>
                      <option value="general">General / Standard (No extensions)</option>
                    </select>
                  </div>
                </div>

                <div className="stats-row">
                  <div className="stat-pill"><strong>{countByStatus('VALID')}</strong><span>Valid records</span></div>
                  <div className="stat-pill"><strong>{countByStatus('DUPLICATE')}</strong><span>Duplicate</span></div>
                  <div className="stat-pill"><strong>{countByStatus('WARNING')}</strong><span>Warning</span></div>
                  <div className="stat-pill"><strong>{countByStatus('ERROR')}</strong><span>Error</span></div>
                  <div className="stat-pill"><strong>{allHeaders.filter(h => !h.canonical && !SYSTEM_METADATA_COLS.has(h.original)).length}</strong><span>Unmapped cols</span></div>
                </div>

                <div className="filter-row">
                  <span className="filter-label">Show records:</span>
                  {(['VALID', 'WARNING', 'ERROR', 'DUPLICATE'] as const).map(s => (
                    <button
                      key={s}
                      className={`filter-chip ${statusFilter[s] ? 'on' : ''} ${s.toLowerCase()}`}
                      onClick={() => setStatusFilter(f => ({ ...f, [s]: !f[s] }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Column mapping legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {allHeaders.filter(h => !SYSTEM_METADATA_COLS.has(h.original)).map(h => {
                    const isAttr = h.canonical?.startsWith('attr:');
                    return (
                      <div key={h.original} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: isAttr ? 'rgba(168, 85, 247, 0.12)' : h.canonical ? 'var(--green-dim)' : 'var(--amber-dim)',
                        border: isAttr ? '1px solid rgba(168, 85, 247, 0.4)' : `1px solid ${h.canonical ? 'var(--green)' : 'var(--amber)'}`,
                        fontSize: '0.72rem',
                      }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{h.original}</span>
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                        <span style={{ color: isAttr ? '#c084fc' : h.canonical ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>
                          {h.canonical ?? 'unmapped'}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{h.confidence}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Grouped data table — one row per record */}
                <div className="table-wrapper">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>Status</th>
                        {allHeaders.map(h => {
                          const isAttr = h.canonical?.startsWith('attr:');
                          return (
                            <th key={h.original} title={`${h.original} → ${h.canonical ?? 'unmapped'} (${h.confidence}%)`}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ color: 'var(--text-primary)' }}>{h.original}</span>
                                {h.canonical && (
                                  <span style={{
                                    color: isAttr ? '#c084fc' : (SYSTEM_METADATA_COLS.has(h.original) || h.canonical === '[system]' ? 'var(--text-muted)' : 'var(--green)'),
                                    fontSize: '0.65rem',
                                    fontWeight: 400
                                  }}>
                                    {h.canonical}
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecords.map(([recordId, rec]) => (
                        <tr key={recordId}>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                            #{rec.batchId}
                          </td>
                          <td>
                            <span className={badgeClass(rec.status)}>{rec.status}</span>
                          </td>
                          {allHeaders.map(h => {
                            const cell = rec.items.get(h.original);
                            const val = cell?.value;
                            const needsReview = cell?.needs_manual_review;
                            return (
                              <td key={h.original} style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.73rem',
                                color: val != null && val !== '' ? 'var(--text-primary)' : 'var(--text-muted)',
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {val != null && val !== '' ? String(val) : '—'}
                                {needsReview && !h.canonical && !SYSTEM_METADATA_COLS.has(h.original) && (
                                  <span title="Needs manual mapping" style={{ marginLeft: 4, color: 'var(--amber)', fontSize: '0.7rem' }}>⚠</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rec.items.values().next().value?.validation_notes ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Manual mapping for unmapped columns */}
                {allHeaders.some(h => !h.canonical && !SYSTEM_METADATA_COLS.has(h.original)) && (
                  <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--amber)' }}>Unmapped Columns — Manual Assignment</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Canonical field = the standard name this data will be stored under (e.g. your file's 'GST Reg No' column becomes 'supplier_gstin')</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {allHeaders.filter(h => !h.canonical && !SYSTEM_METADATA_COLS.has(h.original)).map(h => (
                        <div key={h.original} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                          <span className="code-tag">{h.original}</span>
                          <span style={{ color: 'var(--text-muted)' }}>→</span>
                          <select
                            className="select-box"
                            style={{ minWidth: 160 }}
                            value=""
                            onChange={e => {
                              if (!e.target.value) return;
                              // Apply override to all records that have this column
                              visibleRecords.forEach(([recordId, rec]) => {
                                const cell = rec.items.get(h.original);
                                if (cell) handleManualOverride(cell.staged_record_id, e.target.value);
                              });
                            }}
                          >
                            <option value="">-- Select canonical field --</option>
                            {canonicalFields.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="btn-row" style={{ marginTop: 20 }}>
                  <button className="btn-success" onClick={handleCommit} disabled={loading}>
                    {loading ? <><span className="spinner" /> {loadingMsg}</> : 'Commit to Production Database'}
                  </button>
                  <button className="btn-secondary" onClick={() => handleResolve()} disabled={loading}>
                    Re-run Resolution
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 4: Commit Result ── */}
        {step === 4 && commitResult && (
          <div className="card">
            <div className="card-title">
              <span style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}>04</span>
              Committed to Database
            </div>
            <div className="alert alert-success">
              <span>✓</span>
              <div>
                <strong>{commitResult.count} record{commitResult.count !== 1 ? 's' : ''} committed</strong> to{' '}
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>
                  data/ingestion_standalone.db
                </span>
                . Batches marked <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>CONFIRMED</span>.
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setStep(1);
                  setPendingFiles([]);
                  setBatches([]);
                  setUnifiedPreview([]);
                  setCommitResult(null);
                }}
              >
                Start New Batch
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
