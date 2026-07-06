import { useState, useEffect, useRef } from 'react';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

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

const SESSION_TTL = 24 * 60 * 60 * 1000;

function safeParseSession() {
  try { return JSON.parse(localStorage.getItem('circle_session') || 'null'); } catch { return null; }
}

let _sdk = null;
function getSdk() { if (!_sdk) _sdk = new W3SSdk(); return _sdk; }

export default function CircleUnlockModal({ email, signalId, appId, onSuccess, onClose, onReconnect }) {
  const [state, setState] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [balance, setBalance] = useState('');
  const [walletAddr, setWalletAddr] = useState('');
  const challengeRef = useRef({ challengeId: '', userToken: '', encryptionKey: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = safeParseSession();
        if (!session?.userToken) { if (!cancelled) setState('expired'); return; }
        if (Date.now() - (session.timestamp || 0) > SESSION_TTL) { if (!cancelled) setState('expired'); return; }

        const r = await fetch('/api/wallet/create-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, signal_id: signalId, userToken: session.userToken }),
        });
        const d = await r.json();

        if (!r.ok) {
          if (d.error?.includes('Insufficient') || d.error?.includes('indexed')) {
            if (!cancelled) { setErrMsg(d.error); setWalletAddr(d.walletAddress || ''); setState('insufficient'); }
          } else if (!cancelled) {
            setState('expired');
          }
          return;
        }

        if (!cancelled) {
          challengeRef.current = { challengeId: d.challengeId, userToken: session.userToken, encryptionKey: session.encryptionKey };
          setBalance(d.balance || '');
          setState('ready');
        }
      } catch (e) {
        if (!cancelled) { setErrMsg(e.message || 'Failed to prepare payment'); setState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [email, signalId]);

  function handlePin() {
    const { challengeId, userToken, encryptionKey } = challengeRef.current;
    const s = getSdk();
    if (appId) s.setAppSettings({ appId });
    s.setAuthentication({ userToken, encryptionKey });
    setState('executing');

    s.execute(challengeId, async (err) => {
      if (err) {
        setErrMsg(err.message || 'PIN cancelled or incorrect — try again');
        setState('ready');
        return;
      }
      try {
        const walletAddress = localStorage.getItem('ac_wallet') || '';
        const r = await fetch('/api/unlock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal_id: signalId, wallet_address: walletAddress, tx_hash: `circle_${Date.now()}` }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setState('success');
        setTimeout(() => { onSuccess?.(d.signal); onClose?.(); }, 1400);
      } catch (ue) {
        setErrMsg(ue.message || 'Unlock recording failed');
        setState('error');
      }
    });
  }

  const blockClose = state === 'executing';

  return (
    <div onClick={blockClose ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>⏳</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Preparing payment…</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Checking your USDC balance…</p>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🔑</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
              Pay <span style={{ color: 'var(--gold)' }}>$0.05 USDC</span> to unlock
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.65, marginBottom: 8 }}>
              Your balance: <strong style={{ color: 'var(--gold)' }}>{balance} USDC</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', lineHeight: 1.6, marginBottom: 22 }}>
              Click the button below — a Circle PIN prompt will appear. Enter your 6-digit PIN to authorise the $0.05 USDC transfer.
            </p>
            {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, textAlign: 'center' }}>{errMsg}</p>}
            <button onClick={handlePin} style={BTN(true)}>
              <span>🔒</span> Enter PIN & Pay $0.05 →
            </button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
          </>
        )}

        {state === 'executing' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Enter your 6-digit PIN</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>
              A Circle PIN dialog has appeared. Enter your 6-digit PIN to authorise the $0.05 USDC payment.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Waiting for PIN confirmation…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {state === 'insufficient' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>
              Insufficient USDC
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.65 }}>
              You need at least $0.05 USDC in your <strong style={{ color: 'var(--white)' }}>Circle wallet</strong>.
              Send testnet USDC to this address from the faucet:
            </p>
            {walletAddr && (
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)', wordBreak: 'break-all', background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
                {walletAddr}
              </div>
            )}
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer"
              style={{ display: 'block', ...BTN(true), textDecoration: 'none', marginBottom: 10 }}>
              Go to Circle Faucet →
            </a>
            <button onClick={onClose} style={{ ...BTN(false) }}>Cancel</button>
          </div>
        )}

        {state === 'expired' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Session expired</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Your Circle session has expired. Reconnect with your email to restore access.
            </p>
            <button onClick={() => { onClose?.(); onReconnect?.(); }} style={BTN(true)}>Reconnect Wallet →</button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>Cancel</button>
          </div>
        )}

        {state === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--gold)' }}>✓</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--gold)' }}>Signal Unlocked!</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>$0.05 USDC paid. Enjoy the alpha.</p>
          </div>
        )}

        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>Payment failed</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
            <button onClick={onClose} style={BTN(false)}>Close</button>
          </div>
        )}

      </div>
    </div>
  );
}
