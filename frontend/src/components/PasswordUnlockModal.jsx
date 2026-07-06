import { useState } from 'react';
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
const INPUT = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(201,162,39,.3)',
  borderRadius: 10, padding: '12px 14px', color: 'var(--white)',
  fontSize: 14, outline: 'none',
};

// States: password → processing → success | insufficient | error
export default function PasswordUnlockModal({ email, signal, onSuccess, onClose }) {
  const navigate = useNavigate();
  const [state, setState] = useState('password');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim()) return;
    setState('processing');
    setErrMsg('');

    const walletAddress = localStorage.getItem('ac_wallet') || '';

    const unlockBody = {
      walletAddress,
      signalId: signal.id,
      amount: signal.price_usdc || 0.05,
      password,
    };
    console.log('[PasswordUnlockModal] POST /api/unlock body:', unlockBody);

    try {
      const ur = await fetch('/api/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unlockBody),
      });
      const ud = await ur.json();

      if (ur.status === 402) {
        setState('insufficient');
        setErrMsg(ud.error || 'Insufficient USDC balance');
        return;
      }
      if (!ur.ok) throw new Error(ud.error || 'Unlock failed');

      setState('success');
      setTimeout(() => { onSuccess?.(ud.signal); onClose?.(); }, 1400);
    } catch (e) {
      setErrMsg(e.message || 'Unlock failed — please try again');
      setState('password');
    }
  }

  return (
    <div onClick={state === 'processing' ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {/* ── PASSWORD INPUT ── */}
        {state === 'password' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🔑</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
              Unlock for <span style={{ color: 'var(--gold)' }}>$0.05 USDC</span>
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Enter your spend password to unlock this signal.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="password" placeholder="Your spend password" value={password}
                onChange={e => setPassword(e.target.value)} required autoFocus style={INPUT}
              />
              {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8, lineHeight: 1.5 }}>{errMsg}</p>}
              <button type="submit" disabled={!password.trim()} style={{ ...BTN(true), marginTop: 14, opacity: !password.trim() ? 0.55 : 1, cursor: !password.trim() ? 'not-allowed' : 'pointer' }}>
                <span>✓</span> Confirm Unlock →
              </button>
            </form>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
          </>
        )}

        {/* ── PROCESSING ── */}
        {state === 'processing' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Unlocking…</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Verifying and recording…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── INSUFFICIENT USDC ── */}
        {state === 'insufficient' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>
              Insufficient USDC
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.65 }}>
              {errMsg || 'You need at least $0.05 USDC on ARC testnet to unlock this signal.'}
            </p>
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
              style={{ display: 'block', ...BTN(true), textDecoration: 'none', marginBottom: 10 }}>
              Get Free Test USDC →
            </a>
            <button onClick={() => { setState('password'); setErrMsg(''); }} style={{ ...BTN(false), marginBottom: 10 }}>
              Try Again
            </button>
            <button onClick={() => { onClose?.(); navigate('/feed'); }} style={BTN(false)}>
              ← Back to Feed
            </button>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--gold)' }}>✓</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--gold)' }}>Signal Unlocked!</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>$0.05 USDC · Enjoy the alpha.</p>
          </div>
        )}

      </div>
    </div>
  );
}
