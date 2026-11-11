"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Zap,
  Clock,
  FileText,
  CheckCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [currency, setCurrency] = useState<string>('USD');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishedBriefing, setPolishedBriefing] = useState<string | null>(null);
  const [briefingSource, setBriefingSource] = useState<'Deterministic' | 'Gemini'>('Deterministic');

  const fetchDashboard = useCallback(async (curr: string = currency) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dashboard?currency=${encodeURIComponent(curr)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setPolishedBriefing(null);
        setBriefingSource('Deterministic');
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currency]);

  useEffect(() => {
    fetchDashboard(currency);
  }, [currency, fetchDashboard]);

  const handleSyncPayPal = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/paypal/sync', { method: 'POST' });
      await fetchDashboard(currency);
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePolishWithGemini = async () => {
    setIsPolishing(true);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:
            'Provide a concise 2-sentence executive portfolio briefing of my current unpaid and overdue invoices, highlighting the top priority invoice and cooldown status.',
        }),
      });
      const json = await res.json();
      if (res.ok && json.reply) {
        setPolishedBriefing(json.reply);
        const usedFallback = (json.toolTrace || []).some((t: any) =>
          String(t.tool).includes('fallback')
        );
        setBriefingSource(usedFallback ? 'Deterministic' : 'Gemini');
        await fetchDashboard(currency);
      }
    } catch (e) {
      console.error('Failed to polish briefing:', e);
    } finally {
      setIsPolishing(false);
    }
  };

  const formatMoney = (val: number, curr: string = currency) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(val || 0);

  const getBandColor = (band: string) =>
    band === 'CRITICAL'
      ? '#F47786'
      : band === 'HIGH'
      ? '#F4B860'
      : band === 'MEDIUM'
      ? '#8B7CFF'
      : '#61B9E8';

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'just now';
    const diffMin = Math.max(
      0,
      Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60))
    );
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} h ago`;
    return `${Math.floor(diffHours / 24)} d ago`;
  };

  // Compute SVG Donut segments for Priority Mix
  const renderPriorityDonut = () => {
    const mix = data?.priorityMix || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const total =
      (mix.CRITICAL || 0) + (mix.HIGH || 0) + (mix.MEDIUM || 0) + (mix.LOW || 0);
    const radius = 44;
    const circumference = 2 * Math.PI * radius;

    const segments = [
      { key: 'Critical', count: mix.CRITICAL || 0, color: '#F47786' },
      { key: 'High', count: mix.HIGH || 0, color: '#F4B860' },
      { key: 'Medium', count: mix.MEDIUM || 0, color: '#8B7CFF' },
      { key: 'Low', count: mix.LOW || 0, color: '#61B9E8' },
    ];

    let accumulatedPercent = 0;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginTop: '8px' }}>
        <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke="var(--surface-elevated)"
              strokeWidth="14"
            />
            {total > 0 &&
              segments.map((seg) => {
                if (seg.count <= 0) return null;
                const percent = seg.count / total;
                const strokeDasharray = `${percent * circumference} ${circumference}`;
                const strokeDashoffset = -accumulatedPercent * circumference;
                accumulatedPercent += percent;
                return (
                  <circle
                    key={seg.key}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                  />
                );
              })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {total}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              open invoices
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {segments.map((seg) => (
            <div
              key={seg.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: seg.color,
                  }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>{seg.key}</span>
              </div>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{seg.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Command Centre
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Receivables health and AI recovery status · synced{' '}
            {formatRelativeTime(data?.lastSyncedAt)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Currency Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '3px',
            }}
          >
            {(data?.availableCurrencies || ['USD', 'EUR', 'INR']).map((curr: string) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                style={{
                  background: currency === curr ? 'var(--surface-elevated)' : 'transparent',
                  color: currency === curr ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {curr}
              </button>
            ))}
          </div>

          <button
            onClick={handleSyncPayPal}
            disabled={isSyncing}
            className="btn-primary"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '8px 14px',
            }}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync PayPal'}</span>
          </button>

          <Link
            href="/assistant"
            className="btn-primary"
            style={{
              background: 'var(--accent-ai)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              textDecoration: 'none',
            }}
          >
            <Sparkles size={14} />
            <span>+ Run AI Recovery</span>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '32px 0' }}>
          Loading executive metrics...
        </div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* AI Portfolio Briefing Box */}
          <div
            style={{
              background: 'rgba(139, 124, 255, 0.08)',
              border: '1px solid rgba(139, 124, 255, 0.3)',
              borderRadius: '12px',
              padding: '18px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '14px', flex: '1 1 520px' }}>
              <div
                style={{
                  marginTop: '2px',
                  background: 'rgba(139, 124, 255, 0.18)',
                  padding: '8px',
                  borderRadius: '8px',
                  height: 'fit-content',
                }}
              >
                <Zap size={18} color="var(--accent-ai)" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    AI portfolio briefing
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      background: 'rgba(139, 124, 255, 0.16)',
                      border: '1px solid rgba(139, 124, 255, 0.35)',
                      color: 'var(--accent-ai)',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontWeight: 600,
                    }}
                  >
                    {briefingSource}
                  </span>
                </div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                  {polishedBriefing || data.briefing}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
              <button
                onClick={handlePolishWithGemini}
                disabled={isPolishing}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {isPolishing ? 'Polishing...' : '+ Polish with Gemini'}
              </button>
              <Link
                href="/assistant"
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 14px',
                  background: 'var(--accent-ai)',
                  color: '#fff',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Review {data.metrics.pendingProposalsCount} pending drafts →
              </Link>
            </div>
          </div>

          {/* 8 KPI Cards (2 rows of 4) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))',
              gap: '14px',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Outstanding
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {formatMoney(data.metrics.outstanding)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {data.metrics.unpaidCount} unpaid receivables
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid rgba(244, 119, 134, 0.35)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Overdue at Risk
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--danger)', margin: '6px 0 4px' }}>
                {formatMoney(data.metrics.overdue)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {data.metrics.overduePercent}% of outstanding · {data.metrics.overdueCount} invoices
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid rgba(244, 184, 96, 0.35)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Due in 3 Days
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {formatMoney(data.metrics.dueIn3Days)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {data.metrics.dueIn3DaysCount} invoice approaching due date
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Unpaid Invoices
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {data.metrics.unpaidCount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {data.metrics.overdueCount} overdue
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AI Proposals
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {data.metrics.pendingProposalsCount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                awaiting your review
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Reminders Sent
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {data.metrics.executedRemindersCount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                via PayPal Sandbox
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Protected by Cooldown
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 4px' }}>
                {data.metrics.cooldownCount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                cannot be reminded yet
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid rgba(53, 201, 151, 0.35)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--positive)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Eligible Now
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--positive)', margin: '6px 0 4px' }}>
                {data.metrics.eligibleCount}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                ready for follow-up
              </div>
            </div>
          </div>

          {/* Middle Row: Receivables Aging & Priority Mix Donut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.85fr 1fr', gap: '18px' }}>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Receivables aging
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {currency} · by days overdue
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Not due', data: data.aging.notDue, color: '#61B9E8' },
                  { label: '1–7 days', data: data.aging.days1_7, color: '#8B7CFF' },
                  { label: '8–14 days', data: data.aging.days8_14, color: '#F4B860' },
                  { label: '15–30 days', data: data.aging.days15_30, color: '#F47786' },
                  { label: '30+ days', data: data.aging.days30Plus, color: '#D15C69' },
                ].map((row, i) => {
                  const pct =
                    data.metrics.outstanding > 0
                      ? Math.max(row.data.amount > 0 ? 4 : 0, (row.data.amount / data.metrics.outstanding) * 100)
                      : 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '85px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {row.label}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          background: 'var(--surface-elevated)',
                          height: '10px',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: row.color,
                            borderRadius: '999px',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          width: '95px',
                          textAlign: 'right',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {formatMoney(row.data.amount)}
                      </div>
                      <div
                        style={{
                          width: '22px',
                          textAlign: 'right',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {row.data.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Priority mix
              </div>
              {renderPriorityDonut()}
            </div>
          </div>

          {/* Bottom Row: Top 5 Action Queue + Right Column (Reminder Outcomes & Recent Activity) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.85fr 1fr', gap: '18px' }}>
            {/* Top 5 Action Queue */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Do this next — top 5 by urgency
                </span>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span>● overdue</span>
                  <span>● value</span>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ paddingBottom: '10px' }}>#</th>
                    <th style={{ paddingBottom: '10px' }}>Invoice</th>
                    <th style={{ paddingBottom: '10px' }}>Amount</th>
                    <th style={{ paddingBottom: '10px' }}>Urgency</th>
                    <th style={{ paddingBottom: '10px' }}>Action State</th>
                    <th style={{ paddingBottom: '10px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.top5.map((inv: any, idx: number) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '14px 0' }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          #{inv.invoiceNumber}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {inv.customerName}
                        </div>
                      </td>
                      <td style={{ padding: '14px 0', fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatMoney(inv.amount, inv.currency)}
                      </td>
                      <td style={{ padding: '14px 0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '72px',
                                height: '6px',
                                background: 'var(--surface-elevated)',
                                borderRadius: '999px',
                                overflow: 'hidden',
                                display: 'flex',
                              }}
                            >
                              <div
                                style={{
                                  width: `${inv.overdueScore}%`,
                                  height: '100%',
                                  background: '#F47786',
                                }}
                              />
                              <div
                                style={{
                                  width: `${inv.valueScore}%`,
                                  height: '100%',
                                  background: '#61B9E8',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {inv.urgency}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: getBandColor(inv.priorityBand),
                              background: 'var(--surface-elevated)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                          >
                            {inv.priorityBand}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 0' }}>
                        {inv.eligible ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--positive)',
                              background: 'rgba(53, 201, 151, 0.12)',
                              border: '1px solid rgba(53, 201, 151, 0.35)',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontWeight: 600,
                            }}
                          >
                            ✓ Eligible
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--warning)',
                              background: 'rgba(244, 184, 96, 0.12)',
                              border: '1px solid rgba(244, 184, 96, 0.35)',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontWeight: 600,
                            }}
                          >
                            ● Cooldown · {inv.cooldownDaysLeft}d
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 0', textAlign: 'right' }}>
                        {inv.eligible ? (
                          <Link
                            href="/assistant"
                            style={{
                              fontSize: '0.76rem',
                              background: 'var(--accent-ai)',
                              color: '#fff',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: 600,
                              display: 'inline-block',
                            }}
                          >
                            Draft follow-up
                          </Link>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              background: 'var(--surface-elevated)',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              display: 'inline-block',
                            }}
                          >
                            Cooling down
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right Column: Reminder Outcomes + Recent Activity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Reminder Outcomes Card */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                }}
              >
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  Reminder outcomes
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Paid After Reminder
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {data.outcomes?.paidAfterReminderCount || 0}{' '}
                      <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                        of {data.outcomes?.remindedInvoicesCount || 0}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Amount
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--positive)', marginTop: '2px' }}>
                      {formatMoney(data.outcomes?.paidAfterReminderAmount || 0)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Conversion
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {data.outcomes?.conversionRate || 0}%
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Median Time to Pay
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {data.outcomes?.medianHoursToPay ? `${data.outcomes.medianHoursToPay} h` : '—'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    lineHeight: 1.4,
                  }}
                >
                  Payments observed after a reminder — a time-based association, not proof the reminder caused payment.
                </div>
              </div>

              {/* Recent Activity Card */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  flex: 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Recent activity
                  </div>
                  <Link href="/activity" style={{ fontSize: '0.78rem', color: 'var(--accent-ai)', textDecoration: 'none' }}>
                    View all →
                  </Link>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.recentActivity.map((log: any) => {
                    const actor = log.eventType.includes('EDITED') || log.eventType.includes('REMINDER')
                      ? 'demo-operator'
                      : log.eventType.includes('PROPOSAL')
                      ? 'gemini'
                      : 'system';

                    return (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div
                            style={{
                              background: 'var(--surface-elevated)',
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {log.eventType.includes('PROPOSAL') ? (
                              <FileText size={13} color="var(--accent-ai)" />
                            ) : log.eventType.includes('REMINDER') ? (
                              <Send size={13} color="var(--positive)" />
                            ) : log.eventType.includes('WEBHOOK') ? (
                              <CheckCircle size={13} color="var(--positive)" />
                            ) : (
                              <Clock size={13} color="var(--text-secondary)" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {log.eventType.replace(/_/g, ' ')}
                              {log.invoice?.invoiceNumber ? ` · #${log.invoice.invoiceNumber}` : ''}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {formatRelativeTime(log.createdAt)}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: actor === 'gemini' ? 'var(--accent-ai)' : 'var(--text-secondary)',
                          }}
                        >
                          {actor}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}