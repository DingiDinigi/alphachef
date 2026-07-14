import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAccount, useSignMessage } from 'wagmi';
import WalletModal from './components/WalletModal';
import PasswordUnlockModal from './components/PasswordUnlockModal';
import SignalDetail from './components/SignalDetail';
import LandingPage from './pages/LandingPage';
import FeedPage from './pages/FeedPage';
import ProfilePage from './pages/ProfilePage';
import DocsPage from './pages/DocsPage';

export default function App() {
  const { address: wagmiAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [walletOpen, setWalletOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [unlockSignal, setUnlockSignal] = useState(null);
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState({ total_signals: 0, total_unlocks: 0, total_revenue_usdc: 0, high_confidence_signals: 0, agent_logs: [] });
  const [balanceUsdc, setBalanceUsdc] = useState('');

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

  // On load: restore wallet from localStorage, fetch data, open WebSocket
  useEffect(() => {
    if (!wagmiAddress) {
      const saved = localStorage.getItem('ac_wallet');
      if (saved) setWallet(saved);
    }

    fetchSignals();
    fetchStats();

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'new_signal') {
          setSignals(prev => [msg.signal, ...prev].slice(0, 50));
          setStats(s => ({ ...s, total_signals: s.total_signals + 1 }));
        }
      } catch (_) {}
    };
    ws.onerror = () => {};

    const interval = setInterval(() => { fetchSignals(); fetchStats(); }, 30000);
    return () => { ws.close(); clearInterval(interval); };
  }, []);

  // Poll USDC balance for Circle wallets
  useEffect(() => {
    async function fetchBalance() {
      const email = localStorage.getItem('ac_wallet_email');
      if (!email || localStorage.getItem('ac_wallet_type') !== 'circle') { setBalanceUsdc(''); return; }
      try {
        const r = await fetch(`/api/wallet/balance?email=${encodeURIComponent(email)}`);
        const d = await r.json();
        setBalanceUsdc(d.balance || '0');
      } catch (_) {}
    }
    fetchBalance();
    const t = setInterval(fetchBalance, 30000);
    return () => clearInterval(t);
  }, [wallet]);

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
    localStorage.setItem('ac_wallet_connected_at', Date.now().toString());
    if (email) localStorage.setItem('ac_wallet_email', email);
    else localStorage.removeItem('ac_wallet_email');
    setWalletOpen(false);
    fetchSignals();
  }

  function disconnectWallet() {
    setWallet(null);
    setBalanceUsdc('');
    localStorage.removeItem('ac_wallet');
    localStorage.removeItem('ac_wallet_type');
    localStorage.removeItem('ac_wallet_email');
    localStorage.removeItem('ac_wallet_connected_at');
  }

  async function handleUnlock(signal) {
    if (!wallet) { setWalletOpen(true); return; }

    const walletType = localStorage.getItem('ac_wallet_type');
    const email = localStorage.getItem('ac_wallet_email');

    if (walletType === 'circle' && email) {
      setUnlockSignal(signal);
      return;
    }

    // MetaMask / Rabby — sign message
    try {
      const message = `AlphaChef unlock signal ${signal.id}`;
      let signature;
      if (wagmiAddress) {
        signature = await signMessageAsync({ message });
      } else if (window.ethereum) {
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, wallet],
        });
      } else {
        alert('No wallet provider found. Please install MetaMask or Rabby.');
        return;
      }
      const r = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signal.id, wallet_address: wallet, tx_hash: signature, message }),
      });
      const data = await r.json();
      if (data.success) {
        if (data.signal) setSelectedSignal(data.signal);
        fetchSignals();
        fetchStats();
      } else {
        alert(data.error || 'Unlock failed');
      }
    } catch (e) {
      if (e.code !== 4001) alert(e.message || 'Unlock failed');
    }
  }

  function openDetail(signal) {
    if (signal.unlocked) setSelectedSignal(signal);
    else handleUnlock(signal);
  }

  function handleUnlockSuccess(signal) {
    setUnlockSignal(null);
    if (signal) setSelectedSignal(signal);
    fetchSignals();
    fetchStats();
  }

  const pageProps = {
    wallet,
    signals,
    stats,
    balanceUsdc,
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
        <Route path="/profile" element={<ProfilePage wallet={wallet} balanceUsdc={balanceUsdc} onWalletOpen={() => setWalletOpen(true)} onDisconnect={disconnectWallet} />} />
        <Route path="/docs" element={<DocsPage wallet={wallet} balanceUsdc={balanceUsdc} onWalletOpen={() => setWalletOpen(true)} onDisconnect={disconnectWallet} />} />
      </Routes>

      {walletOpen && (
        <WalletModal
          onClose={() => setWalletOpen(false)}
          onConnect={connectWallet}
        />
      )}

      {unlockSignal && (
        <PasswordUnlockModal
          email={localStorage.getItem('ac_wallet_email')}
          signal={unlockSignal}
          onSuccess={handleUnlockSuccess}
          onClose={() => setUnlockSignal(null)}
        />
      )}

      {selectedSignal && <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </BrowserRouter>
  );
}
