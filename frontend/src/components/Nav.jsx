import { Link, useLocation } from 'react-router-dom';

export default function Nav({ onConnect, wallet }) {
  const { pathname } = useLocation();
  const base = pathname === '/feed' ? '/' : '';

  const hashLinks = [
    { label: 'How It Works', hash: 'how-it-works' },
    { label: 'The Agent', hash: 'the-agent' },
    { label: 'Roadmap', hash: 'roadmap' },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 60px', height: 66,
      background: 'rgba(10,10,8,0.92)', backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 19, fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.3px' }}>
          AlphaChef
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
        <Link to="/feed" style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', textDecoration: 'none' }}>
          Feed
        </Link>
        {hashLinks.map(({ label, hash }) => (
          <a key={hash} href={`${base}#${hash}`}
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', textDecoration: 'none' }}>
            {label}
          </a>
        ))}
      </div>
      <button onClick={onConnect} style={{
        background: 'var(--gold)', color: '#0a0a08', padding: '10px 22px',
        borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
        {wallet ? `${wallet.slice(0,6)}...${wallet.slice(-4)}` : 'Connect Wallet'}
      </button>
    </nav>
  );
}
