"use client";

import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  FileText,
  AlertCircle,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  Zap,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

type CategoryFilter = 'ALL' | 'SYNC' | 'PROPOSAL' | 'REMINDER' | 'WEBHOOK' | 'FAILED';
type DateRangeFilter = 'ALL' | '24H' | '7D' | '30D';

export default function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/activity');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch activity logs', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getActorLabel = (log: any) => {
    const meta = log.metadata || {};
    if (meta.actor) return String(meta.actor);
    if (
      log.eventType.includes('EDITED') ||
      log.eventType.includes('REJECTED') ||
      log.eventType === 'REMINDER_SENT'
    ) {
      return 'demo-operator';
    }
    if (log.eventType.includes('PROPOSAL')) return 'gemini';
    if (log.eventType.includes('WEBHOOK')) return 'demo-simulator';
    return 'system';
  };

  const getEventIcon = (eventType: string, status: string) => {
    if (status === 'FAILED' || eventType.includes('FAILED')) {
      return <AlertCircle size={16} color="#F47786" />;
    }
    if (eventType.includes('REMINDER')) {
      return <Send size={16} color="#35C997" />;
    }
    if (eventType.includes('WEBHOOK')) {
      return <Zap size={16} color="#F4B860" />;
    }
    if (eventType.includes('SYNC')) {
      return <RefreshCw size={16} color="#61B9E8" />;
    }
    if (status === 'PENDING') {
      return <Clock size={16} color="#F4B860" />;
    }
    if (status === 'SUCCESS') {
      return <CheckCircle size={16} color="#35C997" />;
    }
    return <FileText size={16} color="#8B7CFF" />;
  };

  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: logs.length,
      SYNC: 0,
      PROPOSAL: 0,
      REMINDER: 0,
      WEBHOOK: 0,
      FAILED: 0,
    };
    logs.forEach((l) => {
      if (l.eventType.includes('SYNC')) counts.SYNC++;
      if (l.eventType.includes('PROPOSAL')) counts.PROPOSAL++;
      if (l.eventType.includes('REMINDER')) counts.REMINDER++;
      if (l.eventType.includes('WEBHOOK')) counts.WEBHOOK++;
      if (l.status === 'FAILED' || l.eventType.includes('FAILED')) counts.FAILED++;
    });
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const nowMs = Date.now();
    return logs.filter((log) => {
      // Category filter
      if (activeCategory === 'SYNC' && !log.eventType.includes('SYNC')) return false;
      if (activeCategory === 'PROPOSAL' && !log.eventType.includes('PROPOSAL')) return false;
      if (activeCategory === 'REMINDER' && !log.eventType.includes('REMINDER')) return false;
      if (activeCategory === 'WEBHOOK' && !log.eventType.includes('WEBHOOK')) return false;
      if (
        activeCategory === 'FAILED' &&
        log.status !== 'FAILED' &&
        !log.eventType.includes('FAILED')
      ) {
        return false;
      }

      // Date range filter
      if (dateRange !== 'ALL') {
        const createdMs = new Date(log.createdAt).getTime();
        const maxAgeMs =
          dateRange === '24H'
            ? 24 * 60 * 60 * 1000
            : dateRange === '7D'
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
        if (nowMs - createdMs > maxAgeMs) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchEvent = String(log.eventType || '').toLowerCase().includes(q);
        const matchDesc = String(log.description || '').toLowerCase().includes(q);
        const matchInv = String(log.invoice?.invoiceNumber || '').toLowerCase().includes(q);
        const matchCust = String(log.invoice?.customerName || '').toLowerCase().includes(q);
        const matchRef = String(
          log.proposal?.paypalReference || log.metadata?.paypalDebugId || ''
        )
          .toLowerCase()
          .includes(q);
        return matchEvent || matchDesc || matchInv || matchCust || matchRef;
      }

      return true;
    });
  }, [logs, activeCategory, dateRange, searchQuery]);

  const handleExportCSV = () => {
    window.location.href = '/api/activity/export';
  };

  const formatMoney = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Activity & Audit Centre
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Immutable ledger proving what AI proposed, what the operator authorised, and what PayPal confirmed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchLogs}
            className="btn-primary"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '8px 14px',
            }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="btn-primary"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--accent-ai)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
            }}
          >
            <Download size={15} />
            <span>Export Audit CSV</span>
          </button>
        </div>
      </div>

      {/* Search, Date Range & Category Filter Bar */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#0B1020',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '7px 12px',
              flex: '1 1 280px',
              maxWidth: '420px',
            }}
          >
            <Search size={14} color="var(--text-secondary)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, customer, PayPal debug ID, or event..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.84rem',
                width: '100%',
              }}
            />
          </div>

          {/* Date Range Selector */}
          <div
            style={{
              display: 'flex',
              background: '#0B1020',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '3px',
              gap: '2px',
            }}
          >
            {(
              [
                { id: 'ALL', label: 'All time' },
                { id: '24H', label: 'Last 24h' },
                { id: '7D', label: 'Last 7d' },
                { id: '30D', label: 'Last 30d' },
              ] as Array<{ id: DateRangeFilter; label: string }>
            ).map((d) => (
              <button
                key={d.id}
                onClick={() => setDateRange(d.id)}
                style={{
                  background: dateRange === d.id ? 'var(--surface-elevated)' : 'transparent',
                  color: dateRange === d.id ? '#F2F5FC' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {(
            [
              { id: 'ALL', label: `All Events (${categoryCounts.ALL})` },
              { id: 'PROPOSAL', label: `AI & Proposals (${categoryCounts.PROPOSAL})` },
              { id: 'REMINDER', label: `PayPal Reminders (${categoryCounts.REMINDER})` },
              { id: 'SYNC', label: `PayPal Syncs (${categoryCounts.SYNC})` },
              { id: 'WEBHOOK', label: `Payment Lifecycle (${categoryCounts.WEBHOOK})` },
              { id: 'FAILED', label: `Blocked / Failed (${categoryCounts.FAILED})` },
            ] as Array<{ id: CategoryFilter; label: string }>
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveCategory(f.id)}
              style={{
                background:
                  activeCategory === f.id
                    ? 'rgba(139, 124, 255, 0.16)'
                    : 'var(--surface-elevated)',
                color: activeCategory === f.id ? 'var(--accent-ai)' : 'var(--text-secondary)',
                border: `1px solid ${
                  activeCategory === f.id
                    ? 'rgba(139, 124, 255, 0.45)'
                    : 'var(--border-subtle)'
                }`,
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '0.76rem',
                fontWeight: activeCategory === f.id ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Ledger Timeline */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '20px 24px',
          minHeight: '460px',
        }}
      >
        {isLoading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '48px' }}>
            Loading immutable audit ledger...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '48px' }}>
            No audit events match the current search or filter criteria.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredLogs.map((log) => {
              const actor = getActorLabel(log);
              const isExpanded = Boolean(expandedIds[log.id]);
              const isSimulatedWebhook = log.eventType === 'WEBHOOK_RECEIVED';

              return (
                <div
                  key={log.id}
                  style={{
                    background: '#0D1526',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                      <div
                        style={{
                          marginTop: '2px',
                          background: 'var(--surface-elevated)',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {getEventIcon(log.eventType, log.status)}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                            {isSimulatedWebhook
                              ? 'DEMO PAYMENT SIMULATED'
                              : log.eventType.replace(/_/g, ' ')}
                          </span>

                          {/* Status Badge */}
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background:
                                log.status === 'SUCCESS'
                                  ? 'rgba(53, 201, 151, 0.14)'
                                  : log.status === 'PENDING'
                                  ? 'rgba(244, 184, 96, 0.14)'
                                  : 'rgba(244, 119, 134, 0.14)',
                              color:
                                log.status === 'SUCCESS'
                                  ? '#35C997'
                                  : log.status === 'PENDING'
                                  ? '#F4B860'
                                  : '#F47786',
                            }}
                          >
                            {log.status}
                          </span>

                          {/* Actor Badge */}
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: 'var(--surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              color:
                                actor === 'gemini'
                                  ? '#C4B5FD'
                                  : actor === 'demo-simulator'
                                  ? '#F4B860'
                                  : 'var(--text-secondary)',
                              fontWeight: 600,
                            }}
                          >
                            {actor}
                          </span>

                          {/* Linked Invoice Pill */}
                          {log.invoice && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                background: 'var(--surface)',
                                border: '1px solid var(--border-subtle)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                fontWeight: 600,
                              }}
                            >
                              Inv #{log.invoice.invoiceNumber} ·{' '}
                              {formatMoney(log.invoice.amount, log.invoice.currency)}
                            </span>
                          )}
                        </div>

                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                          {log.description}
                        </div>
                      </div>
                    </div>

                    {/* Right Timestamp + Expand Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => toggleExpand(log.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        <span>Details</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Safe Metadata & Record Links */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '6px',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.76rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Event ID: </span>
                          <code style={{ color: 'var(--text-primary)' }}>{log.id.slice(0, 12)}...</code>
                        </div>
                        {log.proposal?.paypalReference && (
                          <div>
                            <span style={{ color: 'var(--text-secondary)' }}>PayPal Debug-Id: </span>
                            <code style={{ color: '#35C997' }}>{log.proposal.paypalReference}</code>
                          </div>
                        )}
                        {log.metadata &&
                          Object.entries(log.metadata)
                            .filter(([k]) => k !== 'originalMessage')
                            .map(([k, v]) => (
                              <div key={k}>
                                <span style={{ color: 'var(--text-secondary)' }}>{k}: </span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                  {String(v)}
                                </span>
                              </div>
                            ))}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {log.invoiceId && (
                          <Link
                            href="/invoices"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.74rem',
                              color: 'var(--accent-ai)',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <span>View Invoice</span>
                            <ExternalLink size={12} />
                          </Link>
                        )}
                        {log.proposalId && (
                          <Link
                            href="/assistant"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.74rem',
                              color: '#35C997',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <span>Open Review Desk</span>
                            <ExternalLink size={12} />
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}