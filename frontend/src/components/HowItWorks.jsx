import { useEffect, useRef } from 'react';
import Reveal from './Reveal';

function WavyCanvas({ index }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    function sz() { c.width = c.offsetWidth || 280; c.height = 144; }
    sz();
    const ws = Array.from({ length: 7 }, (_, k) => ({
      y: 14 + k * 19, phase: k * 0.85 + index * 0.4,
      speed: 0.010 + k * 0.003, amp: 5 + k * 2.2, freq: 0.019 + k * 0.002,
    }));
    let raf;
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      ws.forEach((w, k) => {
        ctx.beginPath();
        for (let x = 0; x <= c.width; x += 2) {
          const y = w.y + Math.sin(x * w.freq + w.phase) * w.amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(220,185,80,${0.05 + k * 0.022})`;
        ctx.lineWidth = 0.85;
        ctx.stroke();
        w.phase += w.speed;
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [index]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

const cards = [
  { num: '01', title: 'Agent scans on-chain', desc: 'Smart money wallets, liquidity events, bridge flows, and funding rate anomalies — monitored every 5 minutes.' },
  { num: '02', title: 'Cross-references sources', desc: 'Minimum 2 corroborating signals required before publishing. High confidence means higher price.' },
  { num: '03', title: 'Signal published to feed', desc: 'Plain-English analysis written by AI, priced $0.01–$0.05 USDC based on confidence score.' },
  { num: '04', title: 'Pay once, unlock instantly', desc: 'x402 nanopayment settles in 500ms on Arc. Full signal detail page opens on confirmation.' },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 24, height: 2, background: 'var(--gold)', borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />
          How It Works
        </div>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(32px,4vw,54px)', fontWeight: 400, marginBottom: 12 }}>
          From signal to <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>insight</em>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.7, marginBottom: 52 }}>
          Four steps. Fully automated. Every five minutes.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
          {cards.map((card, i) => (
            <Reveal key={i} delay={i * 0.1}>
            <div
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'rgba(201,162,39,.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--card-border)'; }}
              style={{
              background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--card-border)', transition: 'transform 0.3s ease, border-color 0.3s ease',
            }}>
              <div style={{ width: '100%', height: 144, position: 'relative', overflow: 'hidden' }}>
                <WavyCanvas index={i} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(201,162,39,.06) 0%,transparent 55%)', pointerEvents: 'none' }} />
              </div>
              <div style={{ padding: '20px 20px 24px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '1.5px', marginBottom: 10 }}>
                  {card.num} / 04
                </div>
                <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: 17, fontWeight: 400, color: 'rgba(240,237,230,.9)', marginBottom: 9, lineHeight: 1.35 }}>
                  {card.title}
                </h3>
                <div style={{ height: 1, background: 'rgba(201,162,39,.12)', marginBottom: 10 }} />
                <p style={{ fontSize: 12.5, color: 'rgba(240,237,230,.3)', lineHeight: 1.65 }}>{card.desc}</p>
              </div>
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
