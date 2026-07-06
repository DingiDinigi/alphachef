import { useState, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)',
  zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(8px)',
};
const MODAL = {
  background: 'var(--bg2)', borderRadius: 20, padding: '40px 36px',
  border: '1px solid var(--card-border)', maxWidth: 420, width: '100%', margin: '0 16px',
};
const BTN = (primary) => ({
  width: '100%', borderRadius: 12, cursor: 'pointer',
  padding: '13px 18px', fontSize: 14, fontWeight: 600,
  background: primary ? 'rgba(201,162,39,.08)' : 'transparent',
  border: `1px solid ${primary ? 'rgba(201,162,39,.35)' : 'var(--border)'}`,
  color: 'var(--white)', display: 'flex', alignItems: 'center',
  justifyContent: primary ? 'center' : 'flex-start', gap: primary ? 10 : 14,
});
const ICON = {
  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
  background: 'rgba(201,162,39,.08)', border: '1px solid rgba(201,162,39,.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 15, color: 'var(--gold)',
};
const INPUT = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(201,162,39,.3)',
  borderRadius: 10, padding: '12px 14px', color: 'var(--white)',
  fontSize: 14, outline: 'none',
};
const DIVIDER = { display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' };
const LINE = { flex: 1, height: 1, background: 'var(--border)' };
const LABEL = {
  fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
  textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 14,
};

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID || '';

// Views: main → email → sent → otp-running → set-password → success → err
export default function WalletModal({ onClose, onConnect }) {
  const [view, setView] = useState('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [walletAddr, setWalletAddr] = useState('');
  const sdkRef = useRef(null);
  const callbackRef = useRef(null);
  const sessionRef = useRef({});

  // Create a fresh SDK instance for every OTP flow.
  // The constructor receives a stable closure that delegates to callbackRef,
  // so we can swap the real handler later without recreating the SDK.
  function createFreshSdk() {
    sdkRef.current = new W3SSdk(
      { appSettings: { appId: CIRCLE_APP_ID } },
      (error, result) => callbackRef.current?.(error, result),
    );
    return sdkRef.current;
  }

  async function submitEmail(e) {
    if (e) e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setErrMsg('');
    try {
      const trimEmail = email.trim();

      // Fresh SDK for every OTP flow — avoids expired session from previous attempt
      const sdk = createFreshSdk();
      const deviceId = await sdk.getDeviceId();

      const r = await fetch('/api/wallet/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimEmail, deviceId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      sessionRef.current = {
        deviceToken: d.deviceToken,
        deviceEncryptionKey: d.deviceEncryptionKey,
        otpToken: d.challengeId,
      };
      setView('sent');
    } catch (err) {
      setErrMsg(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function startOtpVerification() {
    const { deviceToken, deviceEncryptionKey, otpToken } = sessionRef.current;
    const currentEmail = email.trim();

    // Reuse the SDK instance created in submitEmail (same device session)
    const s = sdkRef.current;
    if (!s) { setErrMsg('Session lost — please try again'); setView('email'); return; }

    // Set the real callback via the ref (closure in constructor delegates here)
    callbackRef.current = async (error) => {
      callbackRef.current = null;
      if (error) {
        const msg = error.message || '';
        // Session/token expired → silently redirect to request a fresh code
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('session') || msg.toLowerCase().includes('token')) {
          setView('email');
          setErrMsg('Session timed out — please request a new code.');
          return;
        }
        setErrMsg(msg || 'Verification failed');
        setView('err');
        return;
      }

      // Store Circle session tokens in sessionStorage so PasswordUnlockModal
      // can use them to create transfer challenges without re-auth.
      try {
        sessionStorage.setItem('circle_session', JSON.stringify({
          deviceToken,
          deviceEncryptionKey,
          email: currentEmail,
          storedAt: Date.now(),
        }));
      } catch (_) {}

      try {
        // Pass deviceToken so confirm can fetch the real Circle wallet
        const r = await fetch('/api/wallet/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, deviceToken, deviceEncryptionKey }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);

        setWalletAddr(d.walletAddress);

        if (d.isExisting && d.hasPassword) {
          // Returning user already set up — connect immediately
          onConnect?.(d.walletAddress, currentEmail, 'circle');
          return;
        }

        setView('set-password');
      } catch (ce) {
        setErrMsg(ce.message || 'Wallet setup failed');
        setView('err');
      }
    };

    s.updateConfigs({
      appSettings: { appId: CIRCLE_APP_ID },
      loginConfigs: { deviceToken, deviceEncryptionKey, otpToken },
    });
    setView('otp-running');
    s.verifyOtp();
  }

  async function submitPassword(e) {
    e.preventDefault();
    if (!password.trim()) return;
    if (password !== confirmPassword) { setErrMsg('Passwords do not match'); return; }
    if (password.length < 6) { setErrMsg('Password must be at least 6 characters'); return; }
    setLoading(true); setErrMsg('');
    try {
      const r = await fetch('/api/wallet/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setView('success');
      onConnect?.(walletAddr, email.trim(), 'circle');
    } catch (err) {
      setErrMsg(err.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  const stopClose = (e) => e.stopPropagation();

  return (
    <div onClick={view === 'otp-running' ? undefined : onClose} style={OVERLAY}>
      <div onClick={stopClose} style={MODAL}>

        {/* ── MAIN ── */}
        {view === 'main' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 26, fontWeight: 400, marginBottom: 8 }}>
            Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
            New here? Create a wallet with your email. Already have one? Connect it directly.
          </p>

          <div style={LABEL}>Circle Wallet (Email)</div>
          <button onClick={() => { setView('email'); setErrMsg(''); setEmail(''); }}
            style={{ ...BTN(false), marginBottom: 10 }}>
            <span style={ICON}>✉</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Continue with Email</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Verify with OTP · Arc testnet</div>
            </div>
          </button>

          <div style={DIVIDER}><div style={LINE} /><span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, textTransform: 'uppercase' }}>Or</span><div style={LINE} /></div>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => !mounted ? null : (
              <button onClick={openConnectModal} style={BTN(true)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,162,39,.14)'; e.currentTarget.style.borderColor = 'rgba(201,162,39,.6)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(201,162,39,.08)'; e.currentTarget.style.borderColor = 'rgba(201,162,39,.35)'; }}>
                <span style={{ fontSize: 18 }}>🔗</span> Connect MetaMask / Rabby
              </button>
            )}
          </ConnectButton.Custom>

          <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(201,162,39,.04)', border: '1px solid rgba(201,162,39,.12)', borderRadius: 12 }}>
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
              Get Free Test USDC →
            </a>
            <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 5, lineHeight: 1.55 }}>Need testnet USDC? Grab some from the Circle faucet.</p>
          </div>
        </>)}

        {/* ── EMAIL INPUT ── */}
        {view === 'email' && (<>
          <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}>← Back</button>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Enter your email</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
            We'll send a one-time verification code to confirm your identity.
          </p>
          <form onSubmit={submitEmail}>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus style={INPUT} />
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8, lineHeight: 1.5 }}>{errMsg}</p>}
            <button type="submit" disabled={loading || !email.trim()} style={{ ...BTN(true), marginTop: 14, opacity: loading || !email.trim() ? 0.55 : 1, cursor: loading || !email.trim() ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Sending code…' : 'Send Verification Code →'}
            </button>
          </form>
        </>)}

        {/* ── OTP SENT ── */}
        {view === 'sent' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 12 }}>
            Check your <em style={{ color: 'var(--gold)' }}>email</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.65 }}>
            A verification code was sent to <strong style={{ color: 'var(--white)' }}>{email}</strong>.
            Enter it in the dialog below.
          </p>
          {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, lineHeight: 1.5 }}>{errMsg}</p>}
          <button onClick={startOtpVerification} style={BTN(true)}>
            Enter Verification Code →
          </button>
          <button onClick={() => setView('email')} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>← Use a different email</button>
        </>)}

        {/* ── OTP RUNNING (Circle SDK iframe) ── */}
        {view === 'otp-running' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>
              Verify your email
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Enter the verification code sent to <strong style={{ color: 'var(--white)' }}>{email}</strong>.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Waiting for verification…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── SET PASSWORD ── */}
        {view === 'set-password' && (<>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 14 }}>🔑</div>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
            Set a <em style={{ color: 'var(--gold)' }}>spend password</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65, textAlign: 'center' }}>
            You'll enter this password each time you unlock a signal. Keep it safe.
          </p>
          <form onSubmit={submitPassword}>
            <input
              type="password" placeholder="Password (min 6 chars)" value={password}
              onChange={e => setPassword(e.target.value)} required autoFocus style={{ ...INPUT, marginBottom: 10 }}
            />
            <input
              type="password" placeholder="Confirm password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} required style={INPUT}
            />
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8, lineHeight: 1.5 }}>{errMsg}</p>}
            <button type="submit" disabled={loading || !password.trim() || !confirmPassword.trim()} style={{ ...BTN(true), marginTop: 14, opacity: loading || !password.trim() || !confirmPassword.trim() ? 0.55 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Setting up…' : 'Set Password & Connect →'}
            </button>
          </form>
        </>)}

        {/* ── SUCCESS ── */}
        {view === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>
              Wallet <em style={{ color: 'var(--gold)' }}>Connected</em>
            </h2>
            <div style={{ background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)', wordBreak: 'break-all', marginBottom: 20 }}>
              {walletAddr}
            </div>
            <button onClick={onClose} style={BTN(true)}>Go to Feed →</button>
          </div>
        )}

        {/* ── ERROR ── */}
        {view === 'err' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12, color: '#ff6b6b' }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
          <button onClick={() => { setView('email'); setErrMsg(''); }} style={BTN(true)}>← Try again</button>
          <button onClick={() => setView('main')} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>Start over</button>
        </>)}

      </div>
    </div>
  );
}
