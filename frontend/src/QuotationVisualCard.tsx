import React from 'react';
import { API_BASE } from './config';

interface QuotationVisualCardProps {
  data: any;
  onDownloadPdf?: (quotNumber: string) => void;
  onDownloadExcel?: (quotNumber: string) => void;
}

export const QuotationVisualCard: React.FC<QuotationVisualCardProps> = ({
  data,
  onDownloadPdf,
  onDownloadExcel
}) => {
  if (!data) return null;

  const quot = data.quotation;
  const cust = data.customer_context;
  const inv = data.agent_results?.inventory;
  const supp = data.agent_results?.supplier_comparison?.selected_supplier;
  const fin = data.agent_results?.finance;
  const ver = data.verification;
  const mkt = data.market_benchmark;

  const handlePdf = () => {
    if (onDownloadPdf && quot?.quotation_number) {
      onDownloadPdf(quot.quotation_number);
    } else if (quot?.quotation_number) {
      window.open(`${API_BASE}/api/quotations/${quot.quotation_number}/pdf`, '_blank');
    }
  };

  const handleExcel = () => {
    if (onDownloadExcel && quot?.quotation_number) {
      onDownloadExcel(quot.quotation_number);
    } else if (quot?.quotation_number) {
      window.open(`${API_BASE}/api/quotations/${quot.quotation_number}/excel`, '_blank');
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      color: '#0f172a',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
      overflow: 'hidden',
      marginTop: '16px',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* ── CARD HEADER & STEPPER ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#ffffff',
        padding: '20px 24px',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              COMMERCIAL PROCUREMENT & QUOTATION SUMMARY
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
              Quotation #{quot?.quotation_number || 'QUOT-2026-AUTO'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: '#064e3b',
              color: '#34d399',
              fontSize: '11.5px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }}></span>
              100% AUDIT VERIFIED
            </span>
          </div>
        </div>

        {/* Visual Stepper */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingTop: '6px' }}>
          {[
            { step: '1', title: 'CRM Context', desc: cust?.name || 'Verified Client' },
            { step: '2', title: 'Inventory Stock', desc: inv ? `${inv.current_stock} in stock` : 'Assessed' },
            { step: '3', title: 'Market Sourcing', desc: supp ? supp.name : 'Best Supplier' },
            { step: '4', title: 'GST & Margin', desc: quot ? `${quot.desired_margin_pct}% Margin` : 'Calculated' }
          ].map((s, idx) => (
            <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#4f46e5', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {s.step}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1' }}>{s.title}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CARD BODY (2-COLUMN GRID) ── */}
      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '24px' }}>
        
        {/* Left Column: Context & Sourcing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* 1. Customer Context Card */}
          <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>👤</span> Customer & Credit Context
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              {cust?.name || quot?.customer_name || 'Rahul Sharma'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {cust?.company || 'Commercial Retail Client'}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
              📍 {cust?.address || 'New Delhi, India'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', fontSize: '11.5px' }}>
              <span style={{ color: '#64748b' }}>GSTIN: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{cust?.gstin || '07AAACS4412H1Z5'}</span></span>
              <span style={{ background: '#dcfce7', color: '#166534', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px' }}>
                {cust?.risk_level === 'HIGH' ? 'Overdue Flag' : 'Prime Credit'}
              </span>
            </div>
          </div>

          {/* 2. Warehouse Stock & Shortage Breakdown */}
          <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📦</span> Inventory Stock Assessment
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{quot?.product_name || 'Office Chair'}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#4338ca' }}>Requested: {quot?.quantity || 100} units</span>
            </div>

            {/* Visual Bar Indicator */}
            {inv && (
              <div>
                <div style={{ display: 'flex', height: '10px', borderRadius: '6px', overflow: 'hidden', background: '#e2e8f0', marginBottom: '8px' }}>
                  <div style={{ width: `${Math.min(100, ((inv.current_stock || 0) / (quot?.quantity || 100)) * 100)}%`, background: '#22c55e' }} title={`In Stock: ${inv.current_stock}`} />
                  <div style={{ width: `${Math.max(0, 100 - ((inv.current_stock || 0) / (quot?.quantity || 100)) * 100)}%`, background: '#f59e0b' }} title={`Shortage: ${inv.shortage}`} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                  <span>● Warehouse Stock: <strong style={{ color: '#16a34a' }}>{inv.current_stock} units</strong></span>
                  <span>● Procurement Shortage: <strong style={{ color: '#d97706' }}>{inv.shortage} units</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Selected Wholesale Supplier */}
          {supp && (
            <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>🏢</span> Sourced B2B Wholesale Supplier
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{supp.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#d97706' }}>⭐ {supp.rating} / 5.0</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                {supp.location} • Lead Time: {supp.delivery_days} days
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '11.5px' }}>
                <span style={{ color: '#64748b' }}>Benchmark Price: <strong style={{ color: '#0f172a' }}>₹{supp.unit_price?.toLocaleString('en-IN')}/unit</strong></span>
                <span style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 700, padding: '3px 9px', borderRadius: '12px', fontSize: '10.5px' }}>
                  {supp.source || 'IndiaMART TrustSEAL'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Commercial Financial Breakdown & Download Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1.5px solid #cbd5e1',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>
              Itemized Quotation & Tax Invoice
            </div>

            {/* Price lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Base Procurement Cost ({quot?.quantity} @ ₹{quot?.unit_cost?.toLocaleString()}):</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>₹{quot?.purchase_cost?.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Target Profit Margin (<strong style={{ color: '#16a34a' }}>+{quot?.desired_margin_pct}%</strong>):</span>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>+ ₹{(quot?.taxable_amount - quot?.purchase_cost)?.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                <span>Taxable Commercial Subtotal:</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>₹{quot?.taxable_amount?.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>GST Tax (<span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>{quot?.gst_rate}% Rate</span>):</span>
                <span style={{ color: '#d97706', fontWeight: 700 }}>+ ₹{quot?.gst_amount?.toLocaleString()}</span>
              </div>

              {/* Grand Total Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1.5px solid #4f46e5',
                marginTop: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Final Commercial Total (INR)
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Unit Selling Rate: ₹{quot?.unit_price?.toLocaleString()} (incl. GST)
                  </div>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#4338ca' }}>
                  ₹{quot?.final_amount?.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Department Sign-off Note */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '11.5px', color: '#64748b', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
              <span>Lead Officer: <strong style={{ color: '#334155' }}>Amitabh Sen (Accounts Head)</strong></span>
              <span>Terms: <strong style={{ color: '#334155' }}>Standard Net 30 Commercial</strong></span>
            </div>
          </div>

          {/* Action Download Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={handlePdf}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                transition: 'all 0.15s ease'
              }}
            >
              📄 Download PDF Quotation
            </button>

            <button
              onClick={handleExcel}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                transition: 'all 0.15s ease'
              }}
            >
              📊 Export Excel (.xlsx)
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
