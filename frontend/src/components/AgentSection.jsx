import Reveal from './Reveal';

const SOURCES = [
  { icon: '🐋', label: 'Smart Money Wallet Tracker' },
  { icon: '📊', label: 'Token Accumulation Detector' },
  { icon: '💧', label: 'Liquidity Event Monitor' },
  { icon: '🌉', label: 'Bridge Activity Scanner' },
  { icon: '📈', label: 'Funding Rate Anomaly Detector' },
  { icon: '🐦', label: 'Social Momentum Tracker' },
  { icon: '⚙️', label: 'GitHub Commit Activity' },
  { icon: '🏦', label: 'Exchange Flow Monitor' },
];

export default function AgentSection({ logs }) {
  return (
    <section id="the-agent" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
        <Reveal>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 2, background: 'var(--gold)', borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />
            The Agent
          </div>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(26px,3.5vw,46px)', fontWeight: 400, lineHeight: 1.1, marginBottom: 18 }}>
            Eight sources. <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Always watching.</em>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 13 }}>
            AlphaChef's autonomous agent runs 24/7, cross-referencing a minimum of two independent sources before publishing any signal.
          </p>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24 }}>
            LOW confidence requires 2 sources. HIGH requires 3+ with strength scores above threshold. Signal quality over volume.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {SOURCES.map((src, i) => (
              <Reveal key={i} delay={i * 0.05} y={10}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px',
                background: 'var(--bg3)', borderRadius: 11, border: '1px solid var(--border)',
                fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{src.icon}</span>
                <span style={{ flex: 1 }}>{src.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--green)', fontFamily: '"JetBrains Mono", monospace' }}>● Live</span>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
        </Reveal>

        <Reveal delay={0.15}>
        <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 22, border: '1px solid var(--border)', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
            {['#ef4444','#eab308','#22c55e'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 5 }}>alphachef — agent</span>
          </div>
          <div>
            {(!logs || logs.length === 0) ? (
              <>
                <div style={{ marginBottom: 7, color: 'rgba(255,255,255,.18)' }}>$ alphachef-agent start</div>
                <div style={{ marginBottom: 7, color: 'var(--green)' }}>⚡ Connected to Arc testnet</div>
                <div style={{ marginBottom: 7, color: '#67e8f9' }}>🍳 Scanning 8 signal sources...</div>
                <div style={{ marginBottom: 7, color: 'var(--gold)' }}>✅ Signal published: HIGH</div>
                <div style={{ marginBottom: 7, color: 'rgba(240,237,230,.76)' }}>Next scan in 5:00</div>
                <div><span style={{ display: 'inline-block', width: 8, height: 13, background: 'var(--gold)' }} className="animate-blink" /></div>
              </>
            ) : (
              logs.slice(0, 12).map((log, i) => (
                <div key={i} style={{ marginBottom: 7, color: log.level === 'ERROR' ? '#ef4444' : log.level === 'WARN' ? '#eab308' : log.message.includes('✅') ? 'var(--gold)' : log.message.includes('⚡') ? 'var(--green)' : 'rgba(240,237,230,.76)' }}>
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
        </Reveal>
      </div>
    </section>
  );
}
