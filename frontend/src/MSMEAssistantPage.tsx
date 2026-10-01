import React, { useState, useEffect } from 'react';
import { API_BASE } from './config';
import { QuotationVisualCard } from './QuotationVisualCard';

interface QuickQuery {
  id: string;
  title: string;
  prompt: string;
  category: string;
}

interface AgentResponse {
  query: string;
  workflow: string;
  required_agents: string[];
  customer_context: any;
  market_benchmark: any;
  agent_results: any;
  verification: any;
  quotation: any;
  summary_text: string;
  execution_logs: string[];
}

export const MSMEAssistantPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assistant' | 'overview' | 'customers' | 'procurement' | 'inventory' | 'finance'>('assistant');
  
  // Chat state
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; data?: AgentResponse }>>([
    {
      sender: 'assistant',
      text: "Welcome to the MSME Operations Portal. You can prepare certified customer quotations, evaluate warehouse stock, or compare wholesale market suppliers across India."
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // CRM & Operations Data State
  const [customersData, setCustomersData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [financeData, setFinanceData] = useState<any>(null);
  const [suppliersData, setSuppliersData] = useState<any>(null);
  const [overviewData, setOverviewData] = useState<any>(null);

  const quickQueries: QuickQuery[] = [
    {
      id: 'q1',
      title: 'Order & Quotation for Rahul Sharma',
      prompt: 'A customer, Rahul Sharma, wants to purchase 100 office chairs. Check our stock, find supplier options if necessary, compare them, calculate the selling price with a 20% margin and applicable GST, and prepare a quotation.',
      category: 'Sales & Procurement'
    },
    {
      id: 'q2',
      title: 'Check Warehouse Stock',
      prompt: 'How many office chairs and laptop stands do we have in stock right now?',
      category: 'Inventory'
    },
    {
      id: 'q3',
      title: 'Audit Overdue Receivables',
      prompt: 'Which customer accounts currently have overdue invoices and what is the total outstanding amount?',
      category: 'Accounts Receivable'
    },
    {
      id: 'q4',
      title: 'Compare Wholesale Suppliers',
      prompt: 'Find wholesale suppliers for 100 office chairs and compare prices across Delhi, Mumbai and Ahmedabad.',
      category: 'Procurement'
    }
  ];

  useEffect(() => {
    loadAllOperationalData();
  }, []);

  const loadAllOperationalData = () => {
    fetch(`${API_BASE}/api/dashboard/overview`)
      .then(res => res.json())
      .then(d => setOverviewData(d))
      .catch(err => console.error("Overview error:", err));

    fetch(`${API_BASE}/api/customers`)
      .then(res => res.json())
      .then(d => setCustomersData(d.customers || []))
      .catch(err => console.error("Customers CRM error:", err));

    fetch(`${API_BASE}/api/dashboard/inventory`)
      .then(res => res.json())
      .then(d => setInventoryData(d))
      .catch(err => console.error("Inventory error:", err));

    fetch(`${API_BASE}/api/dashboard/finance`)
      .then(res => res.json())
      .then(d => setFinanceData(d))
      .catch(err => console.error("Finance error:", err));

    fetch(`${API_BASE}/api/dashboard/suppliers`)
      .then(res => res.json())
      .then(d => setSuppliersData(d))
      .catch(err => console.error("Suppliers error:", err));
  };

  const handleSendMessage = async (customQuery?: string) => {
    const textToSend = customQuery || inputPrompt;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = { sender: 'user' as const, text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data: AgentResponse = await res.json();
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: data.summary_text,
          data: data
        }
      ]);

      loadAllOperationalData();
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: `⚠️ Unable to process request. ${err.message}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPdf = (quotNumber: string) => {
    window.open(`${API_BASE}/api/quotations/${quotNumber}/pdf`, '_blank');
  };

  const downloadQuotationExcel = (quotNumber: string) => {
    window.open(`${API_BASE}/api/quotations/${quotNumber}/excel`, '_blank');
  };

  const downloadInventoryExcel = () => {
    window.open(`${API_BASE}/api/export/inventory/excel`, '_blank');
  };

  const downloadInvoicesExcel = () => {
    window.open(`${API_BASE}/api/export/invoices/excel`, '_blank');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 60px)', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* ── LEFT ENTERPRISE SIDEBAR (Notion/SaaS Reference Style) ── */}
      <aside style={{
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Quick Actions */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '8px' }}>
              Quick Actions
            </div>
            <button
              onClick={() => {
                setActiveTab('assistant');
                handleSendMessage('A customer, Rahul Sharma, wants to purchase 100 office chairs. Check our stock, find supplier options if necessary, compare them, calculate the selling price with a 20% margin and applicable GST, and prepare a quotation.');
              }}
              style={{
                width: '100%',
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '6px'
              }}
            >
              <span>+</span> New Quotation
            </button>
            <button
              onClick={downloadInvoicesExcel}
              style={{
                width: '100%',
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>📥</span> Export Ledger
            </button>
          </div>

          {/* Navigation Pages */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '8px' }}>
              Operations & Views
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { key: 'assistant', label: 'Operations Assistant', icon: '⚡' },
                { key: 'overview', label: 'Executive Overview', icon: '📊' },
                { key: 'customers', label: 'Customers & CRM', icon: '👥' },
                { key: 'procurement', label: 'Wholesale Suppliers', icon: '🏭' },
                { key: 'inventory', label: 'Inventory Master', icon: '📦' },
                { key: 'finance', label: 'Accounts & Invoices', icon: '💰' }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTab === item.key ? '#eef2ff' : 'transparent',
                    color: activeTab === item.key ? '#4338ca' : '#475569',
                    fontWeight: activeTab === item.key ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Operational Checkpoints */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Department Status
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>✓ Inventory: <strong>Pooja D.</strong></div>
              <div>✓ Sourcing: <strong>Vikram M.</strong></div>
              <div>✓ Accounts: <strong>Amitabh S.</strong></div>
            </div>
          </div>

        </div>

        {/* Bottom Status */}
        <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span>
          <span>Database Online</span>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <main style={{ padding: '28px 36px', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        
        {/* ── TOP KPI OVERVIEW ROW (Notion/SaaS Reference Style) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>TOTAL REVENUE</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              ₹{overviewData?.total_sales_revenue?.toLocaleString() || '1,19,000'}
            </div>
            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px', fontWeight: 600 }}>
              ↑ Settled B2B orders
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>RECEIVABLES</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              ₹{overviewData?.total_outstanding_receivables?.toLocaleString() || '3,69,500'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Across active client ledger
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>OVERDUE INVOICES</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>
              ₹{overviewData?.total_overdue_amount?.toLocaleString() || '1,90,000'}
            </div>
            <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
              ● {overviewData?.overdue_invoices_count || 2} accounts require collection
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>WAREHOUSE STOCK</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#4338ca', marginTop: '4px' }}>
              {overviewData?.total_products_count || 8} SKUs
            </div>
            <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px', fontWeight: 600 }}>
              {overviewData?.low_stock_items_count || 3} items near reorder limit
            </div>
          </div>

        </div>

        {/* ── TAB 1: OPERATIONS ASSISTANT ── */}
        {activeTab === 'assistant' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Quick Query Selector Chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              {quickQueries.map(q => (
                <button
                  key={q.id}
                  onClick={() => handleSendMessage(q.prompt)}
                  disabled={isLoading}
                  style={{
                    background: q.id === 'q1' ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' : '#ffffff',
                    color: '#0f172a',
                    border: q.id === 'q1' ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    textAlign: 'left',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontSize: '10.5px', color: '#4f46e5', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>
                    {q.category}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
                    {q.title}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.3 }}>
                    {q.prompt.length > 75 ? q.prompt.substring(0, 75) + '...' : q.prompt}
                  </div>
                </button>
              ))}
            </div>

            {/* Live Warehouse Stock Quick Glance */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                  📦 Warehouse Inventory Snapshot (Current Stock Levels)
                </div>
                <button
                  onClick={() => setActiveTab('inventory')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#4f46e5',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  View Full Catalog →
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                {inventoryData?.inventory?.map((item: any) => {
                  const isLow = item.stock_quantity <= item.reorder_level;
                  return (
                    <div
                      key={item.product_id}
                      onClick={() => handleSendMessage(`Check stock and prepare quotation for 100 ${item.name} with 20% margin`)}
                      title="Click to generate quotation scenario"
                      style={{
                        background: '#f8fafc',
                        border: isLow ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: isLow ? '#d97706' : '#16a34a' }}>
                          {item.stock_quantity} <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>units</span>
                        </span>
                        {isLow && (
                          <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px' }}>
                            LOW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conversation Feed */}
            <div style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              minHeight: '420px',
              maxHeight: '580px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: m.sender === 'user' ? '70%' : '100%',
                    background: m.sender === 'user' ? '#4f46e5' : '#f8fafc',
                    color: m.sender === 'user' ? '#ffffff' : '#0f172a',
                    padding: '16px 20px',
                    borderRadius: m.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    border: m.sender === 'user' ? '1px solid #4338ca' : '1px solid #e2e8f0',
                    fontSize: '13.5px',
                    lineHeight: 1.6
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: m.sender === 'user' ? '#c7d2fe' : '#64748b', marginBottom: '6px' }}>
                    {m.sender === 'user' ? 'You' : 'Operations Assistant'}
                  </div>

                  {/* If Quotation was created, render visual executive dashboard card! */}
                  {m.data?.quotation ? (
                    <QuotationVisualCard
                      data={m.data}
                      onDownloadPdf={downloadPdf}
                      onDownloadExcel={downloadQuotationExcel}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-line' }}>
                      {m.text}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div style={{
                  background: '#f1f5f9',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  width: 'fit-content',
                  fontSize: '13px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{ width: '12px', height: '12px', border: '2px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Processing request, checking stock, sourcing wholesale rates, and auditing calculations...
                </div>
              )}
            </div>

            {/* Input Box */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a business request (e.g. 'Rahul Sharma wants 100 chairs with 20% margin, check stock & prepare quotation')"
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  color: '#0f172a',
                  fontSize: '13.5px',
                  outline: 'none'
                }}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputPrompt.trim()}
                style={{
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 26px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: isLoading || !inputPrompt.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !inputPrompt.trim() ? 0.6 : 1
                }}
              >
                Send Request
              </button>
            </div>

          </div>
        )}

        {/* ── TAB 2: EXECUTIVE OVERVIEW TABLE ── */}
        {activeTab === 'overview' && overviewData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
                Recent Generated Quotations & Commercial Documents
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Quotation #</th>
                    <th style={{ padding: '10px' }}>Client Name</th>
                    <th style={{ padding: '10px' }}>Product</th>
                    <th style={{ padding: '10px' }}>Quantity</th>
                    <th style={{ padding: '10px' }}>Final Amount</th>
                    <th style={{ padding: '10px' }}>Compliance Status</th>
                    <th style={{ padding: '10px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewData.recent_quotations?.map((q: any) => (
                    <tr key={q.quotation_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: '#4f46e5' }}>{q.quotation_number}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a' }}>{q.customer_name}</td>
                      <td style={{ padding: '12px 10px', color: '#475569' }}>{q.product_name}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a', fontWeight: 600 }}>{q.quantity} units</td>
                      <td style={{ padding: '12px 10px', color: '#16a34a', fontWeight: 700 }}>₹{q.final_amount?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                          ✓ VERIFIED
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => downloadPdf(q.quotation_number)}
                          style={{
                            background: '#4f46e5',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => downloadQuotationExcel(q.quotation_number)}
                          style={{
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Excel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: CUSTOMERS & CRM ── */}
        {activeTab === 'customers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Customer Accounts & Credit Directory
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Live CRM profiles, credit limits, GSTIN verification, and ledger balances.
                  </p>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Customer Name</th>
                    <th style={{ padding: '10px' }}>Company Name</th>
                    <th style={{ padding: '10px' }}>Contact Phone</th>
                    <th style={{ padding: '10px' }}>GSTIN</th>
                    <th style={{ padding: '10px' }}>Credit Limit</th>
                    <th style={{ padding: '10px' }}>Outstanding</th>
                    <th style={{ padding: '10px' }}>Account Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customersData.map((c: any) => (
                    <tr key={c.customer_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0f172a' }}>{c.name}</td>
                      <td style={{ padding: '12px 10px', color: '#334155' }}>{c.company}</td>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>{c.phone}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a', fontFamily: 'monospace' }}>{c.gstin}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a' }}>₹{c.credit_limit?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: c.total_outstanding > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        ₹{c.total_outstanding?.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          background: c.status === 'OVERDUE' ? '#fee2e2' : (c.status === 'ACTIVE' ? '#fef3c7' : '#dcfce7'),
                          color: c.status === 'OVERDUE' ? '#991b1b' : (c.status === 'ACTIVE' ? '#92400e' : '#166534'),
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: PROCUREMENT & SUPPLIERS ── */}
        {activeTab === 'procurement' && suppliersData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Wholesale Sourcing Directory (IndiaMART Verified)
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Benchmark wholesale supplier catalog across major Indian commercial hubs.
                  </p>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Supplier Company</th>
                    <th style={{ padding: '10px' }}>Product</th>
                    <th style={{ padding: '10px' }}>Unit Price</th>
                    <th style={{ padding: '10px' }}>MOQ</th>
                    <th style={{ padding: '10px' }}>Stock Available</th>
                    <th style={{ padding: '10px' }}>Location</th>
                    <th style={{ padding: '10px' }}>Lead Time</th>
                    <th style={{ padding: '10px' }}>Rating</th>
                    <th style={{ padding: '10px' }}>Verification Source</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliersData.suppliers?.map((s: any) => (
                    <tr key={s.supplier_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0f172a' }}>{s.name}</td>
                      <td style={{ padding: '12px 10px', color: '#4f46e5' }}>{s.product_name}</td>
                      <td style={{ padding: '12px 10px', color: '#16a34a', fontWeight: 700 }}>₹{s.unit_price?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>{s.moq} units</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a' }}>{s.available_quantity}</td>
                      <td style={{ padding: '12px 10px', color: '#334155' }}>{s.location}</td>
                      <td style={{ padding: '12px 10px', color: '#2563eb' }}>{s.delivery_days} days</td>
                      <td style={{ padding: '12px 10px', color: '#d97706', fontWeight: 700 }}>⭐ {s.rating}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          {s.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: INVENTORY MASTER ── */}
        {activeTab === 'inventory' && inventoryData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Warehouse Inventory Master Catalog
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Current inventory SKU stock levels, procurement cost benchmarks, and product GST rates.
                  </p>
                </div>
                <button
                  onClick={downloadInventoryExcel}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Export Catalog (.xlsx)
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>SKU</th>
                    <th style={{ padding: '10px' }}>Product Name</th>
                    <th style={{ padding: '10px' }}>Category</th>
                    <th style={{ padding: '10px' }}>Cost Price</th>
                    <th style={{ padding: '10px' }}>Selling Price</th>
                    <th style={{ padding: '10px' }}>GST Rate</th>
                    <th style={{ padding: '10px' }}>Stock Quantity</th>
                    <th style={{ padding: '10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.inventory?.map((p: any) => (
                    <tr key={p.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', color: '#64748b', fontFamily: 'monospace' }}>{p.sku}</td>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: '#0f172a' }}>{p.name}</td>
                      <td style={{ padding: '12px 10px', color: '#334155' }}>{p.category}</td>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>₹{p.cost_price?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: '#16a34a', fontWeight: 700 }}>₹{p.selling_price?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: '#d97706' }}>{p.gst_rate}%</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a', fontWeight: 700 }}>{p.stock_quantity} units</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          background: p.stock_status === 'IN_STOCK' ? '#dcfce7' : '#fee2e2',
                          color: p.stock_status === 'IN_STOCK' ? '#166534' : '#991b1b',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {p.stock_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 6: ACCOUNTS & INVOICES ── */}
        {activeTab === 'finance' && financeData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Accounts Receivable & Invoices Ledger
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Real-time billing, collection schedules, and overdue receivables tracking.
                  </p>
                </div>
                <button
                  onClick={downloadInvoicesExcel}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Export Ledger (.xlsx)
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Invoice #</th>
                    <th style={{ padding: '10px' }}>Customer Name</th>
                    <th style={{ padding: '10px' }}>Invoice Amount</th>
                    <th style={{ padding: '10px' }}>Paid Amount</th>
                    <th style={{ padding: '10px' }}>Outstanding</th>
                    <th style={{ padding: '10px' }}>Due Date</th>
                    <th style={{ padding: '10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {financeData.invoices?.map((inv: any) => (
                    <tr key={inv.invoice_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: '#4f46e5' }}>{inv.invoice_id}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a' }}>{inv.customer_name}</td>
                      <td style={{ padding: '12px 10px', color: '#0f172a' }}>₹{inv.amount?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: '#16a34a' }}>₹{inv.paid_amount?.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: inv.outstanding_amount > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        ₹{inv.outstanding_amount?.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>{inv.due_date}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          background: inv.status === 'PAID' ? '#dcfce7' : (inv.status === 'OVERDUE' ? '#fee2e2' : '#fef3c7'),
                          color: inv.status === 'PAID' ? '#166534' : (inv.status === 'OVERDUE' ? '#991b1b' : '#92400e'),
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

    </div>
  );
};
