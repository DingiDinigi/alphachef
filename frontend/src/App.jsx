import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WalletModal from './components/WalletModal';
import SignalDetail from './components/SignalDetail';
import LandingPage from './pages/LandingPage';
import FeedPage from './pages/FeedPage';

export default function App() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState({ total_signals: 0, total_unlocks: 0, total_revenue_usdc: 0, high_confidence_signals: 0, agent_logs: [] });

  useEffect(() => {
    const saved = localStorage.getItem('ac_wallet');
    if (saved) setWallet(saved);
    fetchSignals();
    fetchStats();

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

  function connectWallet(address) {
    setWallet(address);
    localStorage.setItem('ac_wallet', address);
    setWalletOpen(false);
    fetchSignals();
  }

  async function handleUnlock(signal) {
    if (!wallet) {
      setWalletOpen(true);
      return;
    }
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
    if (signal.unlocked) {
      setSelectedSignal(signal);
    } else {
      handleUnlock(signal);
    }
  }

  const pageProps = {
    wallet,
    signals,
    stats,
    onWalletOpen: () => setWalletOpen(true),
    onUnlock: handleUnlock,
    onOpen: openDetail,
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage {...pageProps} />} />
        <Route path="/feed" element={<FeedPage {...pageProps} />} />
      </Routes>
      {walletOpen && <WalletModal onClose={() => setWalletOpen(false)} onConnect={connectWallet} />}
      {selectedSignal && <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </BrowserRouter>
  );
}
