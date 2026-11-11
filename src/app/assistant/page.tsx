"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Sparkles,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Edit2,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Check,
  Send,
} from 'lucide-react';
import Link from 'next/link';

type ToneKey = 'AUTO' | 'FRIENDLY' | 'PROFESSIONAL' | 'DIRECT' | 'FIRM';
type FilterTab = 'ALL' | 'PENDING' | 'EXECUTED' | 'REJECTED' | 'FAILED';
type MessageTab = 'MESSAGE' | 'DIFF' | 'PREVIEW';

const TONES: Array<{ id: ToneKey; label: string }> = [
  { id: 'AUTO', label: 'Auto (smart)' },
  { id: 'FRIENDLY', label: 'Friendly' },
  { id: 'PROFESSIONAL', label: 'Professional' },
  { id: 'DIRECT', label: 'Direct' },
  { id: 'FIRM', label: 'Firm' },
];

export default function AssistantPage() {
  const [selectedTone, setSelectedTone] = useState<ToneKey>('PROFESSIONAL');
  const [scope, setScope] = useState<'ALL_ELIGIBLE' | 'SELECTED'>('ALL_ELIGIBLE');
  const [customInstruction, setCustomInstruction] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Data State
  const [proposals, setProposals] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [messageTab, setMessageTab] = useState<MessageTab>('MESSAGE');

  // Provenance Banner State
  const [lastRunMeta, setLastRunMeta] = useState<{
    source: 'GEMINI' | 'FALLBACK';
    elapsedMs: number;
    skipped: Array<{ invoiceNumber: string; customerName: string; reason: string }>;
    reply: string | null;
  }>({
    source: 'GEMINI',
    elapsedMs: 612,
    skipped: [],
    reply: null,
  });
  const [showSkippedReason, setShowSkippedReason] = useState(false);

  // Editor & Confirmation State
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const [propRes, invRes] = await Promise.all([
        fetch('/api/proposals'),
        fetch('/api/invoices'),
      ]);
      if (propRes.ok) {
        const propData = await propRes.json();
        setProposals(propData);
        setSelectedProposalId((prev) => {
          if (prev && propData.some((p: any) => p.id === prev)) return prev;
          return propData[0]?.id || null;
        });
      }
      if (invRes.ok) {
        const invData = await invRes.json();
        setInvoices(invData);
        const skipped = invData
          .filter((i: any) => !i.status.toUpperCase().includes('PAID') && !i.eligibleForReminder)
          .map((i: any) => ({
            invoiceNumber: i.invoiceNumber,
            customerName: i.customerName,
            reason: i.policyReason,
          }));
        setLastRunMeta((prev) => ({ ...prev, skipped }));
      }
    } catch (err) {
      console.error('Failed to load Review Desk data:', err);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  const selectedProposal = useMemo(
    () => proposals.find((p) => p.id === selectedProposalId) || proposals[0] || null,
    [proposals, selectedProposalId]
  );

  // Sync editor state when selected proposal changes
  useEffect(() => {
    if (selectedProposal) {
      setEditSubject(
        selectedProposal.subject ||
          `Payment reminder — Invoice #${selectedProposal.invoice?.invoiceNumber || ''}`
      );
      setEditBody(selectedProposal.proposedMessage || '');
      setIsEditing(false);
      setConfirmApproveOpen(false);
    }
  }, [selectedProposal?.id, selectedProposal?.proposedMessage, selectedProposal?.subject]);

  const eligibleInvoicesCount = useMemo(
    () =>
      invoices.filter(
        (i) => !String(i.status || '').toUpperCase().includes('PAID') && i.eligibleForReminder
      ).length,
    [invoices]
  );

  const filterCounts = useMemo(() => {
    return {
      ALL: proposals.length,
      PENDING: proposals.filter((p) => p.state === 'PENDING').length,
      EXECUTED: proposals.filter((p) => p.state === 'EXECUTED').length,
      REJECTED: proposals.filter((p) => p.state === 'REJECTED').length,
      FAILED: proposals.filter((p) => p.state === 'FAILED').length,
    };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    if (activeFilter === 'ALL') return proposals;
    return proposals.filter((p) => p.state === activeFilter);
  }, [proposals, activeFilter]);

  const handleRunAgent = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const toneDirective =
        selectedTone === 'FRIENDLY'
          ? 'Use a warm, friendly, polite tone.'
          : selectedTone === 'DIRECT'
          ? 'Use a concise, direct executive tone.'
          : selectedTone === 'FIRM'
          ? 'Use a firm, urgent overdue notice tone.'
          : selectedTone === 'AUTO'
          ? 'Adapt tone automatically based on overdue severity.'
          : 'Use a standard professional tone.';

      const scopeDirective =
        scope === 'SELECTED' && selectedProposal?.invoice?.invoiceNumber
          ? `Focus specifically on Invoice #${selectedProposal.invoice.invoiceNumber}.`
          : 'Analyse all eligible unpaid and overdue invoices.';

      const fullPrompt = `${scopeDirective} Prioritise by urgency score. Respect the 3-day cooldown policy. ${toneDirective} ${
        customInstruction.trim() ? `Additional operator instruction: ${customInstruction.trim()}` : ''
      }`;

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to run Gemini analysis');
      }

      setProposals(data.proposals || []);
      if (data.proposals?.length > 0 && !selectedProposalId) {
        setSelectedProposalId(data.proposals[0].id);
      }
      setLastRunMeta({
        source: data.source || 'GEMINI',
        elapsedMs: data.elapsedMs || 840,
        skipped: data.skippedCooldownInvoices || [],
        reply: data.reply || null,
      });
    } catch (err: any) {
      setError(err.message || 'Unexpected error communicating with AI.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedProposal) return;
    setProcessingId(selectedProposal.id);
    try {
      const res = await fetch(`/api/proposals/${selectedProposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editSubject,
          proposedMessage: editBody,
        }),
      });
      if (!res.ok) throw new Error('Failed to save edited draft.');
      setIsEditing(false);
      await fetchWorkspaceData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRegenerateDraft = async () => {
    if (!selectedProposal) return;
    setProcessingId(selectedProposal.id);
    try {
      const res = await fetch(`/api/proposals/${selectedProposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGENERATE',
          tone: selectedTone === 'AUTO' ? 'PROFESSIONAL' : selectedTone,
        }),
      });
      if (!res.ok) throw new Error('Failed to regenerate draft.');
      await fetchWorkspaceData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResetToOriginal = async () => {
    if (!selectedProposal) return;
    const orig = selectedProposal.originalMessage || selectedProposal.proposedMessage;
    setEditBody(orig);
    setProcessingId(selectedProposal.id);
    try {
      await fetch(`/api/proposals/${selectedProposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editSubject,
          proposedMessage: orig,
        }),
      });
      await fetchWorkspaceData();
    } finally {
      setProcessingId(null);
    }
  };

  const handleExecuteAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    setError(null);
    try {
      // If operator has unsaved edits in the box during approval, persist them first
      if (action === 'approve' && isEditing && editBody.trim()) {
        await fetch(`/api/proposals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: editSubject, proposedMessage: editBody }),
        });
      }

      const res = await fetch(`/api/proposals/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} proposal`);
      setConfirmApproveOpen(false);
      setIsEditing(false);
      await fetchWorkspaceData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const formatMoney = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);

  const getBandColor = (band: string) =>
    band === 'CRITICAL'
      ? '#F47786'
      : band === 'HIGH'
      ? '#F4B860'
      : band === 'MEDIUM'
      ? '#8B7CFF'
      : '#61B9E8';

  const maskCustomerFirstName = (fullName: string) => {
    const first = (fullName || 'Customer').split(' ')[0];
    return `${first} (first name only)`;
  };

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      {/* Header Row */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            AI Assistant — Review Desk
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Gemini drafts. You decide. Nothing is sent without your approval.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(53, 201, 151, 0.12)',
            border: '1px solid rgba(53, 201, 151, 0.35)',
            color: '#35C997',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#35C997',
            }}
          />
          <span>
            {lastRunMeta.source === 'GEMINI' ? 'Gemini ready' : 'Fallback active'} ·{' '}
            {lastRunMeta.elapsedMs} ms
          </span>
        </div>
      </div>

      {/* Top Control & Provenance Stepper Card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Tone Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Tone
            </span>
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
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTone(t.id)}
                  style={{
                    background:
                      selectedTone === t.id ? 'rgba(139, 124, 255, 0.22)' : 'transparent',
                    color: selectedTone === t.id ? '#F2F5FC' : 'var(--text-secondary)',
                    border:
                      selectedTone === t.id
                        ? '1px solid rgba(139, 124, 255, 0.45)'
                        : '1px solid transparent',
                    borderRadius: '6px',
                    padding: '5px 11px',
                    fontSize: '0.78rem',
                    fontWeight: selectedTone === t.id ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Scope
            </span>
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
              <button
                onClick={() => setScope('ALL_ELIGIBLE')}
                style={{
                  background:
                    scope === 'ALL_ELIGIBLE' ? 'var(--surface-elevated)' : 'transparent',
                  color: scope === 'ALL_ELIGIBLE' ? '#F2F5FC' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 11px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All eligible ({eligibleInvoicesCount})
              </button>
              <button
                onClick={() => setScope('SELECTED')}
                style={{
                  background: scope === 'SELECTED' ? 'var(--surface-elevated)' : 'transparent',
                  color: scope === 'SELECTED' ? '#F2F5FC' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 11px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Selected invoice
              </button>
            </div>
          </div>

          {/* Optional Instruction Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 220px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Optional instruction
            </span>
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="e.g. offer to resend the invoice link"
              style={{
                background: '#0B1020',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '7px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Run Button */}
          <button
            onClick={handleRunAgent}
            disabled={isAnalyzing}
            className="btn-primary"
            style={{
              background: 'var(--accent-ai)',
              color: '#fff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.84rem',
            }}
          >
            <Sparkles size={14} />
            <span>{isAnalyzing ? 'Analysing portfolio...' : '+ Analyse & prepare drafts'}</span>
          </button>
        </div>

        {/* 5-Step Provenance Pipeline Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            fontSize: '0.72rem',
          }}
        >
          {[
            '✓ Load portfolio',
            '✓ Score & policy check',
            lastRunMeta.source === 'GEMINI' ? '✓ Gemini draft' : '✓ Deterministic draft',
            '✓ Validate drafts',
            '✓ Save proposals',
          ].map((step, i, arr) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: 'rgba(53, 201, 151, 0.12)',
                  color: '#35C997',
                  border: '1px solid rgba(53, 201, 151, 0.3)',
                  padding: '2px 9px',
                  borderRadius: '999px',
                  fontWeight: 600,
                }}
              >
                {step}
              </span>
              {i < arr.length - 1 && <span style={{ color: 'var(--text-secondary)' }}>→</span>}
            </div>
          ))}
          <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
            {(lastRunMeta.elapsedMs / 1000).toFixed(1)} s
          </span>
        </div>
      </div>

      {/* Provenance & Cooldown Skipped Banner */}
      <div
        style={{
          background: 'rgba(139, 124, 255, 0.09)',
          border: '1px solid rgba(139, 124, 255, 0.32)',
          borderRadius: '10px',
          padding: '11px 16px',
          marginBottom: '14px',
          fontSize: '0.82rem',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-ai)', fontWeight: 700 }}>✦</span>
          <span>
            <strong>{filterCounts.PENDING} drafts pending</strong> ·{' '}
            <strong>{lastRunMeta.skipped.length} skipped</strong>. Source:
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              background: 'rgba(139, 124, 255, 0.18)',
              border: '1px solid rgba(139, 124, 255, 0.4)',
              color: '#C4B5FD',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 600,
            }}
          >
            {lastRunMeta.source === 'GEMINI'
              ? '✦ Gemini · gemini-3.8-flash'
              : '⚡ Deterministic fallback'}
          </span>
          {lastRunMeta.skipped.length > 0 && (
            <span style={{ color: 'var(--text-secondary)' }}>
              · Invoice #{lastRunMeta.skipped[0].invoiceNumber} skipped —{' '}
              {lastRunMeta.skipped[0].reason}{' '}
              <button
                onClick={() => setShowSkippedReason(!showSkippedReason)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-ai)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: 0,
                }}
              >
                Why were these skipped?
              </button>
            </span>
          )}
        </div>

        {showSkippedReason && lastRunMeta.skipped.length > 0 && (
          <div
            style={{
              background: '#0B1020',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
            }}
          >
            {lastRunMeta.skipped.map((s, idx) => (
              <div key={idx}>
                • <strong>Invoice #{s.invoiceNumber}</strong> ({s.customerName}): {s.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(244, 119, 134, 0.12)',
            border: '1px solid rgba(244, 119, 134, 0.4)',
            color: '#F47786',
            padding: '12px 16px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.86rem',
            marginBottom: '14px',
          }}
        >
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar & Select Proposals Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(
            [
              { key: 'ALL', label: `All ${filterCounts.ALL}` },
              { key: 'PENDING', label: `Pending ${filterCounts.PENDING}` },
              { key: 'EXECUTED', label: `Executed ${filterCounts.EXECUTED}` },
              { key: 'REJECTED', label: `Rejected ${filterCounts.REJECTED}` },
              { key: 'FAILED', label: `Failed ${filterCounts.FAILED}` },
            ] as Array<{ key: FilterTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              style={{
                background:
                  activeFilter === tab.key
                    ? 'rgba(139, 124, 255, 0.18)'
                    : 'var(--surface)',
                color: activeFilter === tab.key ? '#F2F5FC' : 'var(--text-secondary)',
                border: `1px solid ${
                  activeFilter === tab.key
                    ? 'rgba(139, 124, 255, 0.45)'
                    : 'var(--border-subtle)'
                }`,
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '0.76rem',
                fontWeight: activeFilter === tab.key ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setSelectionMode(!selectionMode);
            setCheckedIds([]);
          }}
          style={{
            background: selectionMode ? 'rgba(139, 124, 255, 0.16)' : 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '0.78rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {selectionMode ? `Cancel selection (${checkedIds.length})` : '☑ Select proposals'}
        </button>
      </div>

      {/* Master-Detail Split Workspace */}
      {filteredProposals.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          No proposals in this filter state. Click <strong>+ Analyse & prepare drafts</strong> above
          to generate grounded reminder proposals.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: '18px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Proposal Queue Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredProposals.map((prop) => {
              const isSelected = selectedProposal?.id === prop.id;
              const bandColor = getBandColor(prop.priorityBand);

              return (
                <div
                  key={prop.id}
                  onClick={() => setSelectedProposalId(prop.id)}
                  style={{
                    background: isSelected ? '#152036' : 'var(--surface)',
                    border: `1px solid ${
                      isSelected ? 'rgba(139, 124, 255, 0.55)' : 'var(--border-subtle)'
                    }`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectionMode && (
                        <input
                          type="checkbox"
                          checked={checkedIds.includes(prop.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setCheckedIds((prev) =>
                              prev.includes(prop.id)
                                ? prev.filter((i) => i !== prop.id)
                                : [...prev, prop.id]
                            );
                          }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                          #{prop.invoice?.invoiceNumber}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                          {prop.invoice?.customerName}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {formatMoney(prop.invoice?.amount, prop.invoice?.currency)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'var(--surface-elevated)',
                        color: bandColor,
                        border: `1px solid ${bandColor}44`,
                      }}
                    >
                      {prop.priorityBand}
                    </span>

                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'rgba(139, 124, 255, 0.14)',
                        color: '#C4B5FD',
                      }}
                    >
                      {prop.source === 'FALLBACK' ? 'Fallback' : '✦ Gemini'}
                    </span>

                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background:
                          prop.state === 'EXECUTED'
                            ? 'rgba(53, 201, 151, 0.16)'
                            : prop.state === 'PENDING'
                            ? 'rgba(244, 184, 96, 0.16)'
                            : 'rgba(244, 119, 134, 0.16)',
                        color:
                          prop.state === 'EXECUTED'
                            ? '#35C997'
                            : prop.state === 'PENDING'
                            ? '#F4B860'
                            : '#F47786',
                      }}
                    >
                      {prop.state}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Selected Proposal Review Desk */}
          {selectedProposal && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Top Invoice Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Invoice #{selectedProposal.invoice?.invoiceNumber} ·{' '}
                    {selectedProposal.invoice?.customerName} ·{' '}
                    {selectedProposal.invoice?.currency}{' '}
                    {Number(selectedProposal.invoice?.amount || 0).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        background: 'rgba(244, 119, 134, 0.14)',
                        color: getBandColor(selectedProposal.priorityBand),
                        border: `1px solid ${getBandColor(selectedProposal.priorityBand)}55`,
                      }}
                    >
                      {selectedProposal.priorityBand} {Math.round(selectedProposal.priority)}
                    </span>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        background: 'rgba(244, 184, 96, 0.14)',
                        color: '#F4B860',
                        border: '1px solid rgba(244, 184, 96, 0.35)',
                      }}
                    >
                      {selectedProposal.overdueDays > 0
                        ? `${selectedProposal.overdueDays} days overdue`
                        : 'Approaching due date'}
                    </span>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: '999px',
                        background: 'rgba(139, 124, 255, 0.14)',
                        color: '#C4B5FD',
                      }}
                    >
                      {selectedProposal.state === 'PENDING'
                        ? 'Pending review'
                        : selectedProposal.state}
                    </span>
                  </div>
                </div>

                <Link
                  href="/invoices"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  <span>Open intelligence</span>
                  <ExternalLink size={13} />
                </Link>
              </div>

              {/* Two-Column Explainability Grid: Why this invoice vs Facts Gemini used */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px',
                  paddingBottom: '18px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {/* Left: Why this invoice */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Why this invoice
                  </div>

                  {/* Segmented 3-part bar */}
                  <div
                    style={{
                      height: '8px',
                      background: 'var(--surface-elevated)',
                      borderRadius: '999px',
                      overflow: 'hidden',
                      display: 'flex',
                    }}
                  >
                    <div
                      style={{
                        width: `${selectedProposal.factors?.overdueScore ?? 0}%`,
                        height: '100%',
                        background: '#F47786',
                      }}
                    />
                    <div
                      style={{
                        width: `${selectedProposal.factors?.valueScore ?? 0}%`,
                        height: '100%',
                        background: '#61B9E8',
                      }}
                    />
                    <div
                      style={{
                        width: `${selectedProposal.factors?.escalationScore ?? 0}%`,
                        height: '100%',
                        background: '#8B7CFF',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#F47786' }}>●</span> Overdue severity
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.factors?.overdueScore ?? 0} / 50
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#61B9E8' }}>●</span> Relative value
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.factors?.valueScore ?? 0} / 30
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#8B7CFF' }}>●</span> Escalation signal
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.factors?.escalationScore ?? 0} / 20
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: selectedProposal.eligibleForReminder
                          ? 'rgba(53, 201, 151, 0.14)'
                          : 'rgba(244, 184, 96, 0.14)',
                        color: selectedProposal.eligibleForReminder ? '#35C997' : '#F4B860',
                        border: `1px solid ${
                          selectedProposal.eligibleForReminder
                            ? 'rgba(53, 201, 151, 0.35)'
                            : 'rgba(244, 184, 96, 0.35)'
                        }`,
                      }}
                    >
                      {selectedProposal.eligibleForReminder ? '♡ Eligible' : '● Cooldown'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {selectedProposal.eligibleForReminder
                        ? 'No reminder in last 3 days'
                        : selectedProposal.policyReason}
                    </span>
                  </div>
                </div>

                {/* Right: Facts Gemini used */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Facts Gemini used
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Invoice</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        #{selectedProposal.invoice?.invoiceNumber}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Amount</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.invoice?.currency}{' '}
                        {Number(selectedProposal.invoice?.amount || 0).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Due date</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.invoice?.dueDate
                          ? new Date(selectedProposal.invoice.dueDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'N/A'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Days overdue</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.overdueDays}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Prior reminders</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedProposal.priorRemindersCount}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Customer</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {maskCustomerFirstName(selectedProposal.invoice?.customerName || '')}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Gemini never sees emails, payment links or other customers.
                  </div>
                </div>
              </div>

              {/* Draft Message Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Draft message
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: 'rgba(139, 124, 255, 0.16)',
                        color: '#C4B5FD',
                        border: '1px solid rgba(139, 124, 255, 0.35)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontWeight: 600,
                      }}
                    >
                      {selectedProposal.source === 'FALLBACK'
                        ? '⚡ Deterministic fallback'
                        : '✦ Gemini · gemini-3.8-flash'}
                    </span>
                    {selectedProposal.editedByOperator && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          background: 'rgba(97, 185, 232, 0.16)',
                          color: '#61B9E8',
                          border: '1px solid rgba(97, 185, 232, 0.35)',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 600,
                        }}
                      >
                        ✎ Edited by you
                      </span>
                    )}
                  </div>

                  {/* Message / Diff / Preview as customer switcher */}
                  <div
                    style={{
                      display: 'flex',
                      background: '#0B1020',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '2px',
                    }}
                  >
                    {(
                      [
                        { id: 'MESSAGE', label: 'Message' },
                        { id: 'DIFF', label: 'Diff' },
                        { id: 'PREVIEW', label: 'Preview as customer' },
                      ] as Array<{ id: MessageTab; label: string }>
                    ).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setMessageTab(t.id)}
                        style={{
                          background:
                            messageTab === t.id ? 'var(--surface-elevated)' : 'transparent',
                          color: messageTab === t.id ? '#F2F5FC' : 'var(--text-secondary)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject Field */}
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Subject
                  </div>
                  <input
                    type="text"
                    value={editSubject}
                    disabled={!isEditing}
                    onChange={(e) => setEditSubject(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0B1020',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Body Content based on Message / Diff / Preview */}
                {messageTab === 'MESSAGE' && (
                  <>
                    {isEditing ? (
                      <textarea
                        rows={7}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0B1020',
                          border: '1px solid rgba(139, 124, 255, 0.5)',
                          borderRadius: '10px',
                          padding: '14px',
                          color: 'var(--text-primary)',
                          fontSize: '0.86rem',
                          lineHeight: 1.6,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          background: '#0B1020',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '10px',
                          padding: '16px',
                          color: 'var(--text-primary)',
                          fontSize: '0.86rem',
                          lineHeight: 1.65,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {editBody}
                      </div>
                    )}
                  </>
                )}

                {messageTab === 'DIFF' && (
                  <div
                    style={{
                      background: '#0B1020',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      fontSize: '0.83rem',
                    }}
                  >
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      Original AI Draft vs Current Reviewed Message:
                    </div>
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        background: 'rgba(244, 119, 134, 0.08)',
                        borderLeft: '3px solid #F47786',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {selectedProposal.originalMessage}
                    </div>
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        background: 'rgba(53, 201, 151, 0.08)',
                        borderLeft: '3px solid #35C997',
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {editBody}
                    </div>
                  </div>
                )}

                {messageTab === 'PREVIEW' && (
                  <div
                    style={{
                      background: '#131D31',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-subtle)',
                        paddingBottom: '8px',
                      }}
                    >
                      <strong>To:</strong> {selectedProposal.invoice?.customerName} &lt;
                      {selectedProposal.invoice?.customerEmail}&gt; · <strong>Via:</strong> PayPal
                      Invoicing Sandbox
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                      {editSubject}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {editBody}
                    </div>
                  </div>
                )}

                {/* Draft Controls Bar */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          disabled={processingId === selectedProposal.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--accent-ai)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Check size={13} />
                          <span>Save changes</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditBody(selectedProposal.proposedMessage);
                          }}
                          style={{
                            background: 'var(--surface-elevated)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setMessageTab('MESSAGE');
                          setIsEditing(true);
                        }}
                        disabled={selectedProposal.state !== 'PENDING'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--surface-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 500,
                          cursor: selectedProposal.state === 'PENDING' ? 'pointer' : 'not-allowed',
                          opacity: selectedProposal.state === 'PENDING' ? 1 : 0.5,
                        }}
                      >
                        <Edit2 size={12} />
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      onClick={handleRegenerateDraft}
                      disabled={
                        selectedProposal.state !== 'PENDING' ||
                        processingId === selectedProposal.id
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--surface-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        cursor: selectedProposal.state === 'PENDING' ? 'pointer' : 'not-allowed',
                        opacity: selectedProposal.state === 'PENDING' ? 1 : 0.5,
                      }}
                    >
                      <RefreshCw size={12} />
                      <span>Regenerate</span>
                    </button>

                    <button
                      onClick={handleResetToOriginal}
                      disabled={
                        selectedProposal.state !== 'PENDING' ||
                        processingId === selectedProposal.id
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--surface-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        cursor: selectedProposal.state === 'PENDING' ? 'pointer' : 'not-allowed',
                        opacity: selectedProposal.state === 'PENDING' ? 1 : 0.5,
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>Reset to AI draft</span>
                    </button>
                  </div>

                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {editBody.length} / 1200
                  </span>
                </div>
              </div>

              {/* What happens when you approve + Action Buttons */}
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  What happens when you approve
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                    fontSize: '0.7rem',
                  }}
                >
                  {[
                    '① You approve',
                    '② Live PayPal re-check',
                    '③ PayPal emails customer',
                    '④ 3-day cooldown starts',
                    '⑤ Audit logged',
                  ].map((s, idx, arr) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                          padding: '3px 9px',
                          borderRadius: '999px',
                        }}
                      >
                        {s}
                      </span>
                      {idx < arr.length - 1 && (
                        <span style={{ color: 'var(--text-secondary)' }}>→</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline Confirmation Banner when operator clicks Approve */}
                {confirmApproveOpen && selectedProposal.state === 'PENDING' && (
                  <div
                    style={{
                      background: 'rgba(53, 201, 151, 0.1)',
                      border: '1px solid rgba(53, 201, 151, 0.4)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                      <strong>Confirm PayPal Sandbox Reminder:</strong> Send this exact reviewed
                      message for <strong>Invoice #{selectedProposal.invoice?.invoiceNumber}</strong>{' '}
                      ({formatMoney(selectedProposal.invoice?.amount, selectedProposal.invoice?.currency)})?
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setConfirmApproveOpen(false)}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleExecuteAction(selectedProposal.id, 'approve')}
                        disabled={processingId === selectedProposal.id}
                        style={{
                          background: '#35C997',
                          border: 'none',
                          color: '#08121E',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {processingId === selectedProposal.id
                          ? 'Sending via PayPal...'
                          : 'Confirm & Send Now'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedProposal.state === 'PENDING' && !confirmApproveOpen && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => handleExecuteAction(selectedProposal.id, 'reject')}
                      disabled={processingId === selectedProposal.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(244, 119, 134, 0.12)',
                        color: '#F47786',
                        border: '1px solid rgba(244, 119, 134, 0.35)',
                        padding: '9px 18px',
                        borderRadius: '8px',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <XCircle size={15} />
                      <span>Reject</span>
                    </button>

                    <button
                      onClick={() => setConfirmApproveOpen(true)}
                      disabled={processingId === selectedProposal.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#35C997',
                        color: '#06131F',
                        border: 'none',
                        padding: '9px 20px',
                        borderRadius: '8px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Send size={14} />
                      <span>▸ Approve & send via PayPal</span>
                    </button>
                  </div>
                )}

                {selectedProposal.state === 'EXECUTED' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#35C997',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle size={16} />
                    <span>
                      Executed via PayPal Sandbox{' '}
                      {selectedProposal.executedAt
                        ? `on ${new Date(selectedProposal.executedAt).toLocaleString()}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}