import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID || '';

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
  zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(10px)',
};
const MODAL = {
  background: 'var(--bg2)', borderRadius: 20, padding: '36px 32px',
  border: '1px solid var(--card-border)', maxWidth: 380, width: '100%', margin: '0 16px',
};
const BTN = (primary) => ({
  width: '100%', borderRadius: 12, cursor: 'pointer',
  padding: '13px 18px', fontSize: 14, fontWeight: 600,
  background: primary ? 'rgba(201,162,39,.08)' : 'transparent',
  border: `1px solid ${primary ? 'rgba(201,162,39,.35)' : 'var(--border)'}`,
  color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});
const INPUT = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(201,162,39,.3)',
  borderRadius: 10, padding: '12px 14px', color: 'var(--white)',
  fontSize: 14, outline: 'none',
};

// States:
//   password    → enter spend password
//   requesting  → calling /api/wallet/prepare-unlock (creating Circle challenge)
//   sdk-approve → Circle SDK iframe shown, waiting for user to approve transfer
//   confirming  → recording unlock in DB after Circle confirmed
//   success     → done
//   insufficient → not enough USDC
//   session-expired → Circle session gone, must reconnect wallet
//   error       → any other error
export default function PasswordUnlockModal({ email, signal, onSuccess, onClose }) {
  const navigate = useNavigate();
  const [state, setState] = useState('password');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const sdkRef = useRef(null);

  function getCircleSession() {
    try {
      const raw = sessionStorage.getItem('circle_session');
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Treat session as valid for up to 23 hours
      if (Date.now() - session.storedAt > 23 * 60 * 60 * 1000) return null;
      return session;
    } catch (_) {
      return null;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim()) return;

    setErrMsg('');

    // Read Circle session tokens from sessionStorage
    const session = getCircleSession();
    if (!session?.deviceToken) {
      // No valid Circle session — user must reconnect wallet
      setState('session-expired');
      return;
    }

    const walletAddress = localStorage.getItem('ac_wallet') || '';
    setState('requesting');

    // ── Step 0: Refresh Circle session to avoid "userToken is invalid" ────────
    // Pass the current deviceToken so the server can backfill circle_user_id
    // for existing users who connected before we started storing it.
    let freshDeviceToken = session.deviceToken;
    let freshEncryptionKey = session.deviceEncryptionKey;
    try {
      const refreshResp = await fetch('/api/wallet/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceToken: session.deviceToken }),
      });
      if (refreshResp.ok) {
        const refreshData = await refreshResp.json();
        if (refreshData.userToken) {
          freshDeviceToken = refreshData.userToken;
          freshEncryptionKey = refreshData.encryptionKey;
          sessionStorage.setItem('circle_session', JSON.stringify({
            deviceToken: freshDeviceToken,
            deviceEncryptionKey: freshEncryptionKey,
            email,
            storedAt: Date.now(),
          }));
          console.log('[PasswordUnlockModal] Step 0: Session refreshed with fresh server token');
        } else if (refreshData.refreshFailed) {
          console.log('[PasswordUnlockModal] Step 0: Refresh not possible (no circle_user_id), using cached token');
        }
      }
    } catch (_) {
      console.log('[PasswordUnlockModal] Step 0: Token refresh call failed, using cached token');
    }

    console.log('[PasswordUnlockModal] Step 1: Calling prepare-unlock for signal:', signal.id);

    try {
      // ── Step 1: Create Circle transfer challenge on server ─────────────────
      const prepResp = await fetch('/api/wallet/prepare-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          signalId: signal.id,
          walletAddress,
          password,
          deviceToken: freshDeviceToken,
          deviceEncryptionKey: freshEncryptionKey,
        }),
      });
      const prepData = await prepResp.json();
      console.log('[PasswordUnlockModal] prepare-unlock response:', prepResp.status, prepData.challengeId || prepData.error);

      if (prepData.alreadyUnlocked) {
        // Signal was already unlocked — just refetch and close
        const sr = await fetch(`/api/signals/${signal.id}?wallet=${walletAddress}`);
        const sd = await sr.json();
        onSuccess?.(sd);
        onClose?.();
        return;
      }

      if (prepResp.status === 402) {
        setState('insufficient');
        setErrMsg(prepData.error || 'Insufficient USDC balance');
        return;
      }

      if (prepData.code === 'SESSION_EXPIRED' || prepData.code === 'NO_CIRCLE_WALLET') {
        setState('session-expired');
        setErrMsg(prepData.error || 'Circle session expired');
        return;
      }

      if (!prepResp.ok) {
        throw new Error(prepData.error || 'Failed to create transfer challenge');
      }

      const { challengeId, deviceToken, deviceEncryptionKey } = prepData;
      console.log('[PasswordUnlockModal] Step 2: Got challengeId:', challengeId, '— calling sdk.execute()');

      // ── Step 2: Circle SDK executes the transfer (user approves in iframe) ──
      setState('sdk-approve');

      const sdk = new W3SSdk(
        { appSettings: { appId: CIRCLE_APP_ID } },
        async (error, result) => {
          console.log('[PasswordUnlockModal] SDK callback — error:', error?.message, '| result keys:', result ? Object.keys(result) : 'none');

          if (error) {
            const msg = error.message || '';
            if (msg.toLowerCase().includes('cancelled') || msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('denied')) {
              setState('password');
              setErrMsg('Transfer cancelled — please try again.');
            } else if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('session')) {
              setState('session-expired');
            } else {
              setState('error');
              setErrMsg(msg || 'Transfer failed in Circle SDK');
            }
            return;
          }

          // ── Step 3: Circle confirmed — record unlock in DB ──────────────────
          console.log('[PasswordUnlockModal] Step 3: SDK approved — recording unlock');
          setState('confirming');

          try {
            const circleTransferId = result?.data?.signature
              || result?.data?.hash
              || result?.data?.id
              || `circle_exec_${Date.now()}`;

            const ur = await fetch('/api/unlock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                signalId: signal.id,
                walletAddress,
                circleConfirmed: true,
                circleTransferId,
              }),
            });
            const ud = await ur.json();
            console.log('[PasswordUnlockModal] /api/unlock response:', ur.status, ud.success);

            if (!ur.ok) throw new Error(ud.error || 'Failed to record unlock');

            setState('success');
            setTimeout(() => {
              onSuccess?.(ud.signal);
              onClose?.();
            }, 1400);
          } catch (recordErr) {
            console.error('[PasswordUnlockModal] Record unlock error:', recordErr.message);
            setState('error');
            setErrMsg(recordErr.message || 'Unlock recorded but signal data failed to load');
          }
        },
      );

      sdkRef.current = sdk;
      sdk.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID },
        loginConfigs: { deviceToken, deviceEncryptionKey },
      });
      sdk.execute(challengeId);

    } catch (err) {
      console.error('[PasswordUnlockModal] Unexpected error:', err.message);
      setState('error');
      setErrMsg(err.message || 'Unlock failed — please try again');
    }
  }

  function retry() {
    setState('password');
    setErrMsg('');
  }

  return (
    <div onClick={['sdk-approve', 'requesting', 'confirming'].includes(state) ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {/* ── PASSWORD INPUT ── */}
        {state === 'password' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🔑</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
              Unlock for{' '}
              <span style={{ color: 'var(--gold)' }}>${(signal?.price_usdc || 0.05).toFixed(2)} USDC</span>
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Enter your spend password. Circle will ask you to approve the USDC transfer.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="password" placeholder="Your spend password" value={password}
                onChange={e => setPassword(e.target.value)} required autoFocus style={INPUT}
              />
              {errMsg && (
                <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8, lineHeight: 1.5 }}>{errMsg}</p>
              )}
              <button
                type="submit"
                disabled={!password.trim()}
                style={{ ...BTN(true), marginTop: 14, opacity: !password.trim() ? 0.55 : 1, cursor: !password.trim() ? 'not-allowed' : 'pointer' }}
              >
                <span>✓</span> Confirm &amp; Approve Transfer →
              </button>
            </form>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
          </>
        )}

        {/* ── REQUESTING (creating Circle challenge) ── */}
        {state === 'requesting' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>⚙️</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              Preparing transfer…
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <Spinner />
              Creating USDC transfer request on Circle…
            </div>
          </div>
        )}

        {/* ── SDK APPROVE (Circle iframe is open) ── */}
        {state === 'sdk-approve' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              Approve in Circle
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.65 }}>
              A Circle approval window has appeared. Review the USDC transfer and approve it to unlock this signal.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <Spinner />
              Waiting for your approval in Circle…
            </div>
          </div>
        )}

        {/* ── CONFIRMING (recording in DB) ── */}
        {state === 'confirming' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>
              Confirming…
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <Spinner />
              Transfer approved — recording unlock…
            </div>
          </div>
        )}

        {/* ── SESSION EXPIRED ── */}
        {state === 'session-expired' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#e0a830' }}>
              Session Expired
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.65 }}>
              Your Circle wallet session has expired. Please reconnect your wallet to unlock signals.
            </p>
            <button onClick={() => { onClose?.(); }} style={{ ...BTN(true), marginBottom: 10 }}>
              Reconnect Wallet
            </button>
            <button onClick={() => { onClose?.(); navigate('/feed'); }} style={BTN(false)}>
              ← Back to Feed
            </button>
          </div>
        )}

        {/* ── INSUFFICIENT USDC ── */}
        {state === 'insufficient' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>
              Insufficient USDC
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.65 }}>
              {errMsg || `You need at least $${(signal?.price_usdc || 0.05).toFixed(2)} USDC to unlock this signal.`}
            </p>
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
              style={{ display: 'block', ...BTN(true), textDecoration: 'none', marginBottom: 10 }}>
              Get Free Test USDC →
            </a>
            <button onClick={retry} style={{ ...BTN(false), marginBottom: 10 }}>Try Again</button>
            <button onClick={() => { onClose?.(); navigate('/feed'); }} style={BTN(false)}>
              ← Back to Feed
            </button>
          </div>
        )}

        {/* ── ERROR ── */}
        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>
              Transfer Failed
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.65 }}>
              {errMsg || 'Something went wrong. Please try again.'}
            </p>
            <button onClick={retry} style={{ ...BTN(true), marginBottom: 10 }}>Try Again</button>
            <button onClick={onClose} style={BTN(false)}>Cancel</button>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--gold)' }}>✓</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--gold)' }}>
              Signal Unlocked!
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              ${(signal?.price_usdc || 0.05).toFixed(2)} USDC transferred · Enjoy the alpha.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid var(--gold)', borderTopColor: 'transparent',
        display: 'inline-block', animation: 'spin .8s linear infinite',
        flexShrink: 0,
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
