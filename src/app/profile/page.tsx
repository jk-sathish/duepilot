"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserCheck,
  KeyRound,
  ShieldCheck,
  LogOut,
  Save,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
  LogIn,
} from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Editable Profile State
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [paypalEnv, setPaypalEnv] = useState('SANDBOX');
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalClientSecret, setPaypalClientSecret] = useState('');

  const [banner, setBanner] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(
    null
  );

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setLogs(data.recentAccountLogs || []);
        if (data.user) {
          setName(data.user.name || '');
          setCompanyName(data.user.companyName || '');
          setPaypalEmail(data.user.paypalEmail || data.user.email || '');
          setDefaultCurrency(data.user.defaultCurrency || 'USD');
          setPaypalEnv(data.user.paypalEnv || 'SANDBOX');
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyName,
          paypalEmail,
          defaultCurrency,
          paypalEnv,
          paypalClientId: paypalClientId.trim() || undefined,
          paypalClientSecret: paypalClientSecret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile.');
      setUser(data.user);
      setPaypalClientId('');
      setPaypalClientSecret('');
      setBanner({ type: 'SUCCESS', text: data.message });
      await fetchProfile();
    } catch (err: any) {
      setBanner({ type: 'ERROR', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnectCustomKeys = async () => {
    setIsSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DISCONNECT_CUSTOM_PAYPAL' }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setBanner({ type: 'SUCCESS', text: data.message });
        await fetchProfile();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'LOGOUT' }),
    });
    router.push('/login');
  };

  const inputStyle = {
    width: '100%',
    background: '#061021',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
  };

  if (!isLoading && !user) {
    return (
      <div className="page-container">
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <UserCheck size={32} color="#009CDE" />
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Sign in to manage your Merchant Profile</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '460px' }}>
            You are currently browsing in shared Sandbox mode. Sign in with your PayPal email or create a merchant account to attach your own PayPal REST API keys.
          </p>
          <Link href="/login" className="btn-primary" style={{ marginTop: '6px' }}>
            <LogIn size={15} />
            <span>Go to PayPal / Merchant Login</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ paddingBottom: '48px' }}>
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            Account Management &amp; PayPal API Vault
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Manage your merchant identity, default currency (USD, EUR, INR), and per-user PayPal REST API credentials.
          </p>
        </div>

        <button
          onClick={handleLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#EF4444',
            padding: '9px 16px',
            borderRadius: '8px',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <LogOut size={15} />
          <span>Sign Out of Account</span>
        </button>
      </div>

      {banner && (
        <div
          style={{
            background:
              banner.type === 'SUCCESS'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${
              banner.type === 'SUCCESS'
                ? 'rgba(16, 185, 129, 0.4)'
                : 'rgba(239, 68, 68, 0.4)'
            }`,
            color: banner.type === 'SUCCESS' ? '#10B981' : '#EF4444',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.86rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {banner.type === 'SUCCESS' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{banner.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '20px' }}>
          {/* Card 1: Merchant Identity & Currency */}
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
              <UserCheck size={18} color="#009CDE" />
              <span>Merchant Profile &amp; Regional Currency</span>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Account Email (Primary Login)
              </label>
              <input type="text" value={user?.email || ''} disabled style={{ ...inputStyle, opacity: 0.65 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Operator Name
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Company / Workspace
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Linked PayPal Email
                </label>
                <input
                  type="email"
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Default Ledger Currency
                </label>
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  style={inputStyle}
                >
                  <option value="USD">USD ($) — US Dollar</option>
                  <option value="EUR">EUR (€) — Euro</option>
                  <option value="INR">INR (₹) — Indian Rupee</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Per-User PayPal Client ID & Secret Integration */}
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
                <KeyRound size={18} color="#009CDE" />
                <span>PayPal REST API Credentials</span>
              </div>

              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: user?.hasCustomPayPal
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(0, 156, 222, 0.14)',
                  color: user?.hasCustomPayPal ? '#10B981' : '#38BDF8',
                }}
              >
                {user?.hasCustomPayPal
                  ? `CONNECTED (${user.maskedClientId})`
                  : 'USING SHARED SANDBOX'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Attach your own PayPal Developer <code>Client ID</code> and <code>Secret</code> to sync and remind invoices from your own PayPal account. When verified, DuePilot automatically switches all PayPal API calls for your session to your keys.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Environment
                </label>
                <select
                  value={paypalEnv}
                  onChange={(e) => setPaypalEnv(e.target.value)}
                  style={inputStyle}
                >
                  <option value="SANDBOX">SANDBOX</option>
                  <option value="LIVE">LIVE</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  PayPal REST Client ID
                </label>
                <input
                  type="text"
                  value={paypalClientId}
                  onChange={(e) => setPaypalClientId(e.target.value)}
                  placeholder={
                    user?.maskedClientId
                      ? `Stored: ${user.maskedClientId} (enter new to replace)`
                      : 'Paste your PayPal Client ID'
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                PayPal REST Client Secret (Verified via OAuth 2.0 before saving; never sent back to browser)
              </label>
              <input
                type="password"
                value={paypalClientSecret}
                onChange={(e) => setPaypalClientSecret(e.target.value)}
                placeholder="Paste your PayPal Secret Key"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              {user?.hasCustomPayPal ? (
                <button
                  type="button"
                  onClick={handleDisconnectCustomKeys}
                  disabled={isSaving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#EF4444',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                  <span>Disconnect Custom Keys</span>
                </button>
              ) : (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Leave blank to keep using the pre-configured Sandbox environment.
                </span>
              )}

              <button type="submit" disabled={isSaving} className="btn-primary">
                <Save size={15} />
                <span>{isSaving ? 'Verifying & Saving...' : 'Save Account & Keys'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Account Activity & Security History */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginTop: '20px',
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '14px' }}>
          Account Authentication &amp; Credential Activity
        </div>

        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            No recent account activity events recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {logs.map((log: any) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#061021',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={14} color="#009CDE" />
                  <div>
                    <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                      {log.eventType.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      {log.description}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}