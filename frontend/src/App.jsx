import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAccount, useSignMessage } from 'wagmi';
import WalletModal from './components/WalletModal';
import CircleUnlockModal from './components/CircleUnlockModal';
import SignalDetail from './components/SignalDetail';
import LandingPage from './pages/LandingPage';
import FeedPage from './pages/FeedPage';
import ProfilePage from './pages/ProfilePage';

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days
const REFRESH_AFTER = 45 * 60 * 1000;            // proactive refresh after 45 min

function safeParseSession() {
  try { return JSON.parse(localStorage.getItem('circle_session') || 'null'); } catch { return null; }
}

async function silentTokenRefresh() {
  const session = safeParseSession();
  if (!session?.refreshToken) return null;
  try {
    const r = await fetch('/api/wallet/refresh-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.userToken) return null;
    const newSession = {
      ...session,
      userToken: d.userToken,
      encryptionKey: d.encryptionKey || session.encryptionKey,
      timestamp: Date.now(),
    };
    if (d.refreshToken) newSession.refreshToken = d.refreshToken;
    localStorage.setItem('circle_session', JSON.stringify(newSession));
    return d.userToken;
  } catch { return null; }
}

export default function App() {
  const { address: wagmiAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [walletOpen, setWalletOpen] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [unlockSignal, setUnlockSignal] = useState(null);
  const [appId, setAppId] = useState('');
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState({ total_signals: 0, total_unlocks: 0, total_revenue_usdc: 0, high_confidence_signals: 0, agent_logs: [] });
  const [balanceUsdc, setBalanceUsdc] = useState('');
  // Holds signal to unlock after user completes re-authentication
  const pendingUnlockRef = useRef(null);

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

  // Initialize: restore session, kick off background token refresh, load data
  useEffect(() => {
    if (!wagmiAddress) {
      const session = safeParseSession();
      if (session?.walletAddress && session?.email) {
        // Restore Circle wallet from stored address — keep connected regardless of token freshness
        setWallet(session.walletAddress);
        localStorage.setItem('ac_wallet', session.walletAddress);
        localStorage.setItem('ac_wallet_type', 'circle');
        localStorage.setItem('ac_wallet_email', session.email);
        // Proactively refresh if token is stale but don't block render
        if (!session.userToken || Date.now() - (session.timestamp || 0) > REFRESH_AFTER) {
          silentTokenRefresh();
        }
      } else {
        const saved = localStorage.getItem('ac_wallet');
        if (saved) setWallet(saved);
      }
    }

    fetchSignals();
    fetchStats();
    fetch('/api/wallet/config').then(r => r.json()).then(d => setAppId(d.appId || '')).catch(() => {});

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

  // Background token refresh every 45 minutes — keeps session alive silently
  useEffect(() => {
    const t = setInterval(async () => {
      if (localStorage.getItem('ac_wallet_type') !== 'circle') return;
      const session = safeParseSession();
      if (!session?.refreshToken) return;
      if (Date.now() - (session.timestamp || 0) < 30 * 60 * 1000) return; // still fresh
      await silentTokenRefresh();
    }, REFRESH_AFTER);
    return () => clearInterval(t);
  }, []);

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
    if (email) localStorage.setItem('ac_wallet_email', email);
    else localStorage.removeItem('ac_wallet_email');
    setWalletOpen(false);
    fetchSignals();
    // Resume any pending signal unlock after re-auth
    const pending = pendingUnlockRef.current;
    if (pending) {
      pendingUnlockRef.current = null;
      setTimeout(() => setUnlockSignal(pending), 80);
    }
  }

  function disconnectWallet() {
    setWallet(null);
    setBalanceUsdc('');
    pendingUnlockRef.current = null;
    localStorage.removeItem('ac_wallet');
    localStorage.removeItem('ac_wallet_type');
    localStorage.removeItem('ac_wallet_email');
    localStorage.removeItem('circle_session');
  }

  async function handleUnlock(signal) {
    if (!wallet) { setWalletOpen(true); return; }

    const walletType = localStorage.getItem('ac_wallet_type');
    const email = localStorage.getItem('ac_wallet_email');

    if (walletType === 'circle' && email) {
      // Silently refresh token if stale before opening unlock modal
      const session = safeParseSession();
      if (!session?.userToken || Date.now() - (session.timestamp || 0) > REFRESH_AFTER) {
        await silentTokenRefresh();
      }
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

  // Called by CircleUnlockModal when session is fully expired.
  // Stores the signal so we can resume unlock after re-auth.
  function handleReconnect() {
    pendingUnlockRef.current = unlockSignal;
    setUnlockSignal(null);
    setWalletOpen(true);
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
          onReconnect={handleReconnect}
        />
      )}

      {selectedSignal && <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />}
    </BrowserRouter>
  );
}
