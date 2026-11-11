"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  RefreshCw,
  X,
  Search,
  Copy,
  Check,
  Zap,
  Send,
} from 'lucide-react';
import Link from 'next/link';

ModuleRegistry.registerModules([AllCommunityModule]);

type FilterKey = 'ALL' | 'UNPAID' | 'OVERDUE' | 'DUE_SOON' | 'PAID' | 'COOLDOWN';

export default function InvoicesPage() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');

  // Drawer State
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isSimulatingPay, setIsSimulatingPay] = useState(false);

  const isPaidStatus = (status: string) => {
    const upper = (status || '').toUpperCase();
    return upper.includes('PAID') && !upper.includes('UNPAID') && !upper.includes('PARTIALLY');
  };

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices');
      if (res.ok) {
        const data = await res.json();
        setRowData(data);
        setSelectedInvoice((prev: any) => {
          if (!prev) return null;
          return data.find((item: any) => item.id === prev.id) || prev;
        });
      }
    } catch (error) {
      console.error('Failed to load invoices', error);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const loadDrawerHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.ok) {
        setInvoiceHistory(await res.json());
      }
    } catch (error) {
      console.error('Failed to load invoice history', error);
    }
  };

  const openDrawer = async (invoiceData: any) => {
    setSelectedInvoice(invoiceData);
    setIsDrawerOpen(true);
    setInvoiceHistory(null);
    await loadDrawerHistory(invoiceData.id);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/paypal/sync', { method: 'POST' });
      if (res.ok) {
        await fetchInvoices();
        if (selectedInvoice?.id) {
          await loadDrawerHistory(selectedInvoice.id);
        }
      }
    } catch (error) {
      console.error('Sync failed', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!selectedInvoice) return;
    setIsSimulatingPay(true);
    try {
      const res = await fetch('/api/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'INVOICING.INVOICE.PAID',
          paypalId: selectedInvoice.paypalId,
        }),
      });
      if (res.ok) {
        await fetchInvoices();
        await loadDrawerHistory(selectedInvoice.id);
      }
    } catch (e) {
      console.error('Simulate payment error:', e);
    } finally {
      setIsSimulatingPay(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  // Compute Filter Counts
  const filterCounts = useMemo(() => {
    const counts = {
      ALL: rowData.length,
      UNPAID: 0,
      OVERDUE: 0,
      DUE_SOON: 0,
      PAID: 0,
      COOLDOWN: 0,
    };

    rowData.forEach((inv) => {
      const paid = isPaidStatus(inv.status);
      if (paid) {
        counts.PAID++;
      } else {
        counts.UNPAID++;
        if (inv.overdueDays > 0) counts.OVERDUE++;
        else if (inv.daysUntilDue !== null && inv.daysUntilDue >= 0 && inv.daysUntilDue <= 3) {
          counts.DUE_SOON++;
        }
        if (inv.reminderHistoryStatus === 'RECENTLY_REMINDED') {
          counts.COOLDOWN++;
        }
      }
    });

    return counts;
  }, [rowData]);

  // Filtered Rows for AG Grid
  const filteredRows = useMemo(() => {
    return rowData.filter((inv) => {
      const paid = isPaidStatus(inv.status);
      if (activeFilter === 'UNPAID' && paid) return false;
      if (activeFilter === 'PAID' && !paid) return false;
      if (activeFilter === 'OVERDUE' && (paid || inv.overdueDays <= 0)) return false;
      if (
        activeFilter === 'DUE_SOON' &&
        (paid || inv.overdueDays > 0 || inv.daysUntilDue === null || inv.daysUntilDue > 3)
      ) {
        return false;
      }
      if (activeFilter === 'COOLDOWN' && inv.reminderHistoryStatus !== 'RECENTLY_REMINDED') {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = String(inv.invoiceNumber || '').toLowerCase().includes(q);
        const matchCust = String(inv.customerName || '').toLowerCase().includes(q);
        const matchEmail = String(inv.customerEmail || '').toLowerCase().includes(q);
        const matchAmt = String(inv.amount || '').includes(q);
        return matchNum || matchCust || matchEmail || matchAmt;
      }

      return true;
    });
  }, [rowData, activeFilter, searchQuery]);

  const formatMoney = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const diffMin = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)} day(s) ago`;
  };

  const getBandColor = (band: string) =>
    band === 'CRITICAL'
      ? '#F47786'
      : band === 'HIGH'
      ? '#F4B860'
      : band === 'MEDIUM'
      ? '#8B7CFF'
      : '#61B9E8';

  const columnDefs: ColDef[] = [
    {
      field: 'invoiceNumber',
      headerName: '#',
      flex: 0.7,
      sortable: true,
      valueFormatter: (params: any) => `#${params.value}`,
      cellStyle: { fontWeight: '600', color: '#F2F5FC' },
    },
    {
      field: 'customerName',
      headerName: 'CUSTOMER',
      flex: 1.3,
      sortable: true,
      cellRenderer: (params: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, paddingTop: '4px' }}>
          <span style={{ fontWeight: 600, color: '#F2F5FC', fontSize: '0.86rem' }}>
            {params.data?.customerName}
          </span>
          <span style={{ fontSize: '0.73rem', color: '#71819B' }}>
            {params.data?.customerEmail}
          </span>
        </div>
      ),
    },
    {
      field: 'amount',
      headerName: 'AMOUNT',
      flex: 0.9,
      sortable: true,
      valueFormatter: (params: any) =>
        formatMoney(params.value ?? 0, params.data?.currency || 'USD'),
      cellStyle: { fontWeight: '700', color: '#F2F5FC' },
    },
    {
      field: 'status',
      headerName: 'STATUS',
      flex: 0.8,
      sortable: true,
      cellRenderer: (params: any) => {
        const status = String(params.value || '').toUpperCase();
        const paid = isPaidStatus(status);
        return (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              background: paid ? 'rgba(53, 201, 151, 0.14)' : 'rgba(244, 184, 96, 0.14)',
              color: paid ? '#35C997' : '#F4B860',
              border: `1px solid ${paid ? 'rgba(53, 201, 151, 0.35)' : 'rgba(244, 184, 96, 0.35)'}`,
            }}
          >
            {status}
          </span>
        );
      },
    },
    {
      field: 'dueDate',
      headerName: 'DUE',
      flex: 0.9,
      sortable: true,
      cellRenderer: (params: any) => {
        const d = params.data;
        const paid = isPaidStatus(d?.status);
        const subLabel = paid
          ? '—'
          : d?.overdueDays > 0
          ? `${d.overdueDays}d ago`
          : d?.daysUntilDue !== null
          ? `in ${d.daysUntilDue}d`
          : '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, paddingTop: '4px' }}>
            <span style={{ fontSize: '0.84rem', color: '#F2F5FC' }}>
              {formatShortDate(params.value)}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                color: !paid && d?.overdueDays > 0 ? '#F47786' : '#71819B',
              }}
            >
              {subLabel}
            </span>
          </div>
        );
      },
    },
    {
      field: 'priorityScore',
      headerName: 'URGENCY',
      flex: 1.0,
      sortable: true,
      cellRenderer: (params: any) => {
        const d = params.data;
        if (isPaidStatus(d?.status)) {
          return <span style={{ color: '#71819B', fontSize: '0.8rem' }}>—</span>;
        }
        const color = getBandColor(d?.priorityBand);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'var(--surface-elevated)',
                color,
              }}
            >
              {d?.priorityBand}
            </span>
            <span style={{ fontWeight: 700, color: '#F2F5FC', fontSize: '0.84rem' }}>
              {params.value}
            </span>
          </div>
        );
      },
    },
    {
      field: 'eligibleForReminder',
      headerName: 'ELIGIBILITY',
      flex: 1.1,
      cellRenderer: (params: any) => {
        const d = params.data;
        if (isPaidStatus(d?.status)) {
          return <span style={{ color: '#35C997', fontSize: '0.78rem' }}>Settled</span>;
        }
        if (d?.eligibleForReminder) {
          return (
            <span
              style={{
                fontSize: '0.72rem',
                color: '#35C997',
                background: 'rgba(53, 201, 151, 0.12)',
                border: '1px solid rgba(53, 201, 151, 0.35)',
                padding: '3px 9px',
                borderRadius: '999px',
                fontWeight: 600,
              }}
            >
              ✓ Eligible
            </span>
          );
        }
        return (
          <span
            style={{
              fontSize: '0.72rem',
              color: '#F4B860',
              background: 'rgba(244, 184, 96, 0.12)',
              border: '1px solid rgba(244, 184, 96, 0.35)',
              padding: '3px 9px',
              borderRadius: '999px',
              fontWeight: 600,
            }}
          >
            ● Cooldown · {d?.cooldownDaysLeft || 1}d left
          </span>
        );
      },
    },
  ];

  // Circular SVG Gauge for the Drawer
  const renderUrgencyRing = (score: number, band: string) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.min(100, Math.max(0, score)) / 100;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const color = getBandColor(band);

    return (
      <div style={{ position: 'relative', width: '76px', height: '76px', flexShrink: 0 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="38"
            cy="38"
            r={radius}
            fill="transparent"
            stroke="var(--surface-elevated)"
            strokeWidth="7"
          />
          <circle
            cx="38"
            cy="38"
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {score}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ position: 'relative' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Invoices
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Live PayPal Sandbox records. Click any row for its intelligence breakdown.
          </p>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="btn-primary">
          <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Syncing PayPal...' : 'Sync from PayPal'}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#0B1020',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '7px 12px',
            flex: '1 1 260px',
            maxWidth: '360px',
          }}
        >
          <Search size={14} color="var(--text-secondary)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice, customer, amount..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {(
            [
              { key: 'ALL', label: `All ${filterCounts.ALL}` },
              { key: 'UNPAID', label: `Unpaid ${filterCounts.UNPAID}` },
              { key: 'OVERDUE', label: `Overdue ${filterCounts.OVERDUE}` },
              { key: 'DUE_SOON', label: `Due soon ${filterCounts.DUE_SOON}` },
              { key: 'PAID', label: `Paid ${filterCounts.PAID}` },
              { key: 'COOLDOWN', label: `Cooldown ${filterCounts.COOLDOWN}` },
            ] as Array<{ key: FilterKey; label: string }>
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              style={{
                background:
                  activeFilter === f.key ? 'rgba(139, 124, 255, 0.16)' : 'var(--surface-elevated)',
                color: activeFilter === f.key ? 'var(--accent-ai)' : 'var(--text-secondary)',
                border: `1px solid ${
                  activeFilter === f.key ? 'rgba(139, 124, 255, 0.4)' : 'var(--border-subtle)'
                }`,
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '0.76rem',
                fontWeight: activeFilter === f.key ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* AG Grid Table */}
      <div
        className="ag-theme-alpine-dark"
        style={{
          height: '520px',
          width: '100%',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        }}
      >
        <AgGridReact
          theme="legacy"
          rowData={filteredRows}
          columnDefs={columnDefs}
          rowHeight={56}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 20, 50]}
          onRowClicked={(e) => openDrawer(e.data)}
          rowStyle={{ cursor: 'pointer' }}
        />
      </div>

      {/* Slide-Over Invoice Intelligence Drawer */}
      {isDrawerOpen && selectedInvoice && (
        <>
          <div
            onClick={() => setIsDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5, 9, 18, 0.65)',
              zIndex: 999,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '500px',
              maxWidth: '100vw',
              height: '100vh',
              background: '#0E1627',
              borderLeft: '1px solid var(--border-subtle)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-14px 0 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Scrollable Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '26px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Top Title & Customer Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Invoice #{selectedInvoice.invoiceNumber}
                  </h2>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                      fontSize: '0.82rem',
                    }}
                  >
                    <span>
                      {selectedInvoice.customerName} · {selectedInvoice.customerEmail}
                    </span>
                    <button
                      onClick={() => handleCopyText(selectedInvoice.paypalId)}
                      title={`Copy PayPal ID: ${selectedInvoice.paypalId}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      {copiedId ? <Check size={13} color="#35C997" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Large Currency Amount + Status & Overdue Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedInvoice.currency}{' '}
                  {Number(selectedInvoice.amount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: '6px',
                    background: isPaidStatus(selectedInvoice.status)
                      ? 'rgba(53, 201, 151, 0.15)'
                      : 'rgba(244, 184, 96, 0.15)',
                    color: isPaidStatus(selectedInvoice.status) ? '#35C997' : '#F4B860',
                    border: `1px solid ${
                      isPaidStatus(selectedInvoice.status)
                        ? 'rgba(53, 201, 151, 0.35)'
                        : 'rgba(244, 184, 96, 0.35)'
                    }`,
                  }}
                >
                  {selectedInvoice.status}
                </span>

                {!isPaidStatus(selectedInvoice.status) && selectedInvoice.overdueDays > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      background: 'rgba(244, 119, 134, 0.14)',
                      color: '#F47786',
                      border: '1px solid rgba(244, 119, 134, 0.35)',
                    }}
                  >
                    {selectedInvoice.overdueDays} days overdue
                  </span>
                )}
              </div>

              {/* Card 1: Urgency Score — How important is this? */}
              <div
                style={{
                  background: '#131D31',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  ◎ Urgency score — how important is this?
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  {renderUrgencyRing(
                    selectedInvoice.priorityScore || 0,
                    selectedInvoice.priorityBand || 'LOW'
                  )}

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Factor 1: Overdue Severity */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          Overdue severity
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                          {selectedInvoice.factors?.overdueScore ?? 0} / 50
                        </span>
                      </div>
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--surface-elevated)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${((selectedInvoice.factors?.overdueScore ?? 0) / 50) * 100}%`,
                            height: '100%',
                            background: '#F47786',
                            borderRadius: '999px',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {selectedInvoice.overdueDays > 0
                          ? `${selectedInvoice.overdueDays} days past due`
                          : 'Not yet past due date'}
                      </div>
                    </div>

                    {/* Factor 2: Relative Value */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          Relative value
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                          {selectedInvoice.factors?.valueScore ?? 0} / 30
                        </span>
                      </div>
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--surface-elevated)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${((selectedInvoice.factors?.valueScore ?? 0) / 30) * 100}%`,
                            height: '100%',
                            background: '#61B9E8',
                            borderRadius: '999px',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {selectedInvoice.valueRatioPercent ?? 0}% of largest open{' '}
                        {selectedInvoice.currency} invoice
                      </div>
                    </div>

                    {/* Factor 3: Escalation Signal */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          Escalation signal
                        </span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                          {selectedInvoice.factors?.escalationScore ?? 0} / 20
                        </span>
                      </div>
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--surface-elevated)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${((selectedInvoice.factors?.escalationScore ?? 0) / 20) * 100}%`,
                            height: '100%',
                            background: '#8B7CFF',
                            borderRadius: '999px',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {selectedInvoice.priorRemindersCount > 0
                          ? `${selectedInvoice.priorRemindersCount} reminder(s) sent, still unpaid`
                          : 'No prior reminders sent yet'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Can we act now? — separate from urgency */}
              <div
                style={{
                  background: '#131D31',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Can we act now?
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    — separate from urgency
                  </span>
                </div>

                {isPaidStatus(selectedInvoice.status) ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#35C997',
                        background: 'rgba(53, 201, 151, 0.12)',
                        border: '1px solid rgba(53, 201, 151, 0.35)',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Invoice Settled
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      No follow-up required
                    </span>
                  </div>
                ) : selectedInvoice.eligibleForReminder ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: '#35C997',
                          background: 'rgba(53, 201, 151, 0.12)',
                          border: '1px solid rgba(53, 201, 151, 0.35)',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Eligible now
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Ready for AI follow-up
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {selectedInvoice.policyReason}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: '#F4B860',
                          background: 'rgba(244, 184, 96, 0.12)',
                          border: '1px solid rgba(244, 184, 96, 0.35)',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontWeight: 600,
                        }}
                      >
                        ● Cooldown · {selectedInvoice.cooldownDaysLeft} day(s) left
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Eligible again {formatShortDate(selectedInvoice.cooldownEndsAt)}
                      </span>
                    </div>

                    <div
                      style={{
                        height: '8px',
                        background: 'var(--surface-elevated)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(20, ((3 - (selectedInvoice.cooldownDaysLeft || 1)) / 3) * 100)
                          )}%`,
                          height: '100%',
                          background: '#F4B860',
                          borderRadius: '999px',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>Reminded · {formatShortDate(selectedInvoice.lastRemindedAt)}</span>
                      <span>Cooldown ends · {formatShortDate(selectedInvoice.cooldownEndsAt)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Section 3: Activity Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Activity
                </div>

                {!invoiceHistory ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    Loading activity...
                  </div>
                ) : invoiceHistory.activityLogs?.length === 0 ? (
                  <div
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.84rem',
                      padding: '16px',
                      background: '#131D31',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    No activity recorded for this invoice yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingLeft: '4px' }}>
                    {invoiceHistory.activityLogs.map((log: any) => {
                      const isSent = log.eventType.includes('REMINDER') || log.eventType.includes('WEBHOOK');
                      const isEdited = log.eventType.includes('EDITED');
                      const ringColor = isSent ? '#35C997' : isEdited ? '#61B9E8' : '#8B7CFF';
                      const title = log.eventType.includes('REMINDER')
                        ? 'Reminder sent'
                        : log.eventType.includes('EDITED')
                        ? 'Draft edited'
                        : log.eventType.includes('PROPOSAL')
                        ? 'Proposal created by Gemini'
                        : log.eventType.replace(/_/g, ' ');

                      return (
                        <div
                          key={log.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span
                              style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                border: `2px solid ${ringColor}`,
                                marginTop: '3px',
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {title}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {log.description}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                            {formatRelativeTime(log.createdAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Footer Controls */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border-subtle)',
                background: '#0B1020',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {selectedInvoice.eligibleForReminder ? (
                <Link
                  href="/assistant"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'var(--accent-ai)',
                    color: '#fff',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Send size={14} />
                  <span>Draft follow-up</span>
                </Link>
              ) : (
                <div
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                  }}
                >
                  {isPaidStatus(selectedInvoice.status)
                    ? 'Invoice settled'
                    : 'Draft follow-up · cooldown'}
                </div>
              )}

              <button
                onClick={handleSync}
                disabled={isSyncing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              {!isPaidStatus(selectedInvoice.status) && (
                <button
                  onClick={handleSimulatePayment}
                  disabled={isSimulatingPay}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={13} color="#35C997" />
                  <span>{isSimulatingPay ? 'Updating...' : 'Simulate payment'}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}