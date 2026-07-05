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
console.log('[W3SSdk] VITE_CIRCLE_APP_ID:', CIRCLE_APP_ID || '(empty — check .env)');

// Module-level singleton. _loginCallback is swapped in before each verifyOtp()
// call so the component can forward the onLoginComplete result to React state.
let _sdk = null;
let _loginCallback = null;

function getSdk() {
  if (!_sdk) {
    // Second arg must be the callback function itself (not an object wrapper).
    // It receives (error, result) — forwarded to _loginCallback which is swapped
    // in before each verifyOtp() call.
    _sdk = new W3SSdk(
      { appSettings: { appId: CIRCLE_APP_ID } },
      (error, result) => _loginCallback?.(error, result),
    );
    _sdk.getDeviceId((err, deviceId) => {
      if (err) console.warn('[W3SSdk] getDeviceId error:', err);
      else console.log('[W3SSdk] deviceId:', deviceId);
    });
  }
  return _sdk;
}

export default function WalletModal({ onClose, onConnect }) {
  const [view, setView] = useState('main'); // main | email | sent | pin | success | err
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [walletAddr, setWalletAddr] = useState('');
  const sessionRef = useRef({}); // holds { deviceToken, deviceEncryptionKey, challengeId }

  async function submitEmail(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setErrMsg('');
    try {
      const r = await fetch('/api/wallet/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      // ── Returning user — instant restore ─────────────────────────────
      if (!d.isNewUser && d.walletAddress) {
        setWalletAddr(d.walletAddress);
        setView('success');
        onConnect?.(d.walletAddress, email.trim(), 'circle');
        return;
      }

      // ── New user — Circle sent OTP, execute W3S challenge ─────────
      sessionRef.current = { deviceToken: d.deviceToken, deviceEncryptionKey: d.deviceEncryptionKey, otpToken: d.challengeId };
      setView('sent'); // "check your email" screen
    } catch (err) {
      setErrMsg(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function startOtpVerification() {
    const { deviceToken, deviceEncryptionKey, otpToken } = sessionRef.current;
    const s = getSdk();

    // Capture email now (React state); wire result to confirm before verifyOtp fires.
    const currentEmail = email.trim();
    _loginCallback = null; // clear any stale callback first
    // onLoginComplete fires as (error, result) — handle both arms.
    _loginCallback = async (error, result) => {
      _loginCallback = null;
      if (error) {
        setErrMsg(error.message || 'OTP verification failed');
        setView('err');
        return;
      }
      const userToken = result?.userToken || deviceToken;
      const encryptionKey = result?.encryptionKey || deviceEncryptionKey;
      try {
        const r = await fetch('/api/wallet/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, userToken, encryptionKey }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setWalletAddr(d.walletAddress);
        setView('success');
        onConnect?.(d.walletAddress, currentEmail, 'circle');
      } catch (ce) {
        setErrMsg(ce.message || 'Wallet setup failed');
        setView('err');
      }
    };

    // updateConfigs replaces this.configs entirely — must include appSettings
    // so the iframe serviceUrl is not lost. loginConfigs has no email field.
    s.updateConfigs({
      appSettings: { appId: CIRCLE_APP_ID },
      loginConfigs: { deviceToken, deviceEncryptionKey, otpToken },
    });
    setView('pin');
    s.verifyOtp();
  }

  const stopClose = (e) => e.stopPropagation();
  const noBgClose = view === 'pin';

  return (
    <div onClick={noBgClose ? undefined : onClose} style={OVERLAY}>
      <div onClick={stopClose} style={MODAL}>

        {/* ── MAIN ── */}
        {view === 'main' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 26, fontWeight: 400, marginBottom: 8 }}>
            Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
            New here? Create a Circle wallet with your email. Already have one? Connect it directly.
          </p>

          <div style={LABEL}>Create Circle Wallet</div>
          {[{ icon: 'G', label: 'Continue with Google' }, { icon: '✉', label: 'Continue with Email' }].map(({ icon, label }) => (
            <button key={label} onClick={() => { setView('email'); setErrMsg(''); setEmail(''); }}
              style={{ ...BTN(false), marginBottom: 10 }}>
              <span style={ICON}>{icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Circle wallet · Arc testnet</div>
              </div>
            </button>
          ))}

          <div style={DIVIDER}><div style={LINE} /><span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, textTransform: 'uppercase' }}>Already have a wallet?</span><div style={LINE} /></div>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => !mounted ? null : (
              <button onClick={openConnectModal} style={BTN(true)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,162,39,.14)'; e.currentTarget.style.borderColor = 'rgba(201,162,39,.6)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(201,162,39,.08)'; e.currentTarget.style.borderColor = 'rgba(201,162,39,.35)'; }}>
                <span style={{ fontSize: 18 }}>🔗</span> Connect Wallet
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
            We'll send a verification code to confirm your address, then you'll set a 6-digit PIN to secure your wallet.
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
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.65 }}>
            A 6-digit verification code was sent to <strong style={{ color: 'var(--white)' }}>{email}</strong>.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.65 }}>
            Enter the code in the Circle prompt, then set your 6-digit PIN. Your wallet will be created automatically.
          </p>
          {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, lineHeight: 1.5 }}>{errMsg}</p>}
          <button onClick={startOtpVerification} style={BTN(true)}>Enter Code &amp; Set PIN →</button>
          <button onClick={() => setView('email')} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>← Use a different email</button>
        </>)}

        {/* ── PIN CHALLENGE RUNNING ── */}
        {view === 'pin' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>
            Verify code &amp; set <em style={{ color: 'var(--gold)' }}>PIN</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
            Enter your email verification code, then choose a 6-digit PIN. Your Circle wallet will be created instantly after.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--dim)', fontSize: 13 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
            Waiting for Circle prompt…
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </>)}

        {/* ── SUCCESS ── */}
        {view === 'success' && (<>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>
              Wallet <em style={{ color: 'var(--gold)' }}>Ready</em>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>Your Circle wallet is connected on Arc testnet.</p>
            <div style={{ background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)', wordBreak: 'break-all', marginBottom: 20 }}>
              {walletAddr}
            </div>
            <button onClick={onClose} style={BTN(true)}>Go to Feed →</button>
          </div>
        </>)}

        {/* ── ERROR ── */}
        {view === 'err' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12, color: '#ff6b6b' }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
          <button onClick={() => setView('main')} style={BTN(false)}>← Start over</button>
        </>)}

      </div>
    </div>
  );
}
