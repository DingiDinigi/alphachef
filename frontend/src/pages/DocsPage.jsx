import Nav from '../components/Nav';
import Footer from '../components/Footer';

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ padding: '48px 0', borderBottom: '1px solid var(--border)' }}>
      <h2 style={{
        fontFamily: '"Playfair Display", serif', fontSize: 28, fontWeight: 400,
        color: 'var(--white)', marginBottom: 20,
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.85 }}>
        {children}
      </div>
    </section>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--card-border)',
      borderRadius: 12, padding: '20px 24px', margin: '16px 0',
    }}>
      {children}
    </div>
  );
}

function Endpoint({ method, path, desc }) {
  const methodColor = { GET: 'var(--green)', POST: 'var(--gold)' }[method] || 'var(--muted)';
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'baseline', padding: '10px 0',
      borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 800,
        color: methodColor, minWidth: 42,
      }}>
        {method}
      </span>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'var(--white)' }}>
        {path}
      </span>
      <span style={{ fontSize: 13, color: 'var(--dim)' }}>{desc}</span>
    </div>
  );
}

export default function DocsPage({ wallet, balanceUsdc, onWalletOpen, onDisconnect }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Nav onWalletOpen={onWalletOpen} onDisconnect={onDisconnect} wallet={wallet} balanceUsdc={balanceUsdc} />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '130px 24px 80px' }}>
        <div style={{ marginBottom: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
            color: 'var(--gold)',
          }}>
            Documentation
          </span>
        </div>
        <h1 style={{
          fontFamily: '"Playfair Display", serif', fontSize: 'clamp(34px,5vw,52px)',
          fontWeight: 400, color: 'var(--white)', marginBottom: 16, lineHeight: 1.1,
        }}>
          How <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>AlphaChef</em> works.
        </h1>
        <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 8 }}>
          A plain-language walkthrough of the agent, the pricing, the wallet flow, and the public API — for readers, builders, and judges.
        </p>

        <Section id="overview" title="Overview">
          <p style={{ marginBottom: 16 }}>
            AlphaChef is an autonomous on-chain signal intelligence platform. An AI agent monitors 8 on-chain and social sources around the clock, cross-references what it finds, and — when at least two sources genuinely agree on the same token — writes a full analysis and publishes it to a live feed.
          </p>
          <p>
            Readers pay a small amount of USDC (between $0.01 and $0.05, based on confidence) to unlock the full report. Every payment settles on Arc testnet through Circle's x402 nanopayment rails, and every unlock is recorded on-chain — so any claim the agent makes is independently checkable, not just text on a page.
          </p>
        </Section>

        <Section id="agent" title="The Agent">
          <p style={{ marginBottom: 16 }}>
            Every 30 minutes, the agent checks 8 sources for notable activity:
          </p>
          <Card>
            <ul style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
              <li>Smart Money Wallet Tracker — known wallet activity on Arc testnet</li>
              <li>Token Accumulation Detector — unusual DEX buy pressure</li>
              <li>Liquidity Event Monitor — new pools with significant initial liquidity</li>
              <li>Bridge Activity Scanner — large USDC bridging into Arc</li>
              <li>Funding Rate Anomaly Detector — extreme perpetual funding rates</li>
              <li>Social Momentum Tracker — spikes in on-topic mentions</li>
              <li>GitHub Commit Activity — dormant repos suddenly shipping</li>
              <li>Exchange Flow Monitor — large deposits or withdrawals from major exchanges</li>
            </ul>
          </Card>
          <p style={{ marginTop: 16, marginBottom: 16 }}>
            A signal only gets published when at least <strong style={{ color: 'var(--white)' }}>2 independent sources genuinely agree on the same token</strong> in the same window — the agent does not publish on a single source alone, and it does not treat two unrelated tokens as "convergence" just because they both fired in the same cycle.
          </p>
          <p>
            To avoid repeating itself, a token that was recently covered won't be re-published again within a few hours unless the new read is a genuine escalation in confidence — for example, moving from Medium to High conviction because a third source has now confirmed it.
          </p>
        </Section>

        <Section id="confidence" title="Confidence Tiers &amp; Pricing">
          <Card>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong style={{ color: 'var(--white)' }}>LOW</strong> — 2 corroborating sources</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--gold)' }}>$0.01 USDC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong style={{ color: 'var(--white)' }}>MEDIUM</strong> — 2 sources, elevated strength</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--gold)' }}>$0.03 USDC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong style={{ color: 'var(--white)' }}>HIGH</strong> — 3+ sources, strength above threshold</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--gold)' }}>$0.05 USDC</span>
              </div>
            </div>
          </Card>
          <p style={{ marginTop: 16 }}>
            Signal quality over volume is the whole design philosophy — a thin feed of real convergence is worth more than a busy feed of coincidences.
          </p>
        </Section>

        <Section id="wallet" title="Connecting a Wallet">
          <p style={{ marginBottom: 16 }}>There are two ways to connect:</p>
          <Card>
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 8 }}>Email (recommended)</p>
            <p>
              Enter your email, verify a one-time code, and AlphaChef creates a Circle Developer-Controlled Wallet on Arc testnet for you automatically — no seed phrase, no browser extension. You'll set a spend password used to authorize unlocks.
            </p>
          </Card>
          <Card>
            <p style={{ color: 'var(--white)', fontWeight: 600, marginBottom: 8 }}>MetaMask / Rabby</p>
            <p>
              Connect an existing wallet directly. Unlocking a signal this way works by signing a message to prove ownership, rather than the password flow used for email wallets.
            </p>
          </Card>
          <p>
            Either way, fund your wallet with free testnet USDC from the{' '}
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
              Circle faucet
            </a>{' '}
            (select the Arc network) before unlocking a signal.
          </p>
        </Section>

        <Section id="unlocking" title="Unlocking a Signal">
          <p style={{ marginBottom: 16 }}>
            Click "Unlock Agent Analysis" on any signal card. If you connected by email, enter your spend password — the transfer is signed server-side using your wallet's registered credentials, so there's no separate wallet pop-up to approve. If you connected MetaMask or Rabby, you'll sign a short message instead.
          </p>
          <p>
            Either path settles in well under a second and is recorded permanently — see "On-Chain Verification" below.
          </p>
        </Section>

        <Section id="report" title="Reading a Report">
          <p style={{ marginBottom: 16 }}>Once unlocked, a report is broken into a few parts:</p>
          <Card>
            <ul style={{ paddingLeft: 20, display: 'grid', gap: 10 }}>
              <li><strong style={{ color: 'var(--white)' }}>Full Analysis</strong> — what happened and why it matters, broken into short sections. Simple signals get a short report; major multi-source convergences get a longer one.</li>
              <li><strong style={{ color: 'var(--white)' }}>Agent Reasoning</strong> — for each source involved, why it moves conviction up or down, not just a restatement of the raw data.</li>
              <li><strong style={{ color: 'var(--white)' }}>AI Verdict</strong> — a closing conviction call (High / Moderate / Low) with the reasoning behind that specific level. This is a read on signal quality, not a price prediction.</li>
              <li><strong style={{ color: 'var(--white)' }}>On-Chain Proof</strong> — the actual transaction hash and contract address behind the unlock.</li>
            </ul>
          </Card>
        </Section>

        <Section id="onchain" title="On-Chain Verification">
          <p style={{ marginBottom: 16 }}>
            Every signal unlock is a real transaction on Arc testnet. You can independently verify any of them:
          </p>
          <Card>
            <div style={{ display: 'grid', gap: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 13 }}>
              <div>Contract: 0x722e0b499FedCE47a90Df7837405003B203dF417</div>
              <div>Network: Arc Testnet (Chain ID: 5042002)</div>
              <div>
                Explorer:{' '}
                <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>
                  testnet.arcscan.app
                </a>
              </div>
            </div>
          </Card>
        </Section>

        <Section id="api" title="Public API">
          <p style={{ marginBottom: 16 }}>
            The signal feed is readable without authentication. Full content (analysis, reasoning, verdict) is only returned once a wallet address has unlocked that specific signal.
          </p>
          <Card>
            <Endpoint method="GET" path="/api/signals" desc="Most recent signals (teaser view, or full view with ?wallet=0x...)" />
            <Endpoint method="GET" path="/api/signals/:id" desc="A single signal by ID" />
            <Endpoint method="GET" path="/api/stats" desc="Platform-wide stats — total signals, unlocks, revenue" />
          </Card>
        </Section>

        <Section id="stack" title="Built With">
          <Card>
            <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <div>React 19 + Vite — frontend</div>
              <div>Node.js + Express + SQLite — backend</div>
              <div>Groq (Llama 3.3 70B) — signal analysis</div>
              <div>Circle Developer-Controlled Wallets + x402 — payments</div>
              <div>ethers.js v6 — on-chain reads and writes</div>
              <div>Arc Testnet — settlement layer</div>
            </div>
          </Card>
        </Section>

        <div style={{ padding: '48px 0 0', color: 'var(--dim)', fontSize: 13, fontStyle: 'italic' }}>
          Built for the Lepton Hackathon — Circle × Canteen.
        </div>
      </div>

      <Footer />
    </div>
  );
}
