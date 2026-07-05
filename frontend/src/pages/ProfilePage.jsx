import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav';

const CARD = {
  background: 'var(--bg2)', border: '1px solid var(--card-border)',
  borderRadius: 16, padding: '24px 28px', marginBottom: 20,
};

export default function ProfilePage({ wallet, balanceUsdc, onWalletOpen, onDisconnect }) {
  const [unlocks, setUnlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const email = localStorage.getItem('ac_wallet_email') || '';
  const walletType = localStorage.getItem('ac_wallet_type') || '';

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/unlocks?wallet=${encodeURIComponent(wallet)}`)
      .then(r => r.json())
      .then(data => { setUnlocks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [wallet]);

  if (!wallet) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 66 }}>
        <Nav wallet={wallet} onWalletOpen={onWalletOpen} onDisconnect={onDisconnect} balanceUsdc={balanceUsdc} />
        <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 24 }}>Connect your wallet to view your profile.</p>
          <button onClick={onWalletOpen} style={{
            background: 'var(--gold)', color: '#0a0a08', padding: '12px 28px',
            borderRadius: 100, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 66 }}>
      <Nav wallet={wallet} onWalletOpen={onWalletOpen} onDisconnect={onDisconnect} balanceUsdc={balanceUsdc} />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 32, fontWeight: 400, marginBottom: 32 }}>
          My <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Profile</em>
        </h1>

        {/* Wallet Info */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 16 }}>Wallet</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Address</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--gold)', wordBreak: 'break-all', marginBottom: 20 }}>
            {wallet}
          </div>
          {email && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Email</div>
              <div style={{ fontSize: 13, color: 'var(--white)', marginBottom: 20 }}>{email}</div>
            </>
          )}
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Type</div>
          <div style={{ fontSize: 13, color: 'var(--white)', textTransform: 'capitalize' }}>{walletType || 'Unknown'}</div>
        </div>

        {/* Balance */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 16 }}>USDC Balance</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>
            {balanceUsdc !== undefined && balanceUsdc !== '' ? `$${parseFloat(balanceUsdc).toFixed(2)}` : '—'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 20 }}>Arc testnet · Updates every 30s</p>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(201,162,39,.08)', border: '1px solid rgba(201,162,39,.3)',
              color: 'var(--gold)', padding: '10px 20px', borderRadius: 10,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Get Free Test USDC →
          </a>
        </div>

        {/* Unlock History */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 16 }}>
            Signals Unlocked ({unlocks.length})
          </div>

          {loading && <p style={{ fontSize: 13, color: 'var(--dim)' }}>Loading…</p>}

          {!loading && unlocks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>No signals unlocked yet.</p>
              <Link to="/feed" style={{
                fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none',
              }}>Browse Feed →</Link>
            </div>
          )}

          {!loading && unlocks.map(u => (
            <div key={u.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '14px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                  {new Date(u.created_at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                  background: u.confidence === 'HIGH' ? 'rgba(34,197,94,.12)' : u.confidence === 'MEDIUM' ? 'rgba(201,162,39,.12)' : 'rgba(255,107,107,.12)',
                  color: u.confidence === 'HIGH' ? '#22c55e' : u.confidence === 'MEDIUM' ? 'var(--gold)' : '#ff6b6b',
                  marginBottom: 4,
                }}>
                  {u.confidence}
                </div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>${u.amount_usdc} USDC</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
