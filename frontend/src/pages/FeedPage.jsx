import { useState } from 'react';
import Nav from '../components/Nav';
import LiveFeed from '../components/LiveFeed';
import Footer from '../components/Footer';

const PAGE_SIZE = 9;

export default function FeedPage({ wallet, signals, stats, balanceUsdc, onWalletOpen, onDisconnect, onUnlock, onOpen }) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Nav onWalletOpen={onWalletOpen} onDisconnect={onDisconnect} wallet={wallet} balanceUsdc={balanceUsdc} />
      <LiveFeed
        signals={signals.slice(0, visible)}
        onUnlock={onUnlock}
        onOpen={onOpen}
        wallet={wallet}
      />
      {visible < signals.length && (
        <div style={{ textAlign: 'center', padding: '0 60px 80px' }}>
          <button
            onClick={() => setVisible(v => v + PAGE_SIZE)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--white)',
              padding: '14px 40px',
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.3px',
            }}
          >
            Load More
          </button>
        </div>
      )}
      <Footer />
    </div>
  );
}
