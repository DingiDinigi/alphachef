import { Link } from 'react-router-dom';

const BADGE_STYLES = {
  HIGH: { background: 'rgba(201,162,39,.12)', color: 'var(--gold)', border: '1px solid rgba(201,162,39,.26)' },
  MEDIUM: { background: 'rgba(74,213,107,.08)', color: 'var(--green)', border: '1px solid rgba(74,213,107,.2)' },
  LOW: { background: 'rgba(255,255,255,.05)', color: 'rgba(240,237,230,.38)', border: '1px solid rgba(255,255,255,.08)' },
};

const CARD_BORDER = {
  HIGH: 'rgba(201,162,39,.35)',
  MEDIUM: 'rgba(74,213,107,.25)',
  LOW: 'rgba(255,255,255,.09)',
};

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

export default function LiveFeed({ signals, onUnlock, onOpen, wallet, id, preview }) {
  return (
    <section id={id || 'feed'} style={{ padding: '120px 60px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(28px,4vw,50px)', fontWeight: 400 }}>
              {preview ? <>Latest <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Signals</em></> : <>Live <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Signal Feed</em></>}
            </h2>
          </div>
          {preview ? (
            <Link to="/feed" style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              View Live Feed →
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', fontFamily: '"JetBrains Mono", monospace' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="animate-pulse-dot" />
              Agent Active
            </div>
          )}
        </div>

        {signals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--dim)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🍳</div>
            <p>Agent is cooking signals... check back in a moment.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {signals.map(signal => (
              <div key={signal.id}
                onClick={() => onOpen(signal)}
                style={{
                  background: 'var(--bg2)', borderRadius: 16, padding: 24, cursor: 'pointer',
                  border: `1px solid ${CARD_BORDER[signal.confidence] || CARD_BORDER.LOW}`,
                  transition: 'all .25s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, fontFamily: '"JetBrains Mono", monospace', ...BADGE_STYLES[signal.confidence] }}>
                      {signal.confidence}
                    </span>
                    {(signal.sources || []).slice(0, 2).map((src, si) => (
                      <span key={si} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, fontFamily: '"JetBrains Mono", monospace', background: 'rgba(255,255,255,.04)', color: 'rgba(240,237,230,.28)', border: '1px solid rgba(255,255,255,.06)' }}>
                        {src.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>
                    ${signal.price_usdc}
                  </span>
                </div>

                <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: 17, fontWeight: 400, lineHeight: 1.35, marginBottom: 10 }}>
                  {signal.title}
                </h3>

                <p style={{ fontSize: 13, color: 'rgba(240,237,230,.32)', lineHeight: 1.65, marginBottom: 18, position: 'relative', overflow: 'hidden', maxHeight: signal.unlocked ? 'none' : 60 }}>
                  {signal.teaser}
                  {!signal.unlocked && (
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, background: 'linear-gradient(to bottom, transparent, rgba(15,14,11,.98))', pointerEvents: 'none', display: 'block' }} />
                  )}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  <span style={{ fontSize: 11, color: 'rgba(240,237,230,.18)', fontFamily: '"JetBrains Mono", monospace' }}>
                    {timeAgo(signal.created_at)}
                  </span>
                  {signal.unlocked ? (
                    <span style={{ background: 'rgba(74,213,107,.1)', color: 'var(--green)', border: '1px solid rgba(74,213,107,.24)', borderRadius: 100, padding: '9px 16px', fontSize: 12, fontWeight: 700 }}>
                      ✓ Unlocked
                    </span>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onUnlock(signal); }} style={{
                      background: 'var(--gold)', color: '#0a0a08', border: 'none',
                      borderRadius: 100, padding: '9px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Unlock — ${signal.price_usdc}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {preview && signals.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link to="/feed" style={{
              display: 'inline-block', background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--white)',
              padding: '14px 40px', borderRadius: 100,
              fontSize: 13, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.3px',
            }}>
              View Live Feed →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
