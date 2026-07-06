import { useEffect, useRef } from 'react';

function GlobeCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const lats = 18, lons = 28;
    let angle = 0, raf;

    function init() {
      const w = c.offsetWidth || 520;
      c.width = w;
      c.height = w;
    }
    init();

    function project(x, y, z) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const rx = x * cos - z * sin, rz = x * sin + z * cos;
      const sc = 900 / (900 + rz);
      return { x: c.width / 2 + rx * sc, y: c.height / 2 + y * sc, z: rz, sc };
    }

    function buildPts(R) {
      const p = [];
      for (let i = 0; i <= lats; i++) {
        for (let j = 0; j <= lons; j++) {
          const phi = (Math.PI * i) / lats;
          const theta = (2 * Math.PI * j) / lons;
          p.push({
            x: R * Math.sin(phi) * Math.cos(theta),
            y: -R * Math.cos(phi),
            z: R * Math.sin(phi) * Math.sin(theta),
            lat: i,
            lon: j,
          });
        }
      }
      return p;
    }

    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      const R = Math.min(c.width, c.height) * 0.41;

      // Atmospheric glow behind the globe
      const atmos = ctx.createRadialGradient(c.width / 2, c.height / 2, R * 0.4, c.width / 2, c.height / 2, R * 1.5);
      atmos.addColorStop(0, 'rgba(201,162,39,0.05)');
      atmos.addColorStop(0.6, 'rgba(201,162,39,0.09)');
      atmos.addColorStop(1, 'rgba(201,162,39,0)');
      ctx.fillStyle = atmos;
      ctx.fillRect(0, 0, c.width, c.height);

      const P = buildPts(R);

      // Latitude rings
      for (let i = 0; i <= lats; i++) {
        const row = P.filter(p => p.lat === i);
        ctx.beginPath();
        row.forEach((p, k) => {
          const pr = project(p.x, p.y, p.z);
          k === 0 ? ctx.moveTo(pr.x, pr.y) : ctx.lineTo(pr.x, pr.y);
        });
        // Brighter at equator
        const equatorFactor = 1 - Math.abs((i / lats) - 0.5) * 1.2;
        ctx.strokeStyle = `rgba(201,162,39,${0.14 + equatorFactor * 0.22})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // Longitude meridians
      for (let j = 0; j <= lons; j++) {
        const col = P.filter(p => p.lon === j);
        ctx.beginPath();
        col.forEach((p, k) => {
          const pr = project(p.x, p.y, p.z);
          k === 0 ? ctx.moveTo(pr.x, pr.y) : ctx.lineTo(pr.x, pr.y);
        });
        ctx.strokeStyle = 'rgba(201,162,39,0.18)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Glowing dots at grid intersections on front hemisphere
      P.forEach(p => {
        if (p.lat % 2 === 0 && p.lon % 4 === 0) {
          const pr = project(p.x, p.y, p.z);
          if (pr.z > -R * 0.1) {
            const depth = Math.max(0, (pr.z + R) / (2 * R));
            const alpha = 0.25 + depth * 0.65;
            const radius = 1.4 * pr.sc;
            // Glow halo
            const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, radius * 4);
            glow.addColorStop(0, `rgba(201,162,39,${alpha * 0.5})`);
            glow.addColorStop(1, 'rgba(201,162,39,0)');
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, radius * 4, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
            // Core dot
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(224,185,58,${alpha})`;
            ctx.fill();
          }
        }
      });

      // Outer atmospheric ring
      const ring = ctx.createRadialGradient(c.width / 2, c.height / 2, R * 0.88, c.width / 2, c.height / 2, R * 1.18);
      ring.addColorStop(0, 'rgba(201,162,39,0.14)');
      ring.addColorStop(0.5, 'rgba(201,162,39,0.06)');
      ring.addColorStop(1, 'rgba(201,162,39,0)');
      ctx.beginPath();
      ctx.arc(c.width / 2, c.height / 2, R * 1.18, 0, Math.PI * 2);
      ctx.fillStyle = ring;
      ctx.fill();

      // Highlight shimmer on top-left of globe (light source feel)
      const shimmer = ctx.createRadialGradient(
        c.width / 2 - R * 0.3, c.height / 2 - R * 0.3, 0,
        c.width / 2 - R * 0.3, c.height / 2 - R * 0.3, R * 0.7
      );
      shimmer.addColorStop(0, 'rgba(255,240,180,0.07)');
      shimmer.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.beginPath();
      ctx.arc(c.width / 2, c.height / 2, R, 0, Math.PI * 2);
      ctx.fillStyle = shimmer;
      ctx.fill();

      angle += 0.003;
      raf = requestAnimationFrame(draw);
    }

    draw();

    const ro = new ResizeObserver(init);
    ro.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', maxWidth: 520, aspectRatio: '1', display: 'block' }}
    />
  );
}

