const steps = [
  { num: '01', title: 'Connect Wallet', desc: 'Sign in with Google or email, or connect an existing wallet directly.' },
  { num: '02', title: 'Get Testnet USDC', desc: 'Use the Arc faucet to get free testnet USDC for signal unlocking.' },
  { num: '03', title: 'Browse Signals', desc: 'View live signals from the autonomous agent — new ones every 5 minutes.' },
  { num: '04', title: 'Unlock Alpha', desc: 'Pay $0.01–$0.05 USDC via x402 nanopayment. Full analysis opens instantly.' },
];

export default function GettingStarted({ onConnect }) {
  return (
    <section style={{ padding: '96px 60px', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 24, height: 2, background: 'var(--gold)', borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />
          Getting Started
        </div>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(26px,3.5vw,46px)', fontWeight: 400, marginBottom: 12 }}>
          Up and running in <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>60 seconds</em>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 48, maxWidth: 520, lineHeight: 1.7 }}>
          No MetaMask required. Circle creates your Arc wallet automatically when you sign in.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 25, left: '9%', right: '9%', height: 1, background: 'linear-gradient(to right, var(--gold), rgba(201,162,39,.08))', zIndex: 0 }} />
          {steps.map((step, i) => (
            <div key={i} style={{ textAlign: 'center', position: 'relative', zIndex: 1, padding: '0 8px' }}>
              <div style={{
                width: 50, height: 50, borderRadius: '50%', background: 'var(--card)',
                color: 'var(--gold)', fontFamily: '"JetBrains Mono", monospace', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px', border: '2px solid var(--gold)',
              }}>{step.num}</div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>{step.title}</h4>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{step.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, padding: '16px 20px', background: 'rgba(201,162,39,.05)', border: '1px solid rgba(201,162,39,.15)', borderRadius: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 600 }}>
          <strong style={{ color: 'var(--gold)' }}>Returning users:</strong> sign in with the same email to reconnect your existing Circle wallet — no new wallet created, your USDC balance carries over.
        </div>
        <button onClick={onConnect} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24,
          background: 'var(--gold)', color: '#0a0a08', padding: '12px 24px',
          borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
        }}>
          ⚡ Connect Wallet to Start
        </button>
      </div>
    </section>
  );
}
