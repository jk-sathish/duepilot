"use client";

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { RefreshCw } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeRequests, setActiveRequests] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Synchronising financial state...');
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const isLoginPage = pathname === '/login';

  const fetchAuthSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
        if (!data.authenticated && pathname !== '/login') {
          router.replace('/login');
        }
      } else if (pathname !== '/login') {
        router.replace('/login');
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setAuthChecked(true);
    }
  }, [pathname, router]);

  useEffect(() => {
    fetchAuthSession();
  }, [pathname, fetchAuthSession]);

  // Smooth route transition indicator
  useEffect(() => {
    setRouteLoading(true);
    setLoadingLabel('Loading workspace...');
    const timer = setTimeout(() => setRouteLoading(false), 320);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Intercept window.fetch globally so EVERY API call triggers the smooth loading UI
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';

      if (urlStr.includes('/api/paypal/sync')) {
        setLoadingLabel('Syncing live PayPal invoices...');
      } else if (urlStr.includes('/api/agent')) {
        setLoadingLabel('Analysing receivables & drafting follow-ups...');
      } else if (urlStr.includes('/approve')) {
        setLoadingLabel('Executing PayPal reminder & verifying policy...');
      } else if (urlStr.includes('/api/dashboard')) {
        setLoadingLabel('Refreshing financial ledger...');
      } else if (urlStr.includes('/api/')) {
        setLoadingLabel('Communicating with DuePilot server...');
      }

      setActiveRequests((prev) => prev + 1);
      try {
        return await originalFetch(...args);
      } finally {
        setActiveRequests((prev) => Math.max(0, prev - 1));
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const isLoading = activeRequests > 0 || routeLoading || (!authChecked && !isLoginPage);

  return (
    <>
      {/* System-Wide Top Progress Bar */}
      {isLoading && (
        <div className="global-loader-track" role="progressbar" aria-busy="true">
          <div className="global-loader-bar" />
        </div>
      )}

      {/* Floating Smooth Status Pill during API Operations */}
      {isLoading && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '24px',
            zIndex: 9998,
            background: 'rgba(11, 25, 48, 0.94)',
            border: '1px solid rgba(0, 156, 222, 0.5)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            borderRadius: '999px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#F4F7FB',
            pointerEvents: 'none',
          }}
        >
          <RefreshCw size={13} color="#009CDE" className="animate-spin" />
          <span>{loadingLabel}</span>
        </div>
      )}

      {isLoginPage ? (
        <main style={{ minHeight: '100vh', width: '100%', background: 'var(--background)' }}>
          {children}
        </main>
      ) : !authChecked || !user ? (
        <main
          style={{
            minHeight: '100vh',
            width: '100%',
            background: 'var(--background)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          Verifying merchant session...
        </main>
      ) : (
        <div className="app-shell">
          <Sidebar user={user} onUserChange={fetchAuthSession} />
          <main className="app-main">{children}</main>
        </div>
      )}
    </>
  );
}