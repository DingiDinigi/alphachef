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

// 30 days — matching industry standard; users should never re-enter email within this window
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID || '';

let _sdk = null;
let _loginCallback = null;
let _deviceIdPromise = null;

function getSdk() {
  if (!_sdk) {
    _sdk = new W3SSdk(
      { appSettings: { appId: CIRCLE_APP_ID } },
      (error, result) => _loginCallback?.(error, result),
    );
    _deviceIdPromise = _sdk.getDeviceId();
    _deviceIdPromise.then(
      (id) => console.log('[W3SSdk] deviceId:', id),
      (err) => console.warn('[W3SSdk] getDeviceId error:', err),
    );
  }
  return _sdk;
}

function safeParseSession() {
  try { return JSON.parse(localStorage.getItem('circle_session') || 'null'); } catch { return null; }
}

// Views:
//   main → email → sent → otp-running
//     (returning)  → success
//     (new user)   → setup-pin → pin-running → success
//   err (any step)
export default function WalletModal({ onClose, onConnect }) {
  const [view, setView] = useState('main');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [walletAddr, setWalletAddr] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const sessionRef = useRef({}); // OTP session data (deviceToken, etc.)
  const pinSetupRef = useRef({}); // New-user PIN setup data (challengeId, userToken, encKey)

  async function submitEmail(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setErrMsg('');
    try {
      const trimEmail = email.trim();

      // Check if returning user (wallet already exists in DB)
      const checkR = await fetch('/api/wallet/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimEmail }),
      });
      const checkD = await checkR.json();

      if (checkD.isReturning) {
        const stored = safeParseSession();
        // Valid session within 30 days → auto-connect without OTP
        if (stored?.userToken && Date.now() - (stored.timestamp || 0) < SESSION_TTL) {
          setWalletAddr(checkD.walletAddress);
          setView('success');
          onConnect?.(checkD.walletAddress, trimEmail, 'circle');
          return;
        }
        setIsReturning(true);
      } else {
        setIsReturning(false);
      }

      // Need OTP — get deviceId from SDK, then request OTP email
      getSdk();
      const sdkDeviceId = await _deviceIdPromise;

      const otpR = await fetch('/api/wallet/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimEmail, deviceId: sdkDeviceId, forceOtp: checkD.isReturning }),
      });
      const otpD = await otpR.json();
      if (!otpR.ok) throw new Error(otpD.error);

      sessionRef.current = {
        deviceToken: otpD.deviceToken,
        deviceEncryptionKey: otpD.deviceEncryptionKey,
        otpToken: otpD.challengeId,
        walletAddress: otpD.walletAddress || checkD.walletAddress || null,
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
    const s = getSdk();
    const currentEmail = email.trim();

    _loginCallback = async (error, result) => {
      _loginCallback = null;
      if (error) {
        setErrMsg(error.message || 'OTP verification failed');
        setView('err');
        return;
      }
      const userToken = result?.userToken;
      const encryptionKey = result?.encryptionKey;
      const refreshToken = result?.refreshToken || null;
      if (!userToken) {
        setErrMsg('Circle did not return a userToken — please try again');
        setView('err');
        return;
      }
      try {
        const confirmR = await fetch('/api/wallet/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, userToken }),
        });
        const confirmD = await confirmR.json();
        if (!confirmR.ok) throw new Error(confirmD.error);

        if (confirmD.isExisting) {
          // Returning user — wallet already exists, session restored
          const walletAddress = sessionRef.current.walletAddress;
          localStorage.setItem('circle_session', JSON.stringify({
            userToken, encryptionKey, refreshToken, walletAddress, email: currentEmail, timestamp: Date.now(),
          }));
          setWalletAddr(walletAddress);
          setView('success');
          onConnect?.(walletAddress, currentEmail, 'circle');
          return;
        }

        // New user — need to execute wallet creation challenge.
        // Store data in ref so the PIN setup step is triggered from a button click
        // (NOT from inside this callback) to avoid Circle SDK state conflicts.
        pinSetupRef.current = {
          challengeId: confirmD.challengeId,
          userToken,
          encryptionKey,
          refreshToken,
          email: currentEmail,
        };
        setView('setup-pin');
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

  // Called from the "Set Up PIN" button — runs execute() OUTSIDE the SDK callback
  // to avoid iframe conflicts. This is the fix for the blank PIN screen issue.
  function executePinSetup() {
    const { challengeId, userToken, encryptionKey, refreshToken, email: currentEmail } = pinSetupRef.current;
    const s = getSdk();
    s.setAuthentication({ userToken, encryptionKey });
    setView('pin-running');

    s.execute(challengeId, async (execErr) => {
      if (execErr) {
        setErrMsg(execErr.message || 'PIN setup failed — please try again');
        setView('setup-pin'); // let user retry
        return;
      }
      try {
        const finR = await fetch('/api/wallet/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, userToken }),
        });
        const finD = await finR.json();
        if (!finR.ok) throw new Error(finD.error);
        localStorage.setItem('circle_session', JSON.stringify({
          userToken, encryptionKey, refreshToken, walletAddress: finD.walletAddress, email: currentEmail, timestamp: Date.now(),
        }));
        setWalletAddr(finD.walletAddress);
        setView('success');
        onConnect?.(finD.walletAddress, currentEmail, 'circle');
      } catch (fe) {
        setErrMsg(fe.message || 'Failed to finalize wallet');
        setView('err');
      }
    });
  }

  const stopClose = (e) => e.stopPropagation();
  const lockBgClose = view === 'otp-running' || view === 'pin-running';

  return (
    <div onClick={lockBgClose ? undefined : onClose} style={OVERLAY}>
      <div onClick={stopClose} style={MODAL}>

        {/* ── MAIN ── */}
        {view === 'main' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 26, fontWeight: 400, marginBottom: 8 }}>
            Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
            New here? Create a Circle wallet with your email. Already have one? Connect it directly.
          </p>

          <div style={LABEL}>Circle Wallet (Email)</div>
          <button onClick={() => { setView('email'); setErrMsg(''); setEmail(''); }}
            style={{ ...BTN(false), marginBottom: 10 }}>
            <span style={ICON}>✉</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Continue with Email</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Circle wallet · Arc testnet</div>
            </div>
          </button>

          <div style={DIVIDER}><div style={LINE} /><span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, textTransform: 'uppercase' }}>Already have a wallet?</span><div style={LINE} /></div>

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
            Returning users connect instantly. New users will set a 6-digit PIN to secure their wallet.
          </p>
          <form onSubmit={submitEmail}>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus style={INPUT} />
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8, lineHeight: 1.5 }}>{errMsg}</p>}
            <button type="submit" disabled={loading || !email.trim()} style={{ ...BTN(true), marginTop: 14, opacity: loading || !email.trim() ? 0.55 : 1, cursor: loading || !email.trim() ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Connecting…' : 'Continue →'}
            </button>
          </form>
        </>)}

        {/* ── OTP SENT ── */}
        {view === 'sent' && (<>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 12 }}>
            Check your <em style={{ color: 'var(--gold)' }}>email</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.65 }}>
            A verification code was sent to <strong style={{ color: 'var(--white)' }}>{email}</strong>.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.65 }}>
            {isReturning
              ? 'Your session needs renewal. Enter the code to restore access.'
              : 'Enter the code, then set a 6-digit PIN to secure your wallet.'}
          </p>
          {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, lineHeight: 1.5 }}>{errMsg}</p>}
          <button onClick={startOtpVerification} style={BTN(true)}>
            Enter Verification Code →
          </button>
          <button onClick={() => setView('email')} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>← Use a different email</button>
        </>)}

        {/* ── OTP IFRAME RUNNING ── */}
        {view === 'otp-running' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>
              Verify your email
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Enter the verification code sent to <strong style={{ color: 'var(--white)' }}>{email}</strong> in the Circle dialog.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Waiting for Circle verification…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── NEW USER: SET UP PIN (explicit button — not from inside SDK callback) ── */}
        {view === 'setup-pin' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔐</div>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
              Set up your <em style={{ color: 'var(--gold)' }}>PIN</em>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.65 }}>
              Email verified. Now create a 6-digit PIN to secure your Circle wallet.
            </p>
            <p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 24, lineHeight: 1.6 }}>
              Your PIN protects your wallet — you'll enter it each time you pay for a signal. Keep it safe.
            </p>
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14 }}>{errMsg}</p>}
            <button onClick={executePinSetup} style={BTN(true)}>
              Set Up PIN →
            </button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>Cancel</button>
          </div>
        )}

        {/* ── PIN IFRAME RUNNING ── */}
        {view === 'pin-running' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>
              Creating your wallet
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Complete the Circle PIN setup in the dialog. Choose and confirm a 6-digit PIN.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Waiting for PIN confirmation…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {view === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>
              Wallet <em style={{ color: 'var(--gold)' }}>{isReturning ? 'Restored' : 'Ready'}</em>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              {isReturning ? 'You\'re reconnected on Arc testnet.' : 'Your Circle wallet is connected on Arc testnet.'}
            </p>
            <div style={{ background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)', wordBreak: 'break-all', marginBottom: 20 }}>
              {walletAddr}
            </div>
            <button onClick={onClose} style={BTN(true)}>Go to Feed →</button>
          </div>
        )}

        {/* ── ERROR ── */}
        {view === 'err' && (
          <>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 12, color: '#ff6b6b' }}>Something went wrong</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
            <button onClick={() => setView('main')} style={BTN(false)}>← Start over</button>
          </>
        )}

      </div>
    </div>
  );
}
