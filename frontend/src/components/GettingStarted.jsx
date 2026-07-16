import Reveal from './Reveal';

const steps = [
  { num: '01', title: 'Connect Wallet', desc: 'Sign in with Google or email, or connect an existing wallet directly.' },
  { num: '02', title: 'Get Testnet USDC', desc: 'Use the Circle faucet (faucet.circle.com) to get free testnet USDC for signal unlocking.' },
  { num: '03', title: 'Browse Signals', desc: 'View live signals from the autonomous agent — new ones every 5 minutes.' },
  { num: '04', title: 'Unlock Alpha', desc: 'Pay $0.01–$0.05 USDC via x402 nanopayment. Full analysis opens instantly.' },
];

export default function GettingStarted({ onConnect }) {
  return (
    <section style={{ padding: '96px 60px', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Reveal>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 2, background: 'var(--gold)', borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />
            Getting Started
          </div>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(26px,3.5vw,46px)', fontWeight: 400, marginBottom: 12 }}>
            Up and running in <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>60 seconds</em>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 56, maxWidth: 520, lineHeight: 1.7 }}>
            No MetaMask required. Circle creates your Arc wallet automatically when you sign in.
          </p>
        </Reveal>

        <div style={{ display: 'grid', gap: 8 }}>
          {steps.map((step, i) => (
            <Reveal key={i} delay={i * 0.1} y={18}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 28,
                padding: '26px 0',
                borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  flexShrink: 0, width: 64,
                  fontFamily: '"Playfair Display", serif', fontSize: 56, fontWeight: 400,
                  lineHeight: 1, color: 'transparent',
                  WebkitTextStroke: '1px rgba(201,162,39,.45)',
                  userSelect: 'none',
                }}>
                  {step.num}
                </div>
                <div style={{ paddingTop: 8, flex: 1 }}>
                  <h4 style={{ fontFamily: '"Playfair Display", serif', fontSize: 19, fontWeight: 400, color: 'var(--white)', marginBottom: 8 }}>
                    {step.title}
                  </h4>
                  <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 480 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.35}>
          <div style={{ marginTop: 32, padding: '16px 20px', background: 'rgba(201,162,39,.05)', border: '1px solid rgba(201,162,39,.15)', borderRadius: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 600 }}>
            <strong style={{ color: 'var(--gold)' }}>Returning users:</strong> sign in with the same email to reconnect your existing Circle wallet — no new wallet created, your USDC balance carries over.
          </div>
          <button
            onClick={onConnect}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(201,162,39,.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24,
              background: 'var(--gold)', color: '#0a0a08', padding: '12px 24px',
              borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            }}
          >
            ⚡ Connect Wallet to Start
          </button>
        </Reveal>
      </div>
    </section>
  );
}
