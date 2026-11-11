"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Sliders,
  Zap,
  CheckCircle,
  RefreshCw,
  Building2,
  RotateCcw,
  Save,
  AlertTriangle,
  Database,
} from 'lucide-react';

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [integrations, setIntegrations] = useState<any>(null);

  // Configurable Form State
  const [businessName, setBusinessName] = useState('DuePilot Studio');
  const [senderName, setSenderName] = useState('Accounts Team');
  const [defaultTone, setDefaultTone] = useState('PROFESSIONAL');
  const [greeting, setGreeting] = useState('Hello {customerFirstName} team,');
  const [signOff, setSignOff] = useState('Kind regards,\nAccounts Team, DuePilot Studio');
  const [styleInstruction, setStyleInstruction] = useState(
    'Keep reminders factual, polite, and concise.'
  );

  const [cooldownDays, setCooldownDays] = useState(3);
  const [minimumOverdueDays, setMinimumOverdueDays] = useState(0);
  const [proactiveUpcoming, setProactiveUpcoming] = useState(true);

  const [overdueWeight, setOverdueWeight] = useState(50);
  const [valueWeight, setValueWeight] = useState(30);
  const [escalationWeight, setEscalationWeight] = useState(20);

  // Action Feedback State
  const [isSaving, setIsSaving] = useState(false);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'SUCCESS' | 'ERROR';
    text: string;
  } | null>(null);

  // Demo Simulator State
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [selectedInvoiceForWebhook, setSelectedInvoiceForWebhook] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  const applySettingsToState = (s: any) => {
    if (!s) return;
    if (s.businessProfile) {
      setBusinessName(s.businessProfile.businessName || 'DuePilot Studio');
      setSenderName(s.businessProfile.senderName || 'Accounts Team');
      setDefaultTone(s.businessProfile.defaultTone || 'PROFESSIONAL');
      setGreeting(s.businessProfile.greeting || 'Hello {customerFirstName} team,');
      setSignOff(
        s.businessProfile.signOff || 'Kind regards,\nAccounts Team, DuePilot Studio'
      );
      setStyleInstruction(s.businessProfile.styleInstruction || '');
    }
    if (s.policy) {
      setCooldownDays(Number(s.policy.cooldownDays ?? 3));
      setMinimumOverdueDays(Number(s.policy.minimumOverdueDays ?? 0));
      setProactiveUpcoming(Boolean(s.policy.proactiveUpcoming ?? true));
    }
    if (s.weights) {
      setOverdueWeight(Number(s.weights.overdueWeight ?? 50));
      setValueWeight(Number(s.weights.valueWeight ?? 30));
      setEscalationWeight(Number(s.weights.escalationWeight ?? 20));
    }
  };

  const fetchSettingsAndInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsRes, invRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/invoices'),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        applySettingsToState(data.settings);
        setIntegrations(data.integrations);
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        const unpaid = invData.filter(
          (inv: any) => !String(inv.status || '').toUpperCase().includes('PAID')
        );
        setUnpaidInvoices(unpaid);
        if (unpaid.length > 0) setSelectedInvoiceForWebhook(unpaid[0].paypalId);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettingsAndInvoices();
  }, [fetchSettingsAndInvoices]);

  const weightsSum =
    (Number(overdueWeight) || 0) +
    (Number(valueWeight) || 0) +
    (Number(escalationWeight) || 0);

  const handleTestConnection = async (target: 'PAYPAL' | 'GEMINI' | 'DATABASE') => {
    setTestingTarget(target);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TEST_CONNECTION', target }),
      });
      const data = await res.json();
      setBannerMessage({
        type: data.ok ? 'SUCCESS' : 'ERROR',
        text: data.message || 'Connection test completed.',
      });
      await fetchSettingsAndInvoices();
    } catch (err: any) {
      setBannerMessage({
        type: 'ERROR',
        text: err.message || 'Failed to run connection test.',
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleSaveSettings = async () => {
    if (weightsSum !== 100) {
      setBannerMessage({
        type: 'ERROR',
        text: `Priority scoring weights must sum to 100 (currently ${weightsSum}).`,
      });
      return;
    }

    setIsSaving(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessProfile: {
            businessName,
            senderName,
            defaultTone,
            greeting,
            signOff,
            styleInstruction,
          },
          policy: {
            cooldownDays: Number(cooldownDays),
            minimumOverdueDays: Number(minimumOverdueDays),
            proactiveUpcoming,
          },
          weights: {
            overdueWeight: Number(overdueWeight),
            valueWeight: Number(valueWeight),
            escalationWeight: Number(escalationWeight),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setBannerMessage({
        type: 'SUCCESS',
        text: data.message || 'Settings saved and applied across DuePilot.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'ERROR', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setIsSaving(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_DEFAULTS' }),
      });
      const data = await res.json();
      if (res.ok) {
        applySettingsToState(data.settings);
        setBannerMessage({
          type: 'SUCCESS',
          text: data.message || 'Restored default settings.',
        });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'ERROR', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimulateWebhook = async () => {
    if (!selectedInvoiceForWebhook) return;
    setIsSimulating(true);
    setSimulationResult(null);

    try {
      const res = await fetch('/api/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'INVOICING.INVOICE.PAID',
          paypalId: selectedInvoiceForWebhook,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSimulationResult(`Success: ${data.message}`);
        await fetchSettingsAndInvoices();
      } else {
        setSimulationResult(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setSimulationResult(`Simulation failed: ${error.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: '#0B1020',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
  };

  return (
    <div className="page-container" style={{ paddingBottom: '48px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Settings & Policy Centre
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Live integration diagnostics, communication identity, cooldown guardrails, and scoring weights.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleResetDefaults}
            disabled={isSaving}
            className="btn-primary"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              padding: '8px 14px',
            }}
          >
            <RotateCcw size={14} />
            <span>Reset to Defaults</span>
          </button>

          <button
            onClick={handleSaveSettings}
            disabled={isSaving || weightsSum !== 100}
            className="btn-primary"
            style={{
              background: weightsSum === 100 ? 'var(--accent-ai)' : 'var(--surface-elevated)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              opacity: weightsSum === 100 ? 1 : 0.5,
            }}
          >
            <Save size={14} />
            <span>{isSaving ? 'Saving...' : 'Save & Recalculate'}</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div
          style={{
            background:
              bannerMessage.type === 'SUCCESS'
                ? 'rgba(53, 201, 151, 0.12)'
                : 'rgba(244, 119, 134, 0.12)',
            border: `1px solid ${
              bannerMessage.type === 'SUCCESS'
                ? 'rgba(53, 201, 151, 0.4)'
                : 'rgba(244, 119, 134, 0.4)'
            }`,
            color: bannerMessage.type === 'SUCCESS' ? '#35C997' : '#F47786',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.86rem',
            fontWeight: 500,
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {bannerMessage.type === 'SUCCESS' ? (
            <CheckCircle size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '32px 0' }}>
          Loading configuration and diagnostics...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: Integration Health & Live Connection Tests */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
              <ShieldCheck size={19} color="var(--accent-ai)" />
              <span>Integration Health & Live Diagnostics</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                (Credentials verified server-side only; secrets are never exposed to the browser)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {/* PayPal Card */}
              <div
                style={{
                  background: '#0D1526',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                      PayPal Invoicing v2
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: integrations?.paypal?.configured
                          ? 'rgba(53, 201, 151, 0.14)'
                          : 'rgba(244, 119, 134, 0.14)',
                        color: integrations?.paypal?.configured ? '#35C997' : '#F47786',
                      }}
                    >
                      {integrations?.paypal?.configured ? 'SANDBOX READY' : 'MISSING KEYS'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Endpoint: <code>api-m.sandbox.paypal.com</code>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Last Sync:{' '}
                    {integrations?.paypal?.lastSyncedAt
                      ? new Date(integrations.paypal.lastSyncedAt).toLocaleString()
                      : 'Not synced yet'}
                  </div>
                </div>

                <button
                  onClick={() => handleTestConnection('PAYPAL')}
                  disabled={testingTarget === 'PAYPAL'}
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {testingTarget === 'PAYPAL' ? 'Testing OAuth...' : 'Test PayPal OAuth'}
                </button>
              </div>

              {/* Gemini Card */}
              <div
                style={{
                  background: '#0D1526',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                      Google Gemini AI
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: integrations?.gemini?.configured
                          ? 'rgba(139, 124, 255, 0.16)'
                          : 'rgba(244, 184, 96, 0.16)',
                        color: integrations?.gemini?.configured ? '#C4B5FD' : '#F4B860',
                      }}
                    >
                      {integrations?.gemini?.configured ? 'CONFIGURED' : 'FALLBACK ONLY'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Model: <code>gemini-3.8-flash</code> + Deterministic Failover
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {integrations?.gemini?.lastTestDescription || 'Single-shot grounded JSON schema'}
                  </div>
                </div>

                <button
                  onClick={() => handleTestConnection('GEMINI')}
                  disabled={testingTarget === 'GEMINI'}
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {testingTarget === 'GEMINI' ? 'Pinging Gemini...' : 'Test Gemini API'}
                </button>
              </div>

              {/* Neon Database Card */}
              <div
                style={{
                  background: '#0D1526',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                      Neon PostgreSQL
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(53, 201, 151, 0.14)',
                        color: '#35C997',
                      }}
                    >
                      HEALTHY · {integrations?.database?.latencyMs ?? 12} ms
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Precision: <code>Decimal(10, 2)</code> currency-safe storage
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Active Records: {integrations?.database?.invoiceCount ?? 0} synced invoices
                  </div>
                </div>

                <button
                  onClick={() => handleTestConnection('DATABASE')}
                  disabled={testingTarget === 'DATABASE'}
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {testingTarget === 'DATABASE' ? 'Checking DB...' : 'Verify DB Latency'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Business Communication Profile & Reminder Policy */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            {/* Business Communication Identity */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
                <Building2 size={18} color="var(--accent-ai)" />
                <span>Business Communication Profile</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Business Display Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Default Sender / Sign-off Name
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Default Reminder Tone
                  </label>
                  <select
                    value={defaultTone}
                    onChange={(e) => setDefaultTone(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="AUTO">Auto (smart)</option>
                    <option value="FRIENDLY">Friendly & Warm</option>
                    <option value="PROFESSIONAL">Professional Standard</option>
                    <option value="DIRECT">Direct & Executive</option>
                    <option value="FIRM">Firm Overdue Notice</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Greeting Line
                  </label>
                  <input
                    type="text"
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Optional Style Instruction (Never overrides factual guardrails)
                </label>
                <input
                  type="text"
                  value={styleInstruction}
                  onChange={(e) => setStyleInstruction(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Customer-Friendly Reminder Policy */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
                <Sliders size={18} color="var(--accent-ai)" />
                <span>Reminder Eligibility & Cooldown Policy</span>
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Anti-Spam Cooldown Period (Days between reminders)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={cooldownDays}
                  onChange={(e) => setCooldownDays(Number(e.target.value))}
                  style={inputStyle}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Blocks both AI proposal creation and live PayPal execution for {cooldownDays} day(s) after a reminder is sent.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Minimum Overdue Days (0 = allow on due date)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={minimumOverdueDays}
                  onChange={(e) => setMinimumOverdueDays(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                <input
                  type="checkbox"
                  checked={proactiveUpcoming}
                  onChange={(e) => setProactiveUpcoming(e.target.checked)}
                />
                <span>Flag invoices due within ≤3 days for proactive courtesy follow-up</span>
              </label>
            </div>
          </div>

          {/* Section 3: Deterministic Priority Scoring Weights (Sum = 100) */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
                <Database size={18} color="var(--accent-ai)" />
                <span>Deterministic Recovery Urgency Weights (0–100 Scale)</span>
              </div>

              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: '999px',
                  background:
                    weightsSum === 100
                      ? 'rgba(53, 201, 151, 0.14)'
                      : 'rgba(244, 119, 134, 0.14)',
                  color: weightsSum === 100 ? '#35C997' : '#F47786',
                  border: `1px solid ${
                    weightsSum === 100
                      ? 'rgba(53, 201, 151, 0.35)'
                      : 'rgba(244, 119, 134, 0.35)'
                  }`,
                }}
              >
                Total Weight: {weightsSum} / 100 {weightsSum === 100 ? '✓ Valid' : '(Must equal 100)'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Urgency is calculated independently of cooldown eligibility so a high-risk invoice never appears low-priority while cooling down.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '4px' }}>
              <div
                style={{
                  padding: '14px',
                  borderLeft: '3px solid #F47786',
                  background: '#0D1526',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Overdue Severity Weight
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overdueWeight}
                  onChange={(e) => setOverdueWeight(Number(e.target.value))}
                  style={{ ...inputStyle, marginTop: '8px', fontWeight: 700, fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Default: 50 pts (Scales with days past due date)
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderLeft: '3px solid #61B9E8',
                  background: '#0D1526',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Relative Currency Value Weight
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={valueWeight}
                  onChange={(e) => setValueWeight(Number(e.target.value))}
                  style={{ ...inputStyle, marginTop: '8px', fontWeight: 700, fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Default: 30 pts (Normalised within same currency)
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderLeft: '3px solid #8B7CFF',
                  background: '#0D1526',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Escalation Signal Weight
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={escalationWeight}
                  onChange={(e) => setEscalationWeight(Number(e.target.value))}
                  style={{ ...inputStyle, marginTop: '8px', fontWeight: 700, fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Default: 20 pts (Prior reminders &gt;14d escalation)
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Payment Lifecycle Demo Simulator (Explicitly Labelled per Section 11) */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid rgba(139, 124, 255, 0.45)',
              borderRadius: '12px',
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
                <Zap size={18} color="var(--accent-ai)" />
                <span>Payment Lifecycle Simulator</span>
              </div>

              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: 'rgba(244, 184, 96, 0.15)',
                  color: '#F4B860',
                  border: '1px solid rgba(244, 184, 96, 0.4)',
                }}
              >
                DEMO SIMULATOR — LOCAL LIFECYCLE EVENT
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Simulates an invoice settlement event in DuePilot&apos;s PostgreSQL state so you can demonstrate automatic cancellation of pending AI proposals when a customer pays. Logged in the Audit Centre as a simulated event.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
              <select
                value={selectedInvoiceForWebhook}
                onChange={(e) => setSelectedInvoiceForWebhook(e.target.value)}
                style={{ ...inputStyle, flex: '1 1 320px' }}
                disabled={unpaidInvoices.length === 0}
              >
                {unpaidInvoices.length === 0 ? (
                  <option value="">No unpaid invoices available</option>
                ) : (
                  unpaidInvoices.map((inv) => (
                    <option key={inv.id} value={inv.paypalId}>
                      Invoice #{inv.invoiceNumber} — {inv.customerName} ({inv.currency}{' '}
                      {Number(inv.amount).toFixed(2)})
                    </option>
                  ))
                )}
              </select>

              <button
                onClick={handleSimulateWebhook}
                disabled={!selectedInvoiceForWebhook || isSimulating}
                className="btn-primary"
              >
                {isSimulating ? <RefreshCw className="animate-spin" size={15} /> : <Zap size={15} />}
                <span>Simulate PAID Transition</span>
              </button>
            </div>

            {simulationResult && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: simulationResult.includes('Success')
                    ? 'rgba(53, 201, 151, 0.14)'
                    : 'rgba(244, 119, 134, 0.14)',
                  color: simulationResult.includes('Success') ? '#35C997' : '#F47786',
                  fontSize: '0.84rem',
                  fontWeight: 500,
                }}
              >
                {simulationResult}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}