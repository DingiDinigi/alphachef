import { useState, useEffect } from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import GettingStarted from './components/GettingStarted';
import LiveFeed from './components/LiveFeed';
import AgentSection from './components/AgentSection';
import Roadmap from './components/Roadmap';
import Stats from './components/Stats';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import WalletModal from './components/WalletModal';
import SignalDetail from './components/SignalDetail';

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

    const wsHost = window.location.hostname || 'localhost';
    const ws = new WebSocket(`ws://${wsHost}:3010`);
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
    // Simulate payment for demo (in production, use x402)
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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Nav onConnect={() => setWalletOpen(true)} wallet={wallet} />
      <Hero onBrowse={() => document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth' })} stats={stats} />
      <HowItWorks />
      <GettingStarted onConnect={() => setWalletOpen(true)} />
      <LiveFeed signals={signals} onUnlock={handleUnlock} onOpen={openDetail} wallet={wallet} id="feed" />
      <AgentSection logs={stats.agent_logs} />
      <Roadmap />
      <Stats stats={stats} />
      <FAQ />
      <Footer />
      {walletOpen && <WalletModal onClose={() => setWalletOpen(false)} onConnect={connectWallet} />}
      {selectedSignal && <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </div>
  );
}
