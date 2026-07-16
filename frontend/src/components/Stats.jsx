import Reveal from './Reveal';

export default function Stats({ stats }) {
  const items = [
    { num: stats.total_signals || 0, label: 'Signals Published' },
    { num: stats.total_unlocks || 0, label: 'Signals Unlocked' },
    { num: `$${(stats.total_revenue_usdc || 0).toFixed(2)}`, label: 'Revenue (USDC)' },
    { num: stats.high_confidence_signals || 0, label: 'High Confidence' },
  ];
  return (
    <section style={{ padding: '72px 60px', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 32 }}>
        {items.map(({ num, label }, i) => (
          <Reveal key={label} delay={i * 0.08}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 50, fontWeight: 400, lineHeight: 1, marginBottom: 8 }}>{num}</div>
            <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
          </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
