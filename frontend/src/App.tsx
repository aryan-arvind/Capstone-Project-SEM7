import React, { useState } from 'react';
import { MSMEAssistantPage } from './MSMEAssistantPage';
import { DigitalizationPage } from './DigitalizationPage';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'msme_erp' | 'digitalization'>('msme_erp');

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f9fafb' }}>
      {/* ── TOP ENTERPRISE NAVIGATION BAR ── */}
      <nav style={{
        background: '#0d131f',
        borderBottom: '1px solid #1f2937',
        padding: '0 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '60px',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: '#3730a3',
            color: '#ffffff',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '15px'
          }}>
            MS
          </div>
          <div>
            <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>
              MSME Business Operations Platform
            </div>
            <div style={{ color: '#6b7280', fontSize: '10.5px' }}>
              Autonomous Wholesale & Retail Management
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('msme_erp')}
            style={{
              background: activeTab === 'msme_erp' ? '#1f2937' : 'transparent',
              color: activeTab === 'msme_erp' ? '#ffffff' : '#9ca3af',
              border: activeTab === 'msme_erp' ? '1px solid #374151' : '1px solid transparent',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            Business Operations & Quotations
          </button>
          <button
            onClick={() => setActiveTab('digitalization')}
            style={{
              background: activeTab === 'digitalization' ? '#1f2937' : 'transparent',
              color: activeTab === 'digitalization' ? '#ffffff' : '#9ca3af',
              border: activeTab === 'digitalization' ? '1px solid #374151' : '1px solid transparent',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            Data Digitalization & Ingestion
          </button>
        </div>
      </nav>

      {/* ── MAIN CONTENT VIEW ── */}
      <main>
        {activeTab === 'msme_erp' ? (
          <MSMEAssistantPage />
        ) : (
          <DigitalizationPage />
        )}
      </main>
    </div>
  );
};

export default App;
