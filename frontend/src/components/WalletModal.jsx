export default function WalletModal({ onClose, onConnect }) {
  function handleOption() {
    // Simulate wallet creation/connection
    const mockAddress = '0x' + Math.random().toString(16).slice(2, 42).padEnd(40, '0');
    onConnect(mockAddress);
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(8px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', borderRadius: 20, padding: '40px 36px',
        border: '1px solid var(--card-border)', maxWidth: 400, width: '100%', margin: '0 16px',
      }}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 26, fontWeight: 400, marginBottom: 10 }}>
          Connect to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
          New here? Sign in with email or Google — Circle creates your Arc wallet instantly. Already have a wallet? Connect it directly.
        </p>

        {[
          { icon: 'G', label: 'Continue with Google', sub: 'Circle creates your Arc wallet' },
          { icon: '✉', label: 'Continue with Email', sub: 'Circle creates your Arc wallet' },
          { icon: '🦊', label: 'Connect Existing Wallet', sub: 'MetaMask / WalletConnect' },
        ].map((opt, i) => (
          <button key={i} onClick={handleOption} style={{
            width: '100%', padding: '14px 18px', marginBottom: 10,
            background: i === 2 ? 'transparent' : 'var(--card)',
            border: `1px solid ${i === 2 ? 'var(--border)' : 'var(--card-border)'}`,
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(201,162,39,.1)', border: '1px solid rgba(201,162,39,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {opt.icon}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{opt.sub}</div>
            </div>
          </button>
        ))}

        <p style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
          Returning users — sign in with the same email to reconnect your existing wallet.
        </p>
      </div>
    </div>
  );
}
