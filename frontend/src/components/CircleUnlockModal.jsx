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
  color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
});

let _sdk = null;
function sdk() { if (!_sdk) _sdk = new W3SSdk(); return _sdk; }

const SESSION_TTL = 24 * 60 * 60 * 1000;

function safeParseSession() {
  try { return JSON.parse(localStorage.getItem('circle_session') || 'null'); } catch { return null; }
}

export default function CircleUnlockModal({ email, signalId, appId, onSuccess, onClose, onReconnect }) {
  const [state, setState] = useState('loading'); // loading | ready | executing | success | error | expired
  const [errMsg, setErrMsg] = useState('');
  const challengeRef = useRef({ challengeId: '', userToken: '', encryptionKey: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = safeParseSession();
        if (!session?.userToken) {
          if (!cancelled) setState('expired');
          return;
        }
        if (Date.now() - (session.timestamp || 0) > SESSION_TTL) {
          if (!cancelled) setState('expired');
          return;
        }
        const r = await fetch('/api/wallet/unlock-challenge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, signal_id: signalId, userToken: session.userToken }),
        });
        const d = await r.json();
        if (!r.ok) {
          // If Circle rejects the token it's also effectively expired
          if (!cancelled) { setState('expired'); }
          return;
        }
        if (!cancelled) {
          challengeRef.current = { challengeId: d.challengeId, userToken: session.userToken, encryptionKey: session.encryptionKey };
          setState('ready');
        }
      } catch (e) {
        if (!cancelled) { setErrMsg(e.message || 'Failed to prepare unlock'); setState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [email, signalId]);

  function handlePin() {
    const { challengeId, userToken, encryptionKey } = challengeRef.current;
    const s = sdk();
    if (appId) s.setAppSettings({ appId });
    s.setAuthentication({ userToken, encryptionKey });
    setState('executing');

    s.execute(challengeId, async (err) => {
      if (err) {
        setErrMsg(err.message || 'PIN cancelled or incorrect');
        setState('ready');
        return;
      }
      // PIN confirmed — call the unlock endpoint
      try {
        const walletAddress = localStorage.getItem('ac_wallet') || '';
        const r = await fetch('/api/unlock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal_id: signalId, wallet_address: walletAddress, tx_hash: `circle_${Date.now()}` }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setState('success');
        setTimeout(() => { onSuccess?.(); onClose?.(); }, 1200);
      } catch (ue) {
        setErrMsg(ue.message || 'Unlock failed');
        setState('error');
      }
    });
  }

  return (
    <div onClick={state === 'executing' ? undefined : onClose} style={OVERLAY}>
      <div onClick={e => e.stopPropagation()} style={MODAL}>

        {state === 'loading' && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔒</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Preparing unlock…</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Generating PIN challenge from Circle…</p>
          </div>
        </>)}

        {state === 'ready' && (<>
          <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🔑</div>
          <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, textAlign: 'center' }}>
            Unlock for <span style={{ color: 'var(--gold)' }}>$0.05 USDC</span>
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.65, marginBottom: 24 }}>
            Enter your 6-digit Circle PIN to authorise the payment. This deducts $0.05 USDC from your Circle wallet on Arc testnet.
          </p>
          {errMsg && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14, textAlign: 'center' }}>{errMsg}</p>}
          <button onClick={handlePin} style={BTN(true)}>Enter PIN &amp; Unlock →</button>
          <button onClick={onClose} style={{ ...BTN(false), marginTop: 10 }}>Cancel</button>
        </>)}

        {state === 'executing' && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>🔑</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Enter your PIN</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>Complete the Circle PIN prompt to authorise the payment.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--dim)', fontSize: 13 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Waiting for Circle prompt…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </>)}

        {state === 'success' && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--gold)' }}>Signal Unlocked!</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Payment confirmed. Enjoy the alpha.</p>
          </div>
        </>)}

        {state === 'expired' && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10 }}>Session expired</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.65 }}>
              Your Circle session has expired. Reconnect with your email and PIN to continue.
            </p>
            <button onClick={() => { onClose?.(); onReconnect?.(); }} style={BTN(true)}>Reconnect Wallet →</button>
            <button onClick={onClose} style={{ ...BTN(false), marginTop: 10, justifyContent: 'center' }}>Cancel</button>
          </div>
        </>)}

        {state === 'error' && (<>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: 20, fontWeight: 400, marginBottom: 10, color: '#ff6b6b' }}>Unlock failed</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>{errMsg}</p>
            <button onClick={onClose} style={BTN(false)}>Close</button>
          </div>
        </>)}

      </div>
    </div>
  );
}
