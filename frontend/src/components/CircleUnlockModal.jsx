import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
  zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(10px)',
};
const MODAL = {
  background: 'var(--bg2)', borderRadius: 20, padding: '36px 32px',
  border: '1px solid var(--card-border)', maxWidth: 380, width: '100%', margin: '0 16px',
};
const BTN = (primary) => ({
  width: '100%', borderRadius: 12, cursor: 'pointer',
  padding: '13px 18px', fontSize: 14, fontWeight: 600,
  background: primary ? 'rgba(201,162,39,.08)' : 'transparent',
  border: `1px solid ${primary ? 'rgba(201,162,39,.35)' : 'var(--border)'}`,
  color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

function safeParseSession() {
  try { return JSON.parse(localStorage.getItem('circle_session') || 'null'); } catch { return null; }
}

async function tryRefreshToken() {
  const session = safeParseSession();
  if (!session?.refreshToken) return null;
  try {
    const r = await fetch('/api/wallet/refresh-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.userToken) return null;
    const newSession = {
      ...session,
      userToken: d.userToken,
      encryptionKey: d.encryptionKey || session.encryptionKey,
      timestamp: Date.now(),
    };
    if (d.refreshToken) newSession.refreshToken = d.refreshToken;
    localStorage.setItem('circle_session', JSON.stringify(newSession));
    return d.userToken;
  } catch { return null; }
}

// States:
//   loading   → checking balance
//   ready     → balance OK, show "Confirm Unlock" button
//   confirming → unlock POST in progress
//   insufficient → not enough USDC
//   expired   → both userToken and refreshToken exhausted
//   success   → unlocked
//   error     → unexpected failure
export default function CircleUnlockModal({ email, signalId, appId, onSuccess, onClose, onReconnect }) {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [balance, setBalance] = useState('');
  const [walletAddr, setWalletAddr] = useState('');
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryBalance, setRetryBalance] = useState('');

  // On mount: validate session token (silently refresh if needed), then check balance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let session = safeParseSession();

        // If token looks expired, try silent refresh before making API calls
        if (!session?.userToken || Date.now() - (session.timestamp || 0) > SESSION_TTL) {
          const refreshed = await tryRefreshToken();
          if (!refreshed) { if (!cancelled) setState('expired'); return; }
          session = safeParseSession();
        }

        // Use create-payment for server-side balance check + token validation
        const userToken = session.userToken;
        const r = await fetch('/api/wallet/create-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, signal_id: signalId, userToken }),
        });
        const d = await r.json();

        if (!r.ok) {
          if (d.error?.includes('Insufficient') || d.error?.includes('indexed')) {
            if (!cancelled) { setWalletAddr(d.walletAddress || ''); setState('insufficient'); }
          } else {
            // Auth error — try one silent token refresh then retry
            const refreshed = await tryRefreshToken();
            if (!refreshed) { if (!cancelled) setState('expired'); return; }
            const session2 = safeParseSession();
            const r2 = await fetch('/api/wallet/create-payment', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, signal_id: signalId, userToken: session2.userToken }),
            });
            const d2 = await r2.json();
            if (!r2.ok) {
              if (d2.error?.includes('Insufficient') || d2.error?.includes('indexed')) {
                if (!cancelled) { setWalletAddr(d2.walletAddress || ''); setState('insufficient'); }
              } else if (!cancelled) {
                setState('expired');
              }
              return;
            }
            if (!cancelled) { setBalance(d2.balance || ''); setState('ready'); }
          }
          return;
        }

        if (!cancelled) { setBalance(d.balance || ''); setState('ready'); }
      } catch (e) {
        if (!cancelled) { setErrMsg(e.message || 'Failed to prepare unlock'); setState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [email, signalId]);

  // Confirm unlock — no PIN required, session + balance already validated above
  async function handleConfirm() {
    setState('confirming');
    try {
      const walletAddress = localStorage.getItem('ac_wallet') || '';
      const r = await fetch('/api/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_id: signalId,
          wallet_address: walletAddress,
          tx_hash: `circle_${Date.now()}`,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unlock failed');
      setState('success');
      setTimeout(() => { onSuccess?.(d.signal); onClose?.(); }, 1400);
    } catch (e) {
      setErrMsg(e.message || 'Unlock failed — please try again');
      setState('ready');
    }
  }

  // Retry balance check after user has funded wallet
  async function handleRetry() {
    setRetryLoading(true);
    setRetryBalance('');
    try {
      const r = await fetch(`/api/wallet/balance?email=${encodeURIComponent(email)}`);
      const d = await r.json();
      const bal = parseFloat(d.balance || '0');
      setRetryBalance(d.balance || '0');

      if (bal >= 0.05) {
        // Balance now sufficient — re-validate session and show confirm
        setState('loading');
        const session = safeParseSession();
        let userToken = session?.userToken;
        if (!userToken) {
          const refreshed = await tryRefreshToken();
          if (!refreshed) { setState('expired'); return; }
          userToken = safeParseSession()?.userToken;
        }
        const r2 = await fetch('/api/wallet/create-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, signal_id: signalId, userToken }),
        });
        const d2 = await r2.json();
        if (!r2.ok) {
          setRetryBalance(d2.balance || d.balance || '0');
          setState('insufficient');
          return;
        }
        setBalance(d2.balance || '');
        setState('ready');
      }
      // else: stay on insufficient, retryBalance shows the current amount
    } catch (_) {
      setRetryBalance('0');
    } finally {
      setRetryLoading(false);
    }
  }

  const blockClose = state === 'confirming';

  return (
    <div onClick={blockClose ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {/* ── LOADING ── */}
        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>⏳</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Preparing unlock…</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Checking your USDC balance…</p>
          </div>
        )}

        {/* ── READY: confirm unlock ── */}
        {state === 'ready' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🔑</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
              Unlock for <span style={{ color: 'var(--gold)' }}>$0.05 USDC</span>
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.65, marginBottom: 20 }}>
              Your balance: <strong style={{ color: 'var(--gold)' }}>{balance} USDC</strong>
            </p>
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, textAlign: 'center' }}>{errMsg}</p>}
            <button onClick={handleConfirm} style={BTN(true)}>
              <span>✓</span> Confirm Unlock →
            </button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
          </>
        )}

        {/* ── CONFIRMING ── */}
        {state === 'confirming' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Unlocking…</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Recording your unlock…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── INSUFFICIENT ── */}
        {state === 'insufficient' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>
              Insufficient USDC
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: retryBalance !== '' ? 6 : 14, lineHeight: 1.65 }}>
              You need at least $0.05 USDC on <strong style={{ color: 'var(--white)' }}>ARC testnet</strong>.
            </p>
            {retryBalance !== '' && (
              <p style={{ fontSize: 13, marginBottom: 14 }}>
                Current balance: <strong style={{ color: parseFloat(retryBalance) >= 0.05 ? '#4caf50' : '#ff6b6b' }}>{retryBalance} USDC</strong>
              </p>
            )}
            {walletAddr && (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)', wordBreak: 'break-all', background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
                {walletAddr}
              </div>
            )}
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', ...BTN(true), textDecoration: 'none', marginBottom: 10 }}
            >
              Get Free Test USDC →
            </a>
            <button
              onClick={handleRetry}
              disabled={retryLoading}
              style={{ ...BTN(false), marginBottom: 10, opacity: retryLoading ? 0.6 : 1, cursor: retryLoading ? 'not-allowed' : 'pointer' }}
            >
              {retryLoading ? 'Checking balance…' : "I've funded my wallet — Try Again"}
            </button>
            <button onClick={() => { onClose?.(); navigate('/feed'); }} style={{ ...BTN(false) }}>
              ← Back to Feed
            </button>
          </div>
        )}

        {/* ── SESSION EXPIRED (both tokens gone) ── */}
        {state === 'expired' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Please reconnect</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Your session has fully expired. Reconnect with your email to resume — you'll land back on this unlock automatically.
            </p>
            <button onClick={() => { onReconnect?.(); }} style={BTN(true)}>Reconnect Wallet →</button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--gold)' }}>✓</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--gold)' }}>Signal Unlocked!</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>$0.05 USDC paid. Enjoy the alpha.</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>Unlock failed</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
            <button onClick={onClose} style={BTN(false)}>Close</button>
          </div>
        )}

      </div>
    </div>
  );
}
