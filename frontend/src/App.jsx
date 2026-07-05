import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAccount } from 'wagmi';
import WalletModal from './components/WalletModal';
import CircleUnlockModal from './components/CircleUnlockModal';
import SignalDetail from './components/SignalDetail';
import LandingPage from './pages/LandingPage';
import FeedPage from './pages/FeedPage';

export default function App() {
  const { address: wagmiAddress } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [unlockSignal, setUnlockSignal] = useState(null); // Circle PIN modal target
  const [appId, setAppId] = useState('');
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState({ total_signals: 0, total_unlocks: 0, total_revenue_usdc: 0, high_confidence_signals: 0, agent_logs: [] });

  // Sync MetaMask / wagmi wallet
  useEffect(() => {
    if (wagmiAddress) {
      setWallet(wagmiAddress);
      localStorage.setItem('ac_wallet', wagmiAddress);
      localStorage.setItem('ac_wallet_type', 'metamask');
      localStorage.removeItem('ac_wallet_email');
      setWalletOpen(false);
    }
  }, [wagmiAddress]);

  useEffect(() => {
    if (!wagmiAddress) {
      const saved = localStorage.getItem('ac_wallet');
      if (saved) setWallet(saved);
    }
    fetchSignals();
    fetchStats();

    // Fetch Circle appId for W3S SDK
    fetch('/api/wallet/config').then(r => r.json()).then(d => setAppId(d.appId || '')).catch(() => {});

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'new_signal') {
        setSignals(prev => [msg.signal, ...prev].slice(0, 50));
        setStats(s => ({ ...s, total_signals: s.total_signals + 1 }));
      }
    };
    ws.onerror = () => {};

    const interval = setInterval(() => { fetchSignals(); fetchStats(); }, 30000);
    return () => { ws.close(); clearInterval(interval); };
  }, []);

  async function fetchSignals() {
    try {
      const walletAddr = localStorage.getItem('ac_wallet');
      const url = `/api/signals${walletAddr ? `?wallet=${walletAddr}` : ''}`;
      const r = await fetch(url);
      const data = await r.json();
      setSignals(Array.isArray(data) ? data : []);
    } catch (_) {}
  }

  async function fetchStats() {
    try {
      const r = await fetch('/api/stats');
      const data = await r.json();
      setStats(data);
    } catch (_) {}
  }

  function connectWallet(address, email, type) {
    setWallet(address);
    localStorage.setItem('ac_wallet', address);
    localStorage.setItem('ac_wallet_type', type || 'metamask');
    if (email) localStorage.setItem('ac_wallet_email', email);
    else localStorage.removeItem('ac_wallet_email');
    setWalletOpen(false);
    fetchSignals();
  }

  function disconnectWallet() {
    setWallet(null);
    localStorage.removeItem('ac_wallet');
    localStorage.removeItem('ac_wallet_type');
    localStorage.removeItem('ac_wallet_email');
    localStorage.removeItem('circle_session');
  }

  async function handleUnlock(signal) {
    if (!wallet) { setWalletOpen(true); return; }

    const walletType = localStorage.getItem('ac_wallet_type');
    const email = localStorage.getItem('ac_wallet_email');

    // Circle wallet → PIN modal
    if (walletType === 'circle' && email) {
      setUnlockSignal(signal);
      return;
    }

    // MetaMask / generic wallet → direct mock payment
    const mockTxHash = '0x' + Math.random().toString(16).slice(2).padEnd(64, '0');
    try {
      const r = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signal.id, wallet_address: wallet, tx_hash: mockTxHash }),
      });
      const data = await r.json();
      if (data.success) {
        if (data.signal) setSelectedSignal(data.signal);
        fetchSignals();
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openDetail(signal) {
    if (signal.unlocked) setSelectedSignal(signal);
    else handleUnlock(signal);
  }

  function handleUnlockSuccess() {
    setUnlockSignal(null);
    fetchSignals();
    fetchStats();
  }

  const pageProps = {
    wallet,
    signals,
    stats,
    onWalletOpen: () => setWalletOpen(true),
    onDisconnect: disconnectWallet,
    onUnlock: handleUnlock,
    onOpen: openDetail,
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage {...pageProps} />} />
        <Route path="/feed" element={<FeedPage {...pageProps} />} />
      </Routes>

      {walletOpen && (
        <WalletModal
          onClose={() => setWalletOpen(false)}
          onConnect={connectWallet}
        />
      )}

      {unlockSignal && (
        <CircleUnlockModal
          email={localStorage.getItem('ac_wallet_email')}
          signalId={unlockSignal.id}
          appId={appId}
          onSuccess={handleUnlockSuccess}
          onClose={() => setUnlockSignal(null)}
        />
      )}

      {selectedSignal && <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </BrowserRouter>
  );
}
