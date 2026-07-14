function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

export default function SignalDetail({ signal, onClose }) {
  if (!signal) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, overflowY: 'auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 60px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(10,10,8,.96)', backdropFilter: 'blur(12px)',
      }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none' }}>
          ← Back to Feed
        </button>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 16, fontWeight: 700 }}>AlphaChef</span>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 60px 100px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {['HIGH','MEDIUM','LOW'].includes(signal.confidence) && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, fontFamily: '"JetBrains Mono", monospace', background: signal.confidence === 'HIGH' ? 'rgba(201,162,39,.12)' : 'rgba(74,213,107,.08)', color: signal.confidence === 'HIGH' ? 'var(--gold)' : 'var(--green)', border: `1px solid ${signal.confidence === 'HIGH' ? 'rgba(201,162,39,.26)' : 'rgba(74,213,107,.2)'}` }}>
              {signal.confidence}
            </span>
          )}
          {(signal.sources || []).map((src, si) => (
            <span key={si} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, fontFamily: '"JetBrains Mono", monospace', background: 'rgba(255,255,255,.04)', color: 'rgba(240,237,230,.28)', border: '1px solid rgba(255,255,255,.06)' }}>
              {src.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(22px,3.5vw,40px)', fontWeight: 400, lineHeight: 1.2, marginBottom: 20 }}>
          {signal.title}
        </h1>

        <div style={{ display: 'flex', gap: 22, marginBottom: 36, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace' }}>
            Price Paid: <strong style={{ color: 'var(--gold)' }}>${signal.price_usdc} USDC</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace' }}>
            Published: <strong style={{ color: 'var(--gold)' }}>{timeAgo(signal.created_at)}</strong>
          </span>
          {signal.token && (
            <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace' }}>
              Token: <strong style={{ color: 'var(--gold)' }}>${signal.token}</strong>
            </span>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '28px 0' }} />

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 14 }}>Full Analysis</div>
        <div style={{ fontSize: 15, color: 'rgba(240,237,230,.68)', lineHeight: 1.85 }}>
          {(signal.full_analysis || '').split('\n').filter(l => l.trim()).map((line, i) => {
            const isHeading = /^##\s+/.test(line);
            if (isHeading) {
              return (
                <div key={i} style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(240,237,230,.42)', marginTop: i === 0 ? 0 : 26, marginBottom: 10 }}>
                  {line.replace(/^##\s+/, '')}
                </div>
              );
            }
            return <p key={i} style={{ marginBottom: 15 }}>{line}</p>;
          })}
        </div>

        {signal.agent_reasoning && (
          <div style={{ background: 'rgba(201,162,39,.04)', border: '1px solid rgba(201,162,39,.15)', borderRadius: 12, padding: 22, margin: '28px 0' }}>
            <h4 style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>Agent Reasoning</h4>
            {signal.agent_reasoning.split('\n').filter(Boolean).map((line, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 9, fontSize: 13, color: 'rgba(240,237,230,.5)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                {line}
              </div>
            ))}
          </div>
        )}

        {signal.verdict && (
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderLeft: '3px solid var(--gold)', borderRadius: 8, padding: '18px 22px', margin: '20px 0 28px' }}>
            <h4 style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>AI Verdict</h4>
            <p style={{ fontSize: 14, color: 'rgba(240,237,230,.75)', lineHeight: 1.6, margin: 0 }}>{signal.verdict}</p>
          </div>
        )}

        <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid var(--border)', borderRadius: 11, padding: '18px 22px' }}>
          <h4 style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 11 }}>On-Chain Proof</h4>
          {[
            ['Signal ID', signal.id],
            ['Contract', '0x722e0b499FedCE47a90Df7837405003B203dF417'],
            ['Amount Paid', `${signal.price_usdc} USDC`],
            ['Network', 'Arc Testnet (Chain ID: 5042002)'],
            ['Settled', '✓ < 500ms'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.04)', gap: 16 }}>
              <span style={{ color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}>{label}</span>
              <span style={{ color: 'rgba(240,237,230,.6)', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, wordBreak: 'break-all', textAlign: 'right' }}>
                {value}
              </span>
            </div>
          ))}
          {signal.tx_hash && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.04)', gap: 16 }}>
                <span style={{ color: 'var(--dim)', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}>Arc Transaction</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, wordBreak: 'break-all', textAlign: 'right', color: 'var(--gold)' }}>
                  {signal.tx_hash}
                </span>
              </div>
              <a
                href={`https://testnet.arcscan.app/tx/${signal.tx_hash}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block', marginTop: 14, padding: '9px 18px',
                  background: 'rgba(201,162,39,.1)', border: '1px solid rgba(201,162,39,.35)',
                  borderRadius: 8, color: 'var(--gold)', fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: '0.5px',
                }}
              >
                View on Arc Explorer →
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