export default function Hero({ onBrowse, stats }) {
  const statItems = [
    { num: stats.total_signals ?? '—', suf: '', lbl: 'Signals Published' },
    { num: stats.total_unlocks ?? '—', suf: '', lbl: 'Signals Unlocked' },
    { num: (stats.total_revenue_usdc || 0).toFixed(2), suf: ' USDC', lbl: 'Revenue (USDC)' },
    { num: stats.high_confidence_signals ?? '—', suf: '', lbl: 'High Confidence' },
  ];

  return (
    <section style={{
      minHeight: '100vh',
      background: `
        radial-gradient(ellipse 70% 55% at 68% 38%, rgba(201,162,39,0.07) 0%, transparent 65%),
        radial-gradient(ellipse 50% 40% at 20% 80%, rgba(201,162,39,0.03) 0%, transparent 60%),
        #0a0a08
      `,
      display: 'flex',
      flexDirection: 'column',
      padding: '0 60px',
    }}>

      {/* Two-column hero body */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'center',
        gap: 60,
        paddingTop: 110,
        paddingBottom: 40,
      }}>

        {/* LEFT: copy */}
        <div style={{ position: 'relative', zIndex: 2 }}>

          {/* Live badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(201,162,39,0.07)',
            border: '1px solid rgba(201,162,39,0.28)',
            color: '#c9a227',
            fontSize: 11, fontWeight: 700,
            letterSpacing: '2px', textTransform: 'uppercase',
            padding: '6px 16px', borderRadius: 100, marginBottom: 38,
            boxShadow: '0 0 18px rgba(201,162,39,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 8px rgba(74,222,128,0.9)',
              display: 'inline-block',
            }} className="animate-pulse-dot" />
            Live Signal Feed
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(46px, 5.5vw, 80px)',
            fontWeight: 400,
            lineHeight: 1.06,
            marginBottom: 26,
            letterSpacing: '-0.5px',
            color: '#f0ede6',
            textShadow: '0 2px 32px rgba(0,0,0,0.6)',
          }}>
            The Signal Is
            <em style={{
              fontStyle: 'italic',
              color: '#c9a227',
              display: 'block',
              textShadow: `
                0 0 20px rgba(201,162,39,0.7),
                0 0 50px rgba(201,162,39,0.35),
                0 0 90px rgba(201,162,39,0.15)
              `,
            }}>
              Always Cooking.
            </em>
          </h1>

          {/* Sub-copy */}
          <p style={{
            fontSize: 15,
            color: 'rgba(240,237,230,0.50)',
            maxWidth: 420,
            lineHeight: 1.82,
            marginBottom: 50,
            textShadow: '0 1px 8px rgba(0,0,0,0.5)',
          }}>
            Autonomous AI monitors 8 on-chain and social sources 24/7. Pay $0.01–$0.05 USDC to unlock full signal analysis — settled via Circle x402 on Arc testnet.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onBrowse}
              style={{
                background: 'linear-gradient(135deg, #e0b93a 0%, #c9a227 55%, #b8911f 100%)',
                color: '#0a0a08',
                padding: '15px 34px',
                borderRadius: 100,
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.4px',
                boxShadow: `
                  0 0 28px rgba(201,162,39,0.5),
                  0 4px 20px rgba(0,0,0,0.35),
                  inset 0 1px 0 rgba(255,255,255,0.25)
                `,
                transition: 'box-shadow 0.2s, transform 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 0 40px rgba(201,162,39,0.7), 0 6px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 0 28px rgba(201,162,39,0.5), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Browse Signals
            </button>

            <a
              href="https://github.com/DingiDingi/alphachef"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'rgba(240,237,230,0.40)',
                fontSize: 14,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,237,230,0.75)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,237,230,0.40)')}
            >
              Read the Docs&nbsp;→
            </a>
          </div>
        </div>

        {/* RIGHT: Globe */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Backdrop radial glow */}
          <div style={{
            position: 'absolute',
            inset: '-25%',
            background: 'radial-gradient(circle, rgba(201,162,39,0.11) 0%, rgba(201,162,39,0.04) 45%, transparent 72%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />
          <GlobeCanvas />
        </div>
      </div>

      {/* STATS BAR — full width, directly under globe area */}
      <div style={{ paddingBottom: 52 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(201,162,39,0.18)',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.03),
            0 0 48px rgba(201,162,39,0.07),
            inset 0 1px 0 rgba(201,162,39,0.14)
          `,
        }}>
          {statItems.map(({ num, suf, lbl }, idx) => (
            <div
              key={lbl}
              style={{
                background: 'rgba(13,12,9,0.97)',
                backdropFilter: 'blur(12px)',
                padding: '30px 36px',
                position: 'relative',
                borderRight: idx < 3 ? '1px solid rgba(201,162,39,0.10)' : 'none',
                overflow: 'hidden',
              }}
            >
              {/* Gold top accent stripe */}
              <div style={{
                position: 'absolute',
                top: 0, left: '18%', right: '18%', height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.65), transparent)',
              }} />

              {/* Subtle corner glow */}
              <div style={{
                position: 'absolute',
                top: -40, left: -40,
                width: 100, height: 100,
                background: 'radial-gradient(circle, rgba(201,162,39,0.06) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              {/* Number */}
              <div style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: 46,
                fontWeight: 400,
                lineHeight: 1,
                marginBottom: 10,
                color: '#f0ede6',
                textShadow: '0 0 24px rgba(201,162,39,0.22)',
                display: 'flex',
                alignItems: 'baseline',
                gap: 4,
              }}>
                {num}
                {suf && (
                  <em style={{
                    fontStyle: 'italic',
                    color: '#c9a227',
                    fontSize: 18,
                    marginLeft: 2,
                    textShadow: '0 0 14px rgba(201,162,39,0.7)',
                  }}>
                    {suf}
                  </em>
                )}
              </div>

              {/* Label */}
              <div style={{
                fontSize: 9.5,
                color: 'rgba(240,237,230,0.32)',
                letterSpacing: '2.2px',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                {lbl}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
