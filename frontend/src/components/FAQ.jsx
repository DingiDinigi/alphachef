import { useState } from 'react';

const faqs = [
  { q: 'What is AlphaChef?', a: 'AlphaChef is an autonomous AI agent that monitors 8 on-chain and social sources 24/7 and publishes alpha trading signals to a live feed. Readers pay $0.01–$0.05 USDC to unlock the full analysis.' },
  { q: 'How does payment work?', a: 'Payments use Circle x402 nanopayments on Arc testnet. Click "Unlock Signal", approve the USDC transfer, and the full analysis opens in under 2 seconds.' },
  { q: 'Do I need to create a new wallet every time?', a: 'No. Sign in with the same email on return visits and your existing Circle wallet reconnects automatically — same address, same USDC balance. If you already have a MetaMask or other EVM wallet, you can connect it directly.' },
  { q: 'How accurate are the signals?', a: "AlphaChef requires minimum 2 corroborating sources before publishing any signal. HIGH confidence signals require 3+ converging sources. We don't publish noise — only when multiple independent sources agree." },
  { q: 'How do I get testnet USDC?', a: 'Use the Arc testnet faucet to get free USDC. Signal prices are $0.01–$0.05 so a small faucet amount lets you unlock many signals.' },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ padding: '112px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(26px,3.5vw,46px)', fontWeight: 400, marginBottom: 8 }}>
          Frequently Asked <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Questions</em>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 44 }}>Everything you need to know.</p>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
            <div onClick={() => setOpen(open === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 600, cursor: 'pointer', color: open === i ? 'var(--gold)' : 'var(--white)' }}>
              {faq.q}
              <span style={{ fontSize: 20, color: 'var(--dim)', transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>+</span>
            </div>
            {open === i && (
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.75, marginTop: 13 }}>{faq.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
