"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, ArrowRight, KeyRound, CheckCircle, AlertCircle } from 'lucide-react';

type AuthTab = 'PAYPAL' | 'LOGIN' | 'SIGNUP';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AuthTab>('PAYPAL');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalClientSecret, setPaypalClientSecret] = useState('');
  const [showKeyFields, setShowKeyFields] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayPalContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PAYPAL_AUTH',
          email,
          name,
          companyName: companyName || 'PayPal Merchant Workspace',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to authenticate with PayPal email.');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: activeTab,
          email,
          password,
          name,
          companyName,
          defaultCurrency,
          paypalClientId: paypalClientId.trim() || undefined,
          paypalClientSecret: paypalClientSecret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

 const handleInstantJudgeLogin = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PAYPAL_AUTH',
          email: 'judge.panelist@paypal-sandbox.test',
          name: 'Hackathon Judge',
          companyName: 'PayPal Evaluation Panel',
        }),
      });
      if (res.ok) {
        // Ensure the workspace has the rich multi-currency Judge Portfolio ready to explore
        const labRes = await fetch('/api/demo-lab');
        if (labRes.ok) {
          const labData = await labRes.json();
          if ((labData?.invoices?.length || 0) < 6) {
            await fetch('/api/demo-lab', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'SEED_JUDGE_PORTFOLIO' }),
            });
          }
        }
        router.push('/dashboard');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: '#061021',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '11px 14px',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    outline: 'none',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        background: 'var(--background)',
      }}
    >
      {/* Left Column: Institutional Value Proposition */}
      <div
        style={{
          background: 'linear-gradient(155deg, #040C1A 0%, #091D3E 60%, #003087 100%)',
          borderRight: '1px solid var(--border-subtle)',
          padding: '56px 64px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #0070E0 0%, #009CDE 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.95rem',
              color: '#fff',
            }}
          >
            DP
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#fff' }}>DuePilot</div>
            <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 600 }}>
              PayPal-Partnered Receivables Intelligence
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <span
            style={{
              width: 'fit-content',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(0, 156, 222, 0.18)',
              border: '1px solid rgba(0, 156, 222, 0.45)',
              color: '#38BDF8',
              textTransform: 'uppercase',
            }}
          >
            Multi-Merchant Financial Copilot
          </span>

          <h1
            style={{
              margin: 0,
              fontSize: '2.35rem',
              fontWeight: 800,
              lineHeight: 1.2,
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            Recover overdue PayPal invoices with mathematical precision.
          </h1>

          <p style={{ margin: 0, fontSize: '0.98rem', color: '#B4C6E0', lineHeight: 1.65 }}>
            Sign in with your PayPal email to explore the Sandbox Command Centre immediately, or attach your own PayPal REST API Client ID and Secret in your Account Profile to manage live receivables across USD, EUR, and INR.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            {[
              'Sign in with PayPal email first — link your Client ID & Secret anytime in Profile',
              'Multi-currency Decimal(10,2) ledger supporting USD ($), EUR (€), and INR (₹)',
              'Zero-Trust AI: Human review & live PayPal status re-check before every reminder',
            ].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.86rem', color: '#E2E8F0' }}>
                <CheckCircle size={16} color="#10B981" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '0.76rem', color: '#7D97B8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={15} color="#009CDE" />
          <span>Encrypted HTTP-Only Session • Server-Side PayPal OAuth 2.0 Vault</span>
        </div>
      </div>

      {/* Right Column: Login & Onboarding Card */}
      <div
        style={{
          padding: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '32px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Merchant Sign In
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Access your receivables workspace or create a new merchant account.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr',
              background: '#061021',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '3px',
              gap: '3px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('PAYPAL')}
              style={{
                background: activeTab === 'PAYPAL' ? '#0070E0' : 'transparent',
                color: activeTab === 'PAYPAL' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              PayPal Login
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('LOGIN')}
              style={{
                background: activeTab === 'LOGIN' ? 'var(--surface-elevated)' : 'transparent',
                color: activeTab === 'LOGIN' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Email Login
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SIGNUP')}
              style={{
                background: activeTab === 'SIGNUP' ? 'var(--surface-elevated)' : 'transparent',
                color: activeTab === 'SIGNUP' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#EF4444',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: Continue with PayPal (Email-first onboarding) */}
          {activeTab === 'PAYPAL' && (
            <form onSubmit={handlePayPalContinue} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
                  PayPal Account Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="merchant@company.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
                  Your Name or Business Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Global Exports"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  background: 'linear-gradient(180deg, #0079EA 0%, #00459E 100%)',
                  color: '#fff',
                  border: '1px solid rgba(0, 156, 222, 0.5)',
                  borderRadius: '999px',
                  padding: '12px 18px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  boxShadow: '0 4px 14px rgba(0, 112, 224, 0.35)',
                }}
              >
                <span>{isSubmitting ? 'Connecting...' : 'Continue with PayPal'}</span>
                <ArrowRight size={15} />
              </button>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
                Starts immediately with pre-configured Sandbox access. You can attach your own PayPal REST API <code>Client ID</code> &amp; <code>Secret</code> anytime in <strong>Profile &amp; Keys</strong>.
              </div>
            </form>
          )}

          {/* TAB 2 & 3: Standard Email Login / Create Account */}
          {(activeTab === 'LOGIN' || activeTab === 'SIGNUP') && (
            <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeTab === 'SIGNUP' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Arjun Mehta"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Default Currency
                    </label>
                    <select
                      value={defaultCurrency}
                      onChange={(e) => setDefaultCurrency(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@business.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={inputStyle}
                />
              </div>

              {activeTab === 'SIGNUP' && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowKeyFields(!showKeyFields)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38BDF8',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <KeyRound size={13} />
                    <span>
                      {showKeyFields
                        ? 'Hide PayPal API Credentials (configure later)'
                        : '+ Optional: Connect PayPal Client ID & Secret now'}
                    </span>
                  </button>

                  {showKeyFields && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#061021',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <input
                        type="text"
                        value={paypalClientId}
                        onChange={(e) => setPaypalClientId(e.target.value)}
                        placeholder="PayPal Sandbox Client ID"
                        style={inputStyle}
                      />
                      <input
                        type="password"
                        value={paypalClientSecret}
                        onChange={(e) => setPaypalClientSecret(e.target.value)}
                        placeholder="PayPal Sandbox Secret"
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '11px',
                  fontSize: '0.88rem',
                  marginTop: '4px',
                }}
              >
                <Lock size={14} />
                <span>
                  {isSubmitting
                    ? 'Authenticating...'
                    : activeTab === 'SIGNUP'
                    ? 'Create Merchant Account'
                    : 'Sign In to Workspace'}
                </span>
              </button>
            </form>
          )}

          {/* 1-Click Hackathon Judge / Panelist Instant Access */}
          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Evaluating for Hackathon Judging?
            </div>
            <button
              type="button"
              onClick={handleInstantJudgeLogin}
              disabled={isSubmitting}
              style={{
                width: '100%',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '9px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚡ 1-Click Judge &amp; Panelist Sandbox Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}