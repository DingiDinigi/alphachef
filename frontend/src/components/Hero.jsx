import { useEffect, useRef } from 'react';

function GlobeCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const lats = 16, lons = 24;
    let angle = 0, raf;

    function init() {
      c.width = c.offsetWidth || 520;
      c.height = c.offsetHeight || 520;
    }
    init();

    function project(x, y, z) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const rx = x * cos - z * sin, rz = x * sin + z * cos;
      const sc = 800 / (800 + rz);
      return { x: c.width/2 + rx * sc, y: c.height/2 + y * sc, z: rz, sc };
    }

    function pts(R) {
      const p = [];
      for (let i = 0; i <= lats; i++) {
        for (let j = 0; j <= lons; j++) {
          const phi = Math.PI * i / lats, theta = 2 * Math.PI * j / lons;
          p.push({ x: R*Math.sin(phi)*Math.cos(theta), y: -R*Math.cos(phi), z: R*Math.sin(phi)*Math.sin(theta), lat: i, lon: j });
        }
      }
      return p;
    }

    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      const R = Math.min(c.width, c.height) * 0.42;
      const P = pts(R);
      ctx.strokeStyle = 'rgba(201,162,39,0.28)';
      ctx.lineWidth = 0.8;

      for (let i = 0; i <= lats; i++) {
        const row = P.filter(p => p.lat === i);
        ctx.beginPath();
        row.forEach((p, k) => {
          const pr = project(p.x, p.y, p.z);
          k === 0 ? ctx.moveTo(pr.x, pr.y) : ctx.lineTo(pr.x, pr.y);
        });
        ctx.stroke();
      }
      for (let j = 0; j <= lons; j++) {
        const col = P.filter(p => p.lon === j);
        ctx.beginPath();
        col.forEach((p, k) => {
          const pr = project(p.x, p.y, p.z);
          k === 0 ? ctx.moveTo(pr.x, pr.y) : ctx.lineTo(pr.x, pr.y);
        });
        ctx.stroke();
      }
      angle += 0.003;
      raf = requestAnimationFrame(draw);
    }
    draw();

    const ro = new ResizeObserver(init);
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 520, aspectRatio: '1', display: 'block' }} />;
}

export default function Hero({ onBrowse, stats }) {
  return (
    <section style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      alignItems: 'center', padding: '120px 60px 80px', gap: 40,
    }}>
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(201,162,39,.07)', border: '1px solid rgba(201,162,39,.2)',
          color: 'var(--gold)', fontSize: 11, fontWeight: 600,
          letterSpacing: '1.8px', textTransform: 'uppercase',
          padding: '6px 14px', borderRadius: 100, marginBottom: 36,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} className="animate-pulse-dot" />
          Live Signal Feed
        </div>

        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(42px,5vw,72px)', fontWeight: 400, lineHeight: 1.08, marginBottom: 22, letterSpacing: '-0.5px' }}>
          The Signal Is
          <em style={{ fontStyle: 'italic', color: 'var(--gold)', display: 'block' }}>Always Cooking.</em>
        </h1>

        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.78, marginBottom: 44 }}>
          Autonomous AI monitors 8 on-chain and social sources 24/7. Pay $0.01–$0.05 USDC to unlock full signal analysis — settled via Circle x402 on Arc testnet.
        </p>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onBrowse} style={{
            background: 'var(--gold)', color: '#0a0a08', padding: '14px 28px',
            borderRadius: 100, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>
            Browse Signals
          </button>
          <a href="https://github.com/DingiDingi/alphachef" target="_blank" rel="noreferrer"
            style={{ color: 'var(--dim)', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            Read the Docs →
          </a>
        </div>

        <div style={{ display: 'flex', gap: 44, marginTop: 52, paddingTop: 28, borderTop: '1px solid var(--border)' }}>
          {[
            { num: stats.total_signals || '—', suf: '', lbl: 'Signals Published' },
            { num: stats.total_unlocks || '—', suf: '', lbl: 'Signals Unlocked' },
            { num: (stats.total_revenue_usdc || 0).toFixed(2), suf: ' USDC', lbl: 'Revenue Generated' },
          ].map(({ num, suf, lbl }) => (
            <div key={lbl}>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 30, fontWeight: 400, lineHeight: 1 }}>
                {num}<em style={{ fontStyle: 'italic', color: 'var(--gold)', fontSize: 17 }}>{suf}</em>
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 5 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GlobeCanvas />
      </div>
    </section>
  );
}
