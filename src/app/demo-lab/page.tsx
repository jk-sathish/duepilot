"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  FlaskConical,
  PlusCircle,
  Trash2,
  RefreshCw,
  ShieldAlert,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

export default function DemoLabPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'SUCCESS' | 'ERROR';
    text: string;
  } | null>(null);

  // Real Sandbox Invoice Creator Form
  const [customerName, setCustomerName] = useState('Northwind Traders');
  const [customerEmail, setCustomerEmail] = useState('buyer@example.test');
  const [amount, setAmount] = useState('1450.00');
  const [currency, setCurrency] = useState('USD');
  const [dueOffsetDays, setDueOffsetDays] = useState('2');

  const fetchLabState = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/demo-lab');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLabState();
  }, [fetchLabState]);

  const runAction = async (payload: Record<string, any>) => {
    setIsWorking(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/demo-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Operation failed');
      setFeedback({ type: 'SUCCESS', text: json.message });
      await fetchLabState();
    } catch (err: any) {
      setFeedback({ type: 'ERROR', text: err.message });
    } finally {
      setIsWorking(false);
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
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Demo Lab & Scenario Generator
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Create real PayPal Sandbox invoices or load isolated test fixtures with strict source labelling.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.76rem',
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(53, 201, 151, 0.14)',
              border: '1px solid rgba(53, 201, 151, 0.35)',
              color: '#35C997',
              fontWeight: 600,
            }}
          >
            Real PayPal Sandbox Records: {data?.sandboxCount ?? 0}
          </span>
          <span
            style={{
              fontSize: '0.76rem',
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(244, 184, 96, 0.14)',
              border: '1px solid rgba(244, 184, 96, 0.35)',
              color: '#F4B860',
              fontWeight: 600,
            }}
          >
            Isolated Demo Fixtures: {data?.fixtureCount ?? 0}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            background:
              feedback.type === 'SUCCESS'
                ? 'rgba(53, 201, 151, 0.12)'
                : 'rgba(244, 119, 134, 0.12)',
            border: `1px solid ${
              feedback.type === 'SUCCESS'
                ? 'rgba(53, 201, 151, 0.4)'
                : 'rgba(244, 119, 134, 0.4)'
            }`,
            color: feedback.type === 'SUCCESS' ? '#35C997' : '#F47786',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.86rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {feedback.type === 'SUCCESS' ? (
            <CheckCircle size={16} />
          ) : (
            <ShieldAlert size={16} />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Card 1: Create Real PayPal Sandbox Invoice */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
              <PlusCircle size={18} color="#35C997" />
              <span>Create Real PayPal Sandbox Invoice</span>
            </div>
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
              LIVE SANDBOX API
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Calls <code>POST /v2/invoicing/invoices</code> on PayPal Sandbox using your OAuth credentials and immediately syncs the created record into DuePilot.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Customer Sandbox Email
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Currency
              </label>
              <select
             value={currency}
             onChange={(e) => setCurrency(e.target.value)}
             style={inputStyle}
           >
             <option value="USD">USD ($)</option>
             <option value="EUR">EUR (€)</option>
             <option value="INR">INR (₹)</option>
           </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Due Date Offset (Days)
              </label>
              <input
                type="number"
                value={dueOffsetDays}
                onChange={(e) => setDueOffsetDays(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            onClick={() =>
              runAction({
                action: 'CREATE_SANDBOX_INVOICE',
                customerName,
                customerEmail,
                amount: Number(amount),
                currency,
                dueOffsetDays: Number(dueOffsetDays),
              })
            }
            disabled={isWorking}
            className="btn-primary"
            style={{ width: 'fit-content', marginTop: '4px' }}
          >
            {isWorking ? <RefreshCw size={15} className="animate-spin" /> : <PlusCircle size={15} />}
            <span>Create in PayPal Sandbox & Sync</span>
          </button>
        </div>

        {/* Card 2: Isolated Local Demo Scenario Fixtures */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '1.02rem' }}>
                <FlaskConical size={18} color="var(--accent-ai)" />
                <span>Isolated Demo Scenario Pack</span>
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(244, 184, 96, 0.15)',
                  color: '#F4B860',
                }}
              >
                DEMO FIXTURE — NOT A PAYPAL RECORD
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Loads auxiliary local fixtures (15d overdue, 5d overdue, due tomorrow, and settled) alongside your real PayPal Sandbox invoices to showcase ageing buckets. Fixtures are tagged <code>source = DEMO</code> and are strictly blocked from triggering real PayPal API reminders.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => runAction({ action: 'SEED_JUDGE_PORTFOLIO' })}
              disabled={isWorking}
              className="btn-primary"
              style={{
                background: 'rgba(139, 124, 255, 0.18)',
                border: '1px solid rgba(139, 124, 255, 0.45)',
                color: '#F2F5FC',
              }}
            >
              <Sparkles size={15} color="var(--accent-ai)" />
              <span>Provision 10-Invoice Judge Portfolio (USD / EUR / INR)</span>
            </button>

            <button
              onClick={() => runAction({ action: 'CLEAR_FIXTURES' })}
              disabled={isWorking || (data?.fixtureCount ?? 0) === 0}
              className="btn-primary"
              style={{
                background: 'rgba(244, 119, 134, 0.14)',
                border: '1px solid rgba(244, 119, 134, 0.4)',
                color: '#F47786',
              }}
            >
              <Trash2 size={15} />
              <span>Purge Demo Fixtures Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Current Records & Provenance Table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '20px 24px',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '14px' }}>
          Current Workspace Invoices & Source Provenance
        </div>

        {isLoading ? (
          <div style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>
            Loading invoice provenance...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ paddingBottom: '10px' }}>Invoice #</th>
                <th style={{ paddingBottom: '10px' }}>Customer</th>
                <th style={{ paddingBottom: '10px' }}>Amount</th>
                <th style={{ paddingBottom: '10px' }}>Status</th>
                <th style={{ paddingBottom: '10px' }}>Source Classification</th>
              </tr>
            </thead>
            <tbody>
              {(data?.invoices || []).map((inv: any) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px 0', fontWeight: 700, fontSize: '0.86rem' }}>
                    #{inv.invoiceNumber}
                  </td>
                  <td style={{ padding: '12px 0', fontSize: '0.85rem' }}>
                    {inv.customerName}{' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                      ({inv.customerEmail})
                    </span>
                  </td>
                  <td style={{ padding: '12px 0', fontWeight: 600, fontSize: '0.85rem' }}>
                    {inv.currency} {Number(inv.amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 0', fontSize: '0.8rem' }}>{inv.status}</td>
                  <td style={{ padding: '12px 0' }}>
                    {inv.source === 'DEMO' ? (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'rgba(244, 184, 96, 0.14)',
                          color: '#F4B860',
                          border: '1px solid rgba(244, 184, 96, 0.35)',
                        }}
                      >
                        DEMO FIXTURE — NOT A PAYPAL RECORD
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'rgba(53, 201, 151, 0.14)',
                          color: '#35C997',
                          border: '1px solid rgba(53, 201, 151, 0.35)',
                        }}
                      >
                        LIVE PAYPAL SANDBOX ({inv.paypalId})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}