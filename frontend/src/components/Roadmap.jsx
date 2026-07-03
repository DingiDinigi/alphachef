const phases = [
  {
    phase: 'Phase 01 · July 2026', live: true, dot: 'live',
    title: 'Foundation — Autonomous Signal Engine',
    desc: '8-source autonomous agent, x402 nanopayment feed, Circle wallet onboarding, signal detail pages with on-chain proof, Arc testnet deployment.',
    tags: ['Arc Testnet', 'Circle x402', '8 Sources', 'USDC Payments'],
  },
  {
    phase: 'Phase 02 · Q3 2026', live: false, dot: 'next',
    title: 'Intelligence — ML Signal Ranking',
    desc: 'Historical backtesting, signal accuracy scores, ML-powered confidence calibration, subscriber tiers.',
    tags: ['ML Ranking', 'Backtesting', 'Signal Accuracy', 'Tiers'],
  },
  {
    phase: 'Phase 03 · Q4 2026', live: false, dot: '',
    title: 'Scale — Multi-Chain Coverage',
    desc: 'Expand to Ethereum mainnet, Arbitrum, Base. 20+ signal sources. Real-time notifications.',
    tags: ['Mainnet', 'Multi-Chain', '20+ Sources', 'Notifications'],
  },
  {
    phase: 'Phase 04 · 2027', live: false, dot: '',
    title: 'Protocol — Decentralized Signal DAO',
    desc: 'Community signal publishing, staking mechanism, revenue sharing with top analysts.',
    tags: ['DAO', 'Staking', 'Revenue Share', 'Community'],
  },
];

export default function Roadmap() {
  return (
    <section id="roadmap" style={{ padding: '120px 60px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(28px,4vw,50px)', fontWeight: 400, marginBottom: 8 }}>
          The <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Roadmap</em>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 52, lineHeight: 1.7 }}>
          Phase 01 is live. We're cooking.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {phases.map((phase, i) => (
            <div key={i} style={{ display: 'flex', gap: 26, padding: '28px 0', borderBottom: i < phases.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ paddingTop: 4, flexShrink: 0 }}>
                <div style={{
                  width: 13, height: 13, borderRadius: '50%',
                  background: phase.dot === 'live' ? 'var(--green)' : 'transparent',
                  border: phase.dot === 'live' ? '2px solid var(--green)' : phase.dot === 'next' ? '2px solid var(--gold)' : '2px solid rgba(255,255,255,.14)',
                  boxShadow: phase.dot === 'live' ? '0 0 12px rgba(74,222,128,.35)' : 'none',
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {phase.phase}
                  {phase.live && (
                    <span style={{ background: 'rgba(74,222,128,.1)', color: 'var(--green)', border: '1px solid rgba(74,222,128,.24)', fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 8px', borderRadius: 100 }}>
                      LIVE
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: 21, fontWeight: 400, marginBottom: 9 }}>{phase.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 13 }}>{phase.desc}</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {phase.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '4px 11px', borderRadius: 100, background: 'rgba(255,255,255,.04)', color: 'var(--dim)', border: '1px solid var(--border)', fontFamily: '"JetBrains Mono", monospace' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
