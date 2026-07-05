import { useState, useEffect, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
  zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(8px)',
};

const MODAL = {
  background: 'var(--bg2)', borderRadius: 20, padding: '40px 36px',
  border: '1px solid var(--card-border)', maxWidth: 420, width: '100%', margin: '0 16px',
};

const DIVIDER = {
  display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0',
};

const DIVIDER_LINE = { flex: 1, height: 1, background: 'var(--border)' };

const BTN_BASE = {
  width: '100%', borderRadius: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '13px 18px', border: '1px solid rgba(201,162,39,.35)',
  background: 'transparent', color: 'var(--white)', textAlign: 'left',
};

const BTN_PRIMARY = {
  ...BTN_BASE,
  background: 'rgba(201,162,39,.08)',
  justifyContent: 'center',
  gap: 10, fontSize: 14, fontWeight: 600,
};

const ICON_BOX = {
  width: 32, height: 32, borderRadius: 8,
  background: 'rgba(201,162,39,.08)', border: '1px solid rgba(201,162,39,.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 15, flexShrink: 0, color: 'var(--gold)',
};

const INPUT_STYLE = {
  width: '100%', background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(201,162,39,.3)', borderRadius: 10,
  padding: '12px 14px', color: 'var(--white)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
};

const SECTION_LABEL = {
  fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
  textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 14,
};

let sdkInstance = null;
function getCircleSdk() {
  if (!sdkInstance) sdkInstance = new W3SSdk();
  return sdkInstance;
}

export default function WalletModal({ onClose, onConnect }) {
  const [view, setView] = useState('main'); // main | email | pending | success | error
  const [emailMode, setEmailMode] = useState(''); // 'email' | 'google'
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const appIdRef = useRef('');

  // Fetch Circle appId once
  useEffect(() => {
    fetch('/api/wallet/config')
      .then(r => r.json())
      .then(d => { appIdRef.current = d.appId || ''; })
      .catch(() => {});
  }, []);

  function openEmailFlow(mode) {
    setEmailMode(mode);
    setError('');
    setEmail('');
    setView('email');
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    try {
      const initResp = await fetch('/api/wallet/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const initData = await initResp.json();
      if (!initResp.ok) throw new Error(initData.error || 'Initialization failed');

      // Returning user — wallet already exists
      if (!initData.isNewUser && initData.walletAddress) {
        setWalletAddress(initData.walletAddress);
        setView('success');
        onConnect && onConnect(initData.walletAddress);
        setLoading(false);
        return;
      }

      // New user — execute Circle PIN challenge
      const { userToken, encryptionKey, challengeId } = initData;
      const sdk = getCircleSdk();

      if (appIdRef.current) {
        sdk.setAppSettings({ appId: appIdRef.current });
      }
      sdk.setAuthentication({ userToken, encryptionKey });

      setView('pending');
      setLoading(false);

      sdk.execute(challengeId, async (err) => {
        if (err) {
          setError(err.message || 'PIN setup cancelled or failed');
          setView('email');
          return;
        }

        // Fetch the newly created wallet address
        try {
          const confirmResp = await fetch('/api/wallet/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          const confirmData = await confirmResp.json();
          if (!confirmResp.ok) throw new Error(confirmData.error || 'Could not fetch wallet');
          setWalletAddress(confirmData.walletAddress);
          setView('success');
          onConnect && onConnect(confirmData.walletAddress);
        } catch (ce) {
          setError(ce.message);
          setView('email');
        }
      });
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  }

  function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
  }

  return (
    <div onClick={view === 'pending' ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {/* ── MAIN VIEW ── */}
        {view === 'main' && (
          <>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 26, fontWeight: 400, marginBottom: 8 }}>
              Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
              Create a Circle wallet or connect an existing one to unlock signals.
            </p>

            <div style={SECTION_LABEL}>Create Circle Wallet</div>

            {[
              { icon: 'G', label: 'Continue with Google', mode: 'google' },
              { icon: '✉', label: 'Continue with Email', mode: 'email' },
            ].map(({ icon, label, mode }) => (
              <button
                key={mode}
                onClick={() => openEmailFlow(mode)}
                style={{ ...BTN_BASE, marginBottom: 10 }}
              >
                <span style={ICON_BOX}>{icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Circle wallet on Arc testnet</div>
                </div>
              </button>
            ))}

            <div style={DIVIDER}>
              <div style={DIVIDER_LINE} />
              <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, textTransform: 'uppercase' }}>
                Already have a wallet?
              </span>
              <div style={DIVIDER_LINE} />
            </div>

            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => {
                if (!mounted) return null;
                return (
                  <button
                    onClick={openConnectModal}
                    style={BTN_PRIMARY}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(201,162,39,.14)';
                      e.currentTarget.style.borderColor = 'rgba(201,162,39,.6)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(201,162,39,.08)';
                      e.currentTarget.style.borderColor = 'rgba(201,162,39,.35)';
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🔗</span> Connect Wallet
                  </button>
                );
              }}
            </ConnectButton.Custom>

            <div style={{
              marginTop: 24, padding: '16px 18px',
              background: 'rgba(201,162,39,.04)', border: '1px solid rgba(201,162,39,.12)', borderRadius: 12,
            }}>
              <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" style={{
                fontSize: 13, fontWeight: 600, color: 'var(--gold)',
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                Get Free Test USDC →
              </a>
              <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, lineHeight: 1.55 }}>
                Need testnet USDC to unlock signals? Get free test USDC from the Circle faucet.
              </p>
            </div>
          </>
        )}

        {/* ── EMAIL INPUT VIEW ── */}
        {view === 'email' && (
          <>
            <button onClick={() => setView('main')} style={{
              background: 'none', border: 'none', color: 'var(--dim)',
              fontSize: 13, cursor: 'pointer', padding: '0 0 20px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              ← Back
            </button>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, fontWeight: 400, marginBottom: 8 }}>
              {emailMode === 'google' ? 'Continue with Google' : 'Continue with Email'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Enter your email. New users will set a PIN and get a Circle wallet.
              Returning users will have their wallet restored automatically.
            </p>
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={INPUT_STYLE}
              />
              {error && (
                <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 10, lineHeight: 1.5 }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  ...BTN_PRIMARY, marginTop: 16, opacity: loading || !email.trim() ? 0.6 : 1,
                  cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Connecting…' : 'Continue →'}
              </button>
            </form>
          </>
        )}

        {/* ── PIN CHALLENGE PENDING ── */}
        {view === 'pending' && (
          <>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>
              Set your <em style={{ color: 'var(--gold)' }}>PIN</em>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
              A Circle PIN prompt will appear. Set your 6-digit PIN to secure your wallet.
              Do not close this window.
            </p>
            <div style={{
              marginTop: 28, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--dim)', fontSize: 13,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2px solid var(--gold)', borderTopColor: 'transparent',
                display: 'inline-block', animation: 'spin 0.8s linear infinite',
              }} />
              Waiting for PIN…
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {/* ── SUCCESS ── */}
        {view === 'success' && (
          <>
            <div style={{ textAlign: 'center', paddingBottom: 8 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>
                Wallet <em style={{ color: 'var(--gold)' }}>Connected</em>
              </h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
                Your Circle wallet is ready on Arc testnet.
              </p>
              <div style={{
                background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 13, fontFamily: 'monospace', color: 'var(--gold)',
                wordBreak: 'break-all',
              }}>
                {walletAddress}
              </div>
              <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
                {shortAddr(walletAddress)}
              </p>
              <button
                onClick={onClose}
                style={{ ...BTN_PRIMARY, marginTop: 24 }}
              >
                Go to Feed →
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
