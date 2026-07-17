import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Nav({ onWalletOpen, onDisconnect, wallet, balanceUsdc }) {
  const { pathname } = useLocation();
  const base = pathname === '/feed' ? '/' : '';
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function copyAddress() {
    navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    setOpen(false);
  }

  function reconnect() {
    setOpen(false);
    onDisconnect();
    onWalletOpen();
  }

  function disconnect() {
    setOpen(false);
    onDisconnect();
  }

  const hashLinks = [
    { label: 'How It Works', hash: 'how-it-works' },
    { label: 'The Agent', hash: 'the-agent' },
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
        <img src="/alphachef-logo.png" alt="AlphaChef" style={{ height: 38, width: 'auto', display: 'block' }} />
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 19, fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.3px' }}>
          AlphaChef
        </span>
      </Link>

      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <Link to="/feed" style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', textDecoration: 'none' }}>Feed</Link>
        {wallet && (
          <Link to="/profile" style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', textDecoration: 'none' }}>Profile</Link>
        )}
        {hashLinks.map(({ label, hash }) => (
          <a key={hash} href={`${base}#${hash}`}
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--dim)', textDecoration: 'none' }}>
            {label}
          </a>
        ))}
      </div>

      {wallet ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {balanceUsdc !== undefined && balanceUsdc !== '' && (
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--gold)',
              background: 'rgba(201,162,39,.08)', border: '1px solid rgba(201,162,39,.2)',
              padding: '5px 12px', borderRadius: 100,
            }}>
              {parseFloat(balanceUsdc).toFixed(2)} USDC
            </div>
          )}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={{
              background: 'var(--gold)', color: '#0a0a08', padding: '10px 22px',
              borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              {copied ? 'Copied!' : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`}
            </button>

            {open && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                background: 'var(--bg2)', border: '1px solid var(--card-border)',
                borderRadius: 12, padding: '6px', minWidth: 180, zIndex: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,.5)',
              }}>
                <button onClick={copyAddress} style={menuItem}>📋 Copy address</button>
                <Link to="/profile" onClick={() => setOpen(false)} style={{ ...menuItem, display: 'block', textDecoration: 'none' }}>👤 Profile</Link>
                <button onClick={reconnect} style={menuItem}>🔄 Reconnect wallet</button>
                <button onClick={disconnect} style={{ ...menuItem, color: '#ff6b6b' }}>🚪 Disconnect</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button onClick={onWalletOpen} style={{
          background: 'var(--gold)', color: '#0a0a08', padding: '10px 22px',
          borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Connect Wallet
        </button>
      )}
    </nav>
  );
}

const menuItem = {
  display: 'block', width: '100%', textAlign: 'left',
  background: 'none', border: 'none', color: 'var(--white)',
  padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  borderRadius: 8,
};
