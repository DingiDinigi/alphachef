import { useState } from 'react';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(8px)',
};

const MODAL = {
  background: 'var(--bg2)', borderRadius: 20, padding: '40px 36px',
  border: '1px solid var(--card-border)', maxWidth: 420, width: '100%', margin: '0 16px',
};

const INFO_BOX = {
  background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)',
  borderRadius: 12, padding: '18px 20px', marginBottom: 20,
};

export default function WalletModal({ onClose, onConnect }) {
  const [view, setView] = useState('main'); // 'main' | 'circle-info'
  const [circleMode, setCircleMode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function handleMetaMask() {
    if (!window.ethereum) {
      setError('MetaMask not detected. Install the MetaMask extension and try again.');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts[0]) onConnect(accounts[0]);
    } catch (e) {
      setError(e.message || 'Connection rejected.');
    } finally {
      setConnecting(false);
    }
  }

  function handleCircle(mode) {
    setCircleMode(mode);
    setView('circle-info');
  }

  if (view === 'circle-info') {
    return (
      <div onClick={onClose} style={OVERLAY}>
        <div onClick={e => e.stopPropagation()} style={MODAL}>
          <button onClick={() => setView('main')} style={{
            background: 'none', border: 'none', color: 'var(--dim)',
            fontSize: 13, cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ← Back
          </button>

          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>
            Continue with <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>{circleMode === 'google' ? 'Google' : 'Email'}</em>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Wallet creation via Circle requires the Circle SDK to be configured on the backend. This feature is coming soon.
          </p>

          <div style={INFO_BOX}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>
              In the meantime — get Arc testnet USDC
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 12 }}>
              You need testnet USDC on the Arc network to unlock signals. Grab some from the Arc faucet, then connect your existing wallet below.
            </p>
            <a
              href="https://faucet.arc.fun"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Get Arc Testnet USDC →
            </a>
          </div>

          <button onClick={() => { setView('main'); setError(''); }} style={{
            width: '100%', padding: '14px 18px',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 12, cursor: 'pointer', textAlign: 'center',
            fontSize: 14, fontWeight: 600, color: 'var(--white)',
          }}>
            Connect Existing Wallet →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 26, fontWeight: 400, marginBottom: 10 }}>
          Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
          New here? Sign in with email or Google — Circle will create your Arc wallet. Already have a wallet? Connect it directly.
        </p>

        {[
          { icon: 'G', label: 'Continue with Google', sub: 'Circle wallet creation — coming soon', onClick: () => handleCircle('google') },
          { icon: '✉', label: 'Continue with Email', sub: 'Circle wallet creation — coming soon', onClick: () => handleCircle('email') },
          { icon: '🦊', label: 'Connect Existing Wallet', sub: 'MetaMask / WalletConnect', onClick: handleMetaMask, primary: true },
        ].map((opt, i) => (
          <button key={i} onClick={opt.onClick} disabled={connecting && i === 2} style={{
            width: '100%', padding: '14px 18px', marginBottom: 10,
            background: opt.primary ? 'rgba(201,162,39,.08)' : 'var(--card)',
            border: `1px solid ${opt.primary ? 'rgba(201,162,39,.3)' : 'var(--card-border)'}`,
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
            opacity: connecting && i === 2 ? 0.6 : 1,
          }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(201,162,39,.1)', border: '1px solid rgba(201,162,39,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {opt.icon}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
                {connecting && i === 2 ? 'Connecting...' : opt.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{opt.sub}</div>
            </div>
          </button>
        ))}

        {error && (
          <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 12, lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <p style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
          Need testnet USDC?{' '}
          <a href="https://faucet.arc.fun" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
            Get from the Arc faucet →
          </a>
        </p>
      </div>
    </div>
  );
}
