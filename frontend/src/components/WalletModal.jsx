import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

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

const DIVIDER_LINE = {
  flex: 1, height: 1, background: 'var(--border)',
};

function DisabledSocialButton({ icon, label }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative', marginBottom: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        disabled
        style={{
          width: '100%', padding: '13px 18px',
          background: 'transparent',
          border: '1px solid rgba(201,162,39,.45)',
          borderRadius: 12, cursor: 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 14,
          opacity: 0.6,
        }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(201,162,39,.08)',
          border: '1px solid rgba(201,162,39,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, flexShrink: 0, color: 'var(--gold)',
        }}>
          {icon}
        </span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Coming soon</div>
        </div>
      </button>
      {hovered && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1a14', border: '1px solid rgba(201,162,39,.3)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap',
          zIndex: 10, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,.4)',
        }}>
          Circle wallet integration coming soon
        </div>
      )}
    </div>
  );
}

export default function WalletModal({ onClose }) {
  return (
    <div onClick={onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>
        {/* Header */}
        <h2 style={{
          fontFamily: '"Playfair Display", serif', fontSize: 26,
          fontWeight: 400, marginBottom: 8,
        }}>
          Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
          Create a Circle wallet or connect an existing one to unlock signals.
        </p>

        {/* Section 1 — Create Circle Wallet */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
          textTransform: 'uppercase', color: 'var(--dim)',
          marginBottom: 14,
        }}>
          Create Circle Wallet
        </div>

        <DisabledSocialButton icon="G" label="Continue with Google" />
        <DisabledSocialButton icon="✉" label="Continue with Email" />

        {/* Divider */}
        <div style={DIVIDER}>
          <div style={DIVIDER_LINE} />
          <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, textTransform: 'uppercase' }}>
            Already have a wallet?
          </span>
          <div style={DIVIDER_LINE} />
        </div>

        {/* Section 2 — Connect existing wallet via RainbowKit */}
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, mounted }) => {
            if (!mounted) return null;
            return (
              <button
                onClick={openConnectModal}
                style={{
                  width: '100%', padding: '14px 18px',
                  background: 'rgba(201,162,39,.08)',
                  border: '1px solid rgba(201,162,39,.35)',
                  borderRadius: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  fontSize: 14, fontWeight: 600, color: 'var(--white)',
                  transition: 'background .15s, border-color .15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(201,162,39,.14)';
                  e.currentTarget.style.borderColor = 'rgba(201,162,39,.6)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(201,162,39,.08)';
                  e.currentTarget.style.borderColor = 'rgba(201,162,39,.35)';
                }}
              >
                <span style={{ fontSize: 18 }}>🔗</span>
                Connect Wallet
              </button>
            );
          }}
        </ConnectButton.Custom>

        {/* Bottom — Faucet */}
        <div style={{
          marginTop: 24, padding: '16px 18px',
          background: 'rgba(201,162,39,.04)',
          border: '1px solid rgba(201,162,39,.12)',
          borderRadius: 12,
        }}>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--gold)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            Get Free Test USDC →
          </a>
          <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, lineHeight: 1.55 }}>
            Need testnet USDC to unlock signals? Get free test USDC from the Circle faucet.
          </p>
        </div>
      </div>
    </div>
  );
}
