import React, { useState, useEffect } from 'react';
import { API_BASE } from './config';

interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  output: Record<string, any>;
  timestamp: number;
}

interface AgentTrace {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  role: string;
  goal: string;
  thoughts: string[];
  tool_calls: ToolCall[];
  execution_time_ms: number;
  model_used: string;
}

interface InterAgentMessage {
  message_id: string;
  timestamp_str: string;
  sender_agent: string;
  receiver_agent: string;
  message_type: string;
  content: string;
  payload: Record<string, any>;
}

interface RecommendationItem {
  recommendation_id: string;
  agent_type: string;
  title: string;
  description: string;
  required_cash: number;
  urgency_score: number;
  expected_roi_or_impact: number;
  risk_score: number;
  deadline_days: number;
  mcdm_priority_score: number;
  metadata?: Record<string, any>;
}

interface ConflictDiagnosis {
  has_conflict: boolean;
  available_cash: number;
  total_demanded_cash: number;
  deficit_amount: number;
  conflict_summary: string;
}

interface ArbitrationResult {
  arbitration_id: string;
  approved_recommendations: string[];
  rejected_recommendations: string[];
  total_cash_allocated: number;
  remaining_cash: number;
  execution_tier: 'AUTO_EXECUTE' | 'AUTO_LOG' | 'ESCALATE';
  decision_rationale: string;
  priority_scores: Record<string, number>;
}

interface AlternativeTradeoff {
  option_id: string;
  name: string;
  description: string;
  cash_required: number;
  pros: string[];
  cons: string[];
  recommended: boolean;
}

interface SimulationResponse {
  simulation_id: string;
  timestamp: number;
  natural_language_event: string;
  system_state: { available_cash: number; time_window_days: number };
  agent_traces: AgentTrace[];
  inter_agent_messages: InterAgentMessage[];
  recommendations: RecommendationItem[];
  conflict_diagnosis: ConflictDiagnosis;
  arbitration_result: ArbitrationResult;
  alternative_tradeoffs: AlternativeTradeoff[];
  overall_status: string;
  db_decision_log_id?: number;
}

interface SkuMasterItem {
  id: string;
  name: string;
  hsn: string;
  stock: number;
  velocity: number;
  leadTime: number;
  unitCost: number;
  reorderPoint: number;
  status: 'CRITICAL' | 'NORMAL' | 'SURGE_RISK';
}

const INITIAL_SKUS: SkuMasterItem[] = [
  { id: 'SKU-STL-A42', name: 'Raw Steel Alloy Bars #A42', hsn: '7228.30', stock: 4, velocity: 3.5, leadTime: 4, unitCost: 900, reorderPoint: 15, status: 'CRITICAL' },
  { id: 'SKU-FST-H90', name: 'High-Grade Industrial Fasteners', hsn: '7318.15', stock: 120, velocity: 15.0, leadTime: 2, unitCost: 18, reorderPoint: 50, status: 'NORMAL' },
  { id: 'SKU-SLR-H12', name: 'Hydraulic Seal Rings 12mm', hsn: '8487.90', stock: 6, velocity: 2.0, leadTime: 5, unitCost: 450, reorderPoint: 12, status: 'CRITICAL' }
];

