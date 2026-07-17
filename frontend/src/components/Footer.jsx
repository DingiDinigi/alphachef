export default function Footer() {
  return (
    <footer style={{ padding: '60px 60px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 19, fontWeight: 700, marginBottom: 8 }}>AlphaChef</div>
          <p style={{ fontSize: 13, color: 'var(--dim)', maxWidth: 300, lineHeight: 1.6 }}>
            Autonomous on-chain alpha signal platform.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          <a href="https://alphachef.site" style={{ fontSize: 13, color: 'var(--dim)', textDecoration: 'none' }}>alphachef.site</a>
          <a href="https://github.com/DingiDinigi/alphachef" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--dim)', textDecoration: 'none' }}>GitHub</a>
          <a href="https://rpc.testnet.arc.fun" style={{ fontSize: 13, color: 'var(--dim)', textDecoration: 'none' }}>Arc Testnet</a>
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>
          © 2026 AlphaChef · Built on Arc · Powered by Circle x402
        </div>
      </div>
    </footer>
  );
}