export const MultiAgentCoordinationPage: React.FC = () => {
  // Operational ERP State
  const [skuList, setSkuList] = useState<SkuMasterItem[]>(INITIAL_SKUS);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('SKU-STL-A42');
  const [availableCash, setAvailableCash] = useState<number>(40000);
  const [gstLiability, setGstLiability] = useState<number>(20000);
  const [gstDueDays, setGstDueDays] = useState<number>(3);
  const [payrollReserve, setPayrollReserve] = useState<number>(15000);
  const [festivalSurgePct, setFestivalSurgePct] = useState<number>(25);

  // Natural Language Prompt Injection
  const [customEventPrompt, setCustomEventPrompt] = useState<string>('');

  // Simulation execution state
  const [loading, setLoading] = useState<boolean>(false);
  const [simulationData, setSimulationData] = useState<SimulationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active view tab
  const [activeConsoleTab, setActiveConsoleTab] = useState<'agents' | 'bus' | 'matrix' | 'langgraph'>('agents');

  // Human-in-the-loop state
  const [selectedTradeoff, setSelectedTradeoff] = useState<string>('OPT-A');
  const [actionConfirming, setActionConfirming] = useState<boolean>(false);
  const [actionResult, setActionResult] = useState<any | null>(null);

  const activeSku = skuList.find(s => s.id === selectedSkuId) || skuList[0];

  // Auto-run default scenario on mount
  useEffect(() => {
    executeAgentSimulation();
  }, []);

  const extractPromptValues = (promptText: string) => {
    let parsedCash: number | undefined;
    let parsedGst: number | undefined;
    let parsedSurge: number | undefined;

    const gstMatch = promptText.match(/(?:gst|tax|statutory|audit)[\D]*?(?:₹|inr|rs\.?)?\s*([\d,]+)/i);
    if (gstMatch) {
      const num = parseFloat(gstMatch[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) parsedGst = num;
    }

    const cashMatch = promptText.match(/(?:cash|liquid|treasury|balance|capital)[\D]*?(?:₹|inr|rs\.?)?\s*([\d,]+)/i);
    if (cashMatch) {
      const num = parseFloat(cashMatch[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) parsedCash = num;
    }

    const surgeMatch = promptText.match(/(?:surge|demand|festival|increase)[\D]*?([\d]+)\s*%/i);
    if (surgeMatch) {
      const num = parseFloat(surgeMatch[1]);
      if (!isNaN(num) && num >= 0) parsedSurge = num;
    }

    return { parsedCash, parsedGst, parsedSurge };
  };

  const executeAgentSimulation = async (
    overridePrompt?: string,
    overrideParams?: {
      cash?: number;
      gst?: number;
      gstDays?: number;
      payroll?: number;
      surge?: number;
      sku?: SkuMasterItem;
    }
  ) => {
    setLoading(true);
    setErrorMsg(null);
    setActionResult(null);

    const promptToSend = overridePrompt !== undefined ? overridePrompt : customEventPrompt;
    const { parsedCash, parsedGst, parsedSurge } = extractPromptValues(promptToSend);

    const targetSku = overrideParams?.sku || activeSku;
    const activeCash = overrideParams?.cash ?? (parsedCash !== undefined ? parsedCash : availableCash);
    const activeGst = overrideParams?.gst ?? (parsedGst !== undefined ? parsedGst : gstLiability);
    const activeGstDays = overrideParams?.gstDays ?? gstDueDays;
    const activePayroll = overrideParams?.payroll ?? payrollReserve;
    const activeSurge = overrideParams?.surge ?? (parsedSurge !== undefined ? parsedSurge : festivalSurgePct);

    // Sync React state if parsed from prompt
    if (parsedCash !== undefined && parsedCash !== availableCash) setAvailableCash(parsedCash);
    if (parsedGst !== undefined && parsedGst !== gstLiability) setGstLiability(parsedGst);
    if (parsedSurge !== undefined && parsedSurge !== festivalSurgePct) setFestivalSurgePct(parsedSurge);

    const payload = {
      event_prompt: promptToSend || `Operational Assessment: Restock ${targetSku.name} against statutory GST liability`,
      available_cash: activeCash,
      time_window_days: 7.0,
      upcoming_gst_liability: activeGst,
      gst_due_days: activeGstDays,
      upcoming_payroll_reserve: activePayroll,
      sku_name: targetSku.name,
      current_stock: targetSku.stock,
      daily_sales_velocity: targetSku.velocity,
      supplier_lead_time_days: targetSku.leadTime,
      unit_sale_price: targetSku.unitCost * 1.35,
      unit_cost: targetSku.unitCost,
      festival_surge_pct: activeSurge,
      base_reorder_qty: 50.0,
    };

    try {
      const res = await fetch(`${API_BASE}/api/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Agent Orchestrator returned HTTP ${res.status}`);
      }

      const data: SimulationResponse = await res.json();
      setSimulationData(data);
      if (data.alternative_tradeoffs.length > 0) {
        const rec = data.alternative_tradeoffs.find(t => t.recommended);
        setSelectedTradeoff(rec ? rec.option_id : data.alternative_tradeoffs[0].option_id);
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      setErrorMsg(err.message || 'Failed to reach agent orchestrator.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (type: 'classic' | 'surge' | 'crisis') => {
    if (type === 'classic') {
      const sku = INITIAL_SKUS.find(s => s.id === 'SKU-STL-A42') || INITIAL_SKUS[0];
      setSelectedSkuId('SKU-STL-A42');
      setAvailableCash(40000);
      setGstLiability(20000);
      setGstDueDays(3);
      setPayrollReserve(15000);
      setFestivalSurgePct(25);
      const prompt = 'Festival season incoming: High steel demand vs GST payment due in 3 days.';
      setCustomEventPrompt(prompt);
      executeAgentSimulation(prompt, {
        cash: 40000,
        gst: 20000,
        gstDays: 3,
        payroll: 15000,
        surge: 25,
        sku: sku
      });
    } else if (type === 'surge') {
      const sku = INITIAL_SKUS.find(s => s.id === 'SKU-FST-H90') || INITIAL_SKUS[1];
      setSelectedSkuId('SKU-FST-H90');
      setAvailableCash(120000);
      setGstLiability(20000);
      setGstDueDays(5);
      setPayrollReserve(20000);
      setFestivalSurgePct(50);
      const prompt = 'High customer liquidity: Bulk restocking cleared for industrial fasteners.';
      setCustomEventPrompt(prompt);
      executeAgentSimulation(prompt, {
        cash: 120000,
        gst: 20000,
        gstDays: 5,
        payroll: 20000,
        surge: 50,
        sku: sku
      });
    } else if (type === 'crisis') {
      const sku = INITIAL_SKUS.find(s => s.id === 'SKU-SLR-H12') || INITIAL_SKUS[2];
      setSelectedSkuId('SKU-SLR-H12');
      setAvailableCash(18000);
      setGstLiability(14000);
      setGstDueDays(1);
      setPayrollReserve(12000);
      setFestivalSurgePct(10);
      const prompt = 'Liquidity squeeze alert: Mandatory GST notice received with tight cash buffer.';
      setCustomEventPrompt(prompt);
      executeAgentSimulation(prompt, {
        cash: 18000,
        gst: 14000,
        gstDays: 1,
        payroll: 12000,
        surge: 10,
        sku: sku
      });
    }
  };

  const handleConfirmDecision = async (approved: boolean) => {
    if (!simulationData?.db_decision_log_id) return;
    setActionConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/action/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_log_id: simulationData.db_decision_log_id,
          approved: approved,
        }),
      });
      const data = await res.json();
      setActionResult(data);
    } catch (err: any) {
      console.error('Action error:', err);
      alert(`Settlement Error: ${err.message}`);
    } finally {
      setActionConfirming(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#e2e8f0', minHeight: '100vh', background: '#0a0f1d' }}>
      
      {/* ── ENTERPRISE OPERATIONS HEADER ── */}
      <div style={{
        background: 'linear-gradient(180deg, #111827 0%, #0d1322 100%)',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '20px 28px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              SAP S/4HANA MSME Cloud
            </span>
            <span style={{ color: '#475569', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Multi-Agent Autonomous Operations</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Multi-Agent Decision Coordination & Arbitration Engine
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
            Orchestrated via <strong>LangGraph StateGraph</strong> with <strong>Gemini 3.8 Flash</strong> reasoning and MCDM Knapsack Optimization.
          </p>
        </div>

        {/* System Telemetry Badges */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '6px 12px', borderRadius: '6px', fontSize: '11px' }}>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px' }}>AGENT FRAMEWORK</span>
            <strong style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }}></span>
              LangGraph StateGraph
            </strong>
          </div>
          <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '6px 12px', borderRadius: '6px', fontSize: '11px' }}>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px' }}>LLM ENGINE</span>
            <strong style={{ color: '#4ade80' }}>Gemini 3.8 Flash (Live)</strong>
          </div>
          <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '6px 12px', borderRadius: '6px', fontSize: '11px' }}>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px' }}>AUDIT INTEGRITY</span>
            <strong style={{ color: '#a78bfa' }}>SHA-256 Non-Repudiation</strong>
          </div>
        </div>
      </div>

      {/* ── LANGGRAPH STATEGRAPH PIPELINE FLOW VISUALIZER ── */}
      <div style={{
        background: '#111827',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🕸️ LangGraph StateGraph Execution Pipeline (Live Node Sequence)
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>6 Stateful Nodes + Dynamic Conditional Routing</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <div style={{ background: '#0a0f1d', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', flexShrink: 0 }}>
            START
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#38bdf8', flexShrink: 0 }}>
            finance_agent
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#4ade80', flexShrink: 0 }}>
            inventory_agent
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>
            conflict_diagnosis
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
            mcdm_arbitration
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: '#1e293b', border: '1px dashed #64748b', borderRadius: '6px', padding: '6px 10px', fontSize: '10px', fontWeight: 600, color: '#cbd5e1', flexShrink: 0 }}>
            ⟨route_decision_tier⟩
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{
            background: simulationData?.arbitration_result.execution_tier === 'ESCALATE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${simulationData?.arbitration_result.execution_tier === 'ESCALATE' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 700,
            color: simulationData?.arbitration_result.execution_tier === 'ESCALATE' ? '#f87171' : '#4ade80',
            flexShrink: 0
          }}>
            {simulationData?.arbitration_result.execution_tier === 'ESCALATE' ? 'human_escalation' : 'auto_execution'}
          </div>
          <span style={{ color: '#475569' }}>➔</span>
          <div style={{ background: '#0a0f1d', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', flexShrink: 0 }}>
            END
          </div>
        </div>
      </div>

      {/* ── NATURAL LANGUAGE EVENT DISPATCHER & PRESETS ── */}
      <div style={{
        background: '#111827',
        border: '1px solid #1f293d',
        borderRadius: '12px',
        padding: '18px 24px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚡</span> Dynamic Event & Market Signal Dispatcher (Simulate Live MSME Incidents)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleApplyPreset('classic')}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              Benchmark 1: Classic Capstone Conflict (₹40k vs ₹65k)
            </button>
            <button
              onClick={() => handleApplyPreset('surge')}
              style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              Benchmark 2: High Liquidity Surge (Tier 1 Auto-Execute)
            </button>
            <button
              onClick={() => handleApplyPreset('crisis')}
              style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              Benchmark 3: Severe Cash Crunch (Split-Batch Escalation)
            </button>
          </div>
        </div>

        {/* Live Natural Language Event Bar */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Type any dynamic business incident (e.g. 'Supplier Apex announced 20% discount on steel orders' or 'GST demand notice ₹35,000 received')..."
            value={customEventPrompt}
            onChange={(e) => setCustomEventPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') executeAgentSimulation(); }}
            style={{
              flex: 1,
              background: '#0a0f1d',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 16px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <button
            onClick={() => executeAgentSimulation()}
            disabled={loading}
            style={{
              background: loading ? '#475569' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
            }}
          >
            {loading ? '⏳ LangGraph Executing...' : '▶ Dispatch & Arbitrate'}
          </button>
        </div>
      </div>

      {/* ── ERP LIVE INVENTORY & FINANCIAL LEDGER MASTER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
        
        {/* SKU Master Table */}
        <div style={{ background: '#111827', border: '1px solid #1f293d', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📊 ERP Inventory Master (Click Row to Direct Agents)
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Live SQLite Table: `inventory_items`</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>SKU Code</th>
                <th style={{ padding: '8px 10px' }}>Item Description</th>
                <th style={{ padding: '8px 10px' }}>Stock</th>
                <th style={{ padding: '8px 10px' }}>Velocity</th>
                <th style={{ padding: '8px 10px' }}>Lead Time</th>
                <th style={{ padding: '8px 10px' }}>Unit Cost</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {skuList.map((sku) => {
                const isSelected = sku.id === selectedSkuId;
                return (
                  <tr
                    key={sku.id}
                    onClick={() => {
                      setSelectedSkuId(sku.id);
                      executeAgentSimulation(`Evaluate SKU ${sku.id} against cash flow`, { sku: sku });
                    }}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                  >
                    <td style={{ padding: '10px', fontFamily: 'monospace', color: isSelected ? '#38bdf8' : '#e2e8f0', fontWeight: 600 }}>{sku.id}</td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>{sku.name}</td>
                    <td style={{ padding: '10px', fontWeight: 700, color: sku.stock <= 10 ? '#f87171' : '#4ade80' }}>{sku.stock} units</td>
                    <td style={{ padding: '10px', color: '#94a3b8' }}>{sku.velocity}/day</td>
                    <td style={{ padding: '10px', color: '#94a3b8' }}>{sku.leadTime} days</td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>₹{sku.unitCost}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: sku.status === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: sku.status === 'CRITICAL' ? '#f87171' : '#4ade80'
                      }}>
                        {sku.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live Working Capital Constraints Card */}
        <div style={{ background: '#111827', border: '1px solid #1f293d', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            💼 Liquid Treasury & Working Capital
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>AVAILABLE CASH</div>
              <input
                type="number"
                value={availableCash}
                onChange={(e) => setAvailableCash(Number(e.target.value))}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '16px', fontWeight: 700, outline: 'none' }}
              />
            </div>

            <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>GST TAX LIABILITY</div>
              <input
                type="number"
                value={gstLiability}
                onChange={(e) => setGstLiability(Number(e.target.value))}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', fontSize: '16px', fontWeight: 700, outline: 'none' }}
              />
            </div>

            <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>PAYROLL RESERVE</div>
              <input
                type="number"
                value={payrollReserve}
                onChange={(e) => setPayrollReserve(Number(e.target.value))}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#fbbf24', fontSize: '16px', fontWeight: 700, outline: 'none' }}
              />
            </div>

            <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>FESTIVAL SURGE</div>
              <input
                type="number"
                value={festivalSurgePct}
                onChange={(e) => setFestivalSurgePct(Number(e.target.value))}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#a78bfa', fontSize: '16px', fontWeight: 700, outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', marginTop: 'auto' }}>
            💡 Real-time inputs feeding into LangGraph StateGraph nodes.
          </div>
        </div>
      </div>

      {/* ── CONSOLE VIEW TABS ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveConsoleTab('agents')}
          style={{
            background: activeConsoleTab === 'agents' ? '#1e293b' : 'transparent',
            color: activeConsoleTab === 'agents' ? '#38bdf8' : '#64748b',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          🤖 Autonomous Agent Fleet (2 Active Agents)
        </button>
        <button
          onClick={() => setActiveConsoleTab('bus')}
          style={{
            background: activeConsoleTab === 'bus' ? '#1e293b' : 'transparent',
            color: activeConsoleTab === 'bus' ? '#38bdf8' : '#64748b',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          📡 Inter-Agent Negotiation Protocol Stream ({simulationData?.inter_agent_messages.length || 0} Packets)
        </button>
        <button
          onClick={() => setActiveConsoleTab('matrix')}
          style={{
            background: activeConsoleTab === 'matrix' ? '#1e293b' : 'transparent',
            color: activeConsoleTab === 'matrix' ? '#38bdf8' : '#64748b',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          ⚖️ MCDM Knapsack Solver & Trade-off Matrix
        </button>
        <button
          onClick={() => setActiveConsoleTab('langgraph')}
          style={{
            background: activeConsoleTab === 'langgraph' ? '#1e293b' : 'transparent',
            color: activeConsoleTab === 'langgraph' ? '#38bdf8' : '#64748b',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          🕸️ LangGraph Architecture & State Inspector
        </button>
      </div>

      {/* ── MAIN AGENT SIMULATION CONTENT ── */}
      {simulationData && (
        <>
          {/* TAB 1: AUTONOMOUS AGENT FLEET */}
          {activeConsoleTab === 'agents' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              {simulationData.agent_traces.map((trace) => {
                const isFinance = trace.agent_type === 'FINANCE';
                const rec = simulationData.recommendations.find(r => r.agent_type === trace.agent_type);

                return (
                  <div key={trace.agent_id} style={{
                    background: '#111827',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isFinance ? '#38bdf8' : '#4ade80' }}></div>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#f8fafc' }}>{trace.agent_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{trace.role}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {trace.model_used}
                        </span>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Latency: {trace.execution_time_ms}ms</div>
                      </div>
                    </div>

                    {/* Chain of Thought Stream */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                        🧠 Live Reasoning & Tool Invocations
                      </div>
                      <div style={{
                        background: '#080d1a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#cbd5e1',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        lineHeight: 1.6
                      }}>
                        {trace.thoughts.map((t, idx) => (
                          <div key={idx} style={{ marginBottom: '4px' }}>
                            <span style={{ color: isFinance ? '#38bdf8' : '#4ade80' }}>[{idx + 1}]</span> {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tools Invoked */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {trace.tool_calls.map((tc, idx) => (
                        <div key={idx} style={{ background: '#0a0f1d', border: '1px solid #1f293d', borderRadius: '6px', padding: '8px 10px', fontSize: '11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                            <strong style={{ color: isFinance ? '#38bdf8' : '#4ade80', fontFamily: 'monospace' }}>⚙️ {tc.tool_name}</strong>
                            <span style={{ color: '#4ade80', fontSize: '10px' }}>EXECUTED</span>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                            {tc.output.summary || JSON.stringify(tc.output)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Proposal Badge */}
                    {rec && (
                      <div style={{
                        marginTop: 'auto',
                        background: isFinance ? 'rgba(56, 189, 248, 0.06)' : 'rgba(74, 222, 128, 0.06)',
                        border: `1px solid ${isFinance ? 'rgba(56, 189, 248, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '12px', color: isFinance ? '#38bdf8' : '#4ade80' }}>
                            {rec.title}
                          </strong>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                            ₹{rec.required_cash.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                          <span>Urgency: <strong style={{ color: '#f87171' }}>{rec.urgency_score * 100}%</strong></span>
                          <span>Impact: <strong style={{ color: '#38bdf8' }}>{rec.expected_roi_or_impact * 100}%</strong></span>
                          <span>Risk: <strong style={{ color: '#fbbf24' }}>{rec.risk_score * 100}%</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: INTER-AGENT MESSAGE PROTOCOL STREAM */}
          {activeConsoleTab === 'bus' && (
            <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📡</span> Live Inter-Agent Negotiation Protocol Stream (IPC Message Bus)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {simulationData.inter_agent_messages.map((msg) => (
                  <div key={msg.message_id} style={{
                    background: '#0a0f1d',
                    border: '1px solid #1f293d',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontFamily: 'monospace',
                    fontSize: '11px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#64748b' }}>
                      <span style={{ color: '#38bdf8' }}>[{msg.timestamp_str}] {msg.sender_agent} ➔ {msg.receiver_agent}</span>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: msg.message_type.includes('VETO') || msg.message_type.includes('DIRECTIVE') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: msg.message_type.includes('VETO') || msg.message_type.includes('DIRECTIVE') ? '#f87171' : '#38bdf8'
                      }}>
                        {msg.message_type}
                      </span>
                    </div>
                    <div style={{ color: '#e2e8f0', lineHeight: 1.5 }}>{msg.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MCDM KNAPSACK SOLVER & SENSITIVITY */}
          {activeConsoleTab === 'matrix' && (
            <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>
                ⚖️ MCDM Knapsack Solver Mathematical Formulation
              </div>
              <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '16px' }}>
                <code>Priority Score Formula: P_i = 0.45 * Urgency_i + 0.35 * Impact_i + 0.20 * (1 - Risk_i)</code><br />
                <code>Constraint: Sum(x_i * RequiredCash_i) &lt;= AvailableWorkingCapital (INR {simulationData.system_state.available_cash.toLocaleString()})</code>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                {simulationData.recommendations.map((r) => (
                  <div key={r.recommendation_id} style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ color: '#f8fafc' }}>{r.title}</strong>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>Score: {r.mcdm_priority_score.toFixed(4)}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Capital Requirement: ₹{r.required_cash.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: LANGGRAPH ARCHITECTURE & STATE INSPECTOR */}
          {activeConsoleTab === 'langgraph' && (
            <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>
                🕸️ LangGraph Compiled StateGraph Schema & Architecture
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                The multi-agent workflow is modeled as a compiled <code>StateGraph</code> with cyclic state updates, conditional branch edges, and Gemini 3.8 Flash tool-augmented nodes.
              </p>

              <div style={{ background: '#080d1a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1', overflowX: 'auto' }}>
                <div style={{ color: '#38bdf8', marginBottom: '8px' }}># LangGraph Workflow Definition (src/agents/langgraph_workflow.py)</div>
                <div>workflow = StateGraph(MSMEAgentState)</div>
                <div>workflow.add_node("finance_agent", finance_agent_node)</div>
                <div>workflow.add_node("inventory_agent", inventory_agent_node)</div>
                <div>workflow.add_node("conflict_diagnosis", conflict_diagnosis_node)</div>
                <div>workflow.add_node("mcdm_arbitration", mcdm_arbitration_node)</div>
                <div>workflow.add_node("human_escalation", human_escalation_node)</div>
                <div>workflow.add_node("auto_execution", auto_execution_node)</div>
                <div style={{ color: '#4ade80', margin: '8px 0' }}>workflow.add_conditional_edges("mcdm_arbitration", route_decision_tier, &#123; "human_escalation": "human_escalation", "auto_execution": "auto_execution" &#125;)</div>
                <div style={{ color: '#fbbf24' }}>app = workflow.compile()</div>
              </div>
            </div>
          )}

          {/* ── ARBITRATION RESOLUTION & HUMAN IN THE LOOP ── */}
          <div style={{
            background: '#111827',
            border: '1px solid #2563eb',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚖️</span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    Arbitration Execution Directive & Trade-off Resolution
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {simulationData.arbitration_result.decision_rationale}
                </p>
              </div>

              <span style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                background: simulationData.arbitration_result.execution_tier === 'ESCALATE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: simulationData.arbitration_result.execution_tier === 'ESCALATE' ? '#f87171' : '#4ade80',
                border: `1px solid ${simulationData.arbitration_result.execution_tier === 'ESCALATE' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
              }}>
                {simulationData.arbitration_result.execution_tier === 'ESCALATE' ? '⚠️ TIER 3: ESCALATE TO OWNER' : '🚀 TIER 1: AUTO-EXECUTE'}
              </span>
            </div>

            {/* Ranked Tradeoff Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {simulationData.alternative_tradeoffs.map((to) => (
                <div
                  key={to.option_id}
                  onClick={() => setSelectedTradeoff(to.option_id)}
                  style={{
                    background: selectedTradeoff === to.option_id ? '#1e293b' : '#0a0f1d',
                    border: `1px solid ${selectedTradeoff === to.option_id ? '#38bdf8' : '#1f293d'}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="tradeoff"
                        checked={selectedTradeoff === to.option_id}
                        onChange={() => setSelectedTradeoff(to.option_id)}
                        style={{ accentColor: '#38bdf8' }}
                      />
                      <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{to.name}</strong>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                      Req: ₹{to.cash_required.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ margin: '4px 0 0 24px', fontSize: '11px', color: '#94a3b8' }}>
                    {to.description}
                  </div>
                </div>
              ))}
            </div>

            {/* Execute Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => handleConfirmDecision(false)}
                disabled={actionConfirming}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Reject / Hold
              </button>
              <button
                onClick={() => handleConfirmDecision(true)}
                disabled={actionConfirming}
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: actionConfirming ? 'not-allowed' : 'pointer'
                }}
              >
                {actionConfirming ? '⏳ Cryptographic Stamping...' : '✅ Sign & Execute via Gateway'}
              </button>
            </div>

            {/* Settlement Stamp Outcome */}
            {actionResult && (
              <div style={{ marginTop: '14px', background: '#0a0f1d', border: '1px solid #22c55e', borderRadius: '8px', padding: '12px 16px', fontSize: '12px' }}>
                <strong style={{ color: '#4ade80' }}>✔ B2B Transaction Confirmed: {actionResult.transaction_id}</strong>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  🔒 Cryptographically stamped to SQLite SHA-256 Non-Repudiation Audit Chain.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MultiAgentCoordinationPage;
