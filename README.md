# AlphaChef 🍳

> **Built for Lepton Hackathon — Circle × Canteen**

**The autonomous on-chain alpha signal platform where AI chefs cook signals 24/7 and you pay $0.01 USDC to eat.**

[![Live](https://img.shields.io/badge/LIVE-alphachef.site-c9a227?style=for-the-badge)](https://alphachef.site)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-4ade80?style=for-the-badge)](https://rpc.testnet.arc.fun)
[![Circle x402](https://img.shields.io/badge/Circle-x402-blue?style=for-the-badge)](https://developers.circle.com)
[![GitHub](https://img.shields.io/badge/GitHub-DingiDingi%2Falphachef-white?style=for-the-badge&logo=github)](https://github.com/DingiDingi/alphachef)

---

## 🔴 Live Demo

**[https://alphachef.site](https://alphachef.site)**

Visit the live app. Signals are already cooking. Connect your wallet and pay $0.01 USDC to unlock full analysis.

---

## Why AlphaChef Wins

| Criteria | ✅ AlphaChef |
|----------|-------------|
| **Circle x402 nanopayments** | $0.01–$0.05 USDC per signal via x402 on Arc |
| **Arc testnet deployment** | Smart contract live on Arc (Chain ID: 5042002) |
| **Real-time on-chain data** | 8 autonomous signal sources, 5-min loop |
| **Circle wallet onboarding** | Google/Email → Arc wallet in 10 seconds |
| **Actual working demo** | Pay → unlock → on-chain proof in < 2s |
| **Business model** | 10% platform fee, signals priced by confidence |
| **Autonomous AI agent** | Groq LLM writes plain-English analysis 24/7 |
| **Production design** | Full dark theme, animated globe, wavy cards |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        alphachef.site                           │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend   │    │     Backend      │    │  Autonomous     │
│  React+Vite  │◄──►│  Express+SQLite  │◄───│     Agent       │
│   Port 5173  │    │   Port 3009      │    │   node-cron     │
│              │    │   WebSocket      │    │   Groq AI       │
└──────────────┘    └──────────────────┘    └────────┬────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Circle x402  │    │   AlphaChef.sol  │    │  8 Signal       │
│ Nanopayments │    │   Arc Testnet    │    │  Sources        │
│ USDC unlock  │    │   Chain 5042002  │    │  Smart Money    │
└──────────────┘    └──────────────────┘    │  Bridge Flows   │
                                            │  Funding Rates  │
                                            │  Social/GitHub  │
                                            └─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TailwindCSS |
| Animations | Canvas 2D (wireframe globe + wavy lines) |
| Backend | Node.js, Express, SQLite, WebSocket |
| Agent | Node.js cron, Groq SDK (llama-3.3-70b) |
| Smart Contract | Solidity 0.8.24, Hardhat, Arc testnet |
| Payments | Circle x402 nanopayments, USDC |
| Chain | Arc Testnet (Chain ID: 5042002) |
| Fonts | Playfair Display + Inter + JetBrains Mono |

---

## Smart Contract

**AlphaChef.sol** — deployed on Arc Testnet

```
Contract: CONTRACT_ADDRESS_HERE
Network: Arc Testnet
Chain ID: 5042002
RPC: https://rpc.testnet.arc.fun
Explorer: https://explorer.testnet.arc.fun
```

**Key Functions:**
- `registerSignal(signalId, priceUsdc)` — agent registers new signal
- `unlockSignal(signalId)` — reader pays USDC, access recorded on-chain
- `platformFee` — 10% of each payment to platform wallet

**On-Chain Verification:**
- Signal registry: `signalRegistry[id]` → price, totalUnlocks, totalRevenue
- Payment history: `hasUnlocked[signalId][address]` → bool
- Events: `SignalRegistered`, `SignalUnlocked`

---

## Autonomous Agent

The agent runs every 5 minutes and monitors:

| # | Source | What It Detects |
|---|--------|-----------------|
| 1 | Smart Money Wallets | Known whale address movements via Arc RPC |
| 2 | Token Accumulation | DEX buy pressure anomalies (>80% buy ratio) |
| 3 | Liquidity Events | New pools with >$100K initial liquidity |
| 4 | Bridge Activity | Large USDC bridging into Arc |
| 5 | Funding Rate Anomalies | Extreme perp funding (>5% annualized) |
| 6 | Social Momentum | X/Twitter keyword spike detection |
| 7 | GitHub Activity | Dormant repos with sudden commit bursts |
| 8 | Exchange Flows | Large deposits/withdrawals from exchanges |

**Signal Logic:**
- Minimum 2 corroborating sources required to publish
- Confidence: HIGH (3+ sources, strength ≥6) / MEDIUM / LOW
- Price: HIGH=$0.05, MEDIUM=$0.03, LOW=$0.01
- AI writes plain-English analysis via Groq (llama-3.3-70b)

---

## Agent Activity Log

```
[INFO] ⚡ Agent connected to Arc testnet
[INFO] 🍳 AlphaChef agent loop starting...
[INFO] Found 5 raw signals
[INFO] Publishing HIGH signal from 3 sources — $0.05 USDC
[INFO] ✅ Published signal: EIGEN — Smart Money + Accumulation + GitHub Converge [HIGH] $0.05 USDC
[INFO] Signal registered on-chain: 0x4f8a...
```

---

## Payment Flow

```
1. Reader visits alphachef.site
2. Sees signal card with title + teaser (locked)
3. Clicks "Unlock Signal — $0.05"
4. Wallet modal opens (Google / Email / MetaMask)
5. Circle x402 payment: USDC transfer approved
6. Backend verifies tx on Arc testnet
7. Full analysis unlocks + detail page opens
8. On-chain proof displayed (tx hash, block, timing)
```

---

## Business Model

| Revenue Stream | Rate |
|---------------|------|
| Signal unlock fees | $0.01–$0.05 USDC per signal |
| Platform fee | 10% of each payment |
| Creator share | 90% to platform wallet |

**Unit Economics (at scale):**
- 1,000 daily active readers × avg 3 signals/day × $0.03 avg = $90/day
- Platform keeps 10% = $9/day → $3,285/year with zero ongoing costs

---

## Setup

```bash
# Clone
git clone https://github.com/DingiDingi/alphachef.git
cd alphachef

# Environment
cp .env.example .env
# Fill in: GROQ_API_KEY, PRIVATE_KEY, PLATFORM_WALLET

# Install all
npm run install:all

# Deploy contract (optional)
cd contracts && npx hardhat run scripts/deploy.js --network arc
# Copy CONTRACT_ADDRESS to .env

# Start everything
npm run dev
```

**Ports:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3009

---

## Wallet Connection

Three options built into the modal:
1. **Continue with Google** — Circle creates Arc wallet automatically
2. **Continue with Email** — Circle creates Arc wallet automatically
3. **Connect Existing Wallet** — MetaMask/WalletConnect

Returning users reconnect with same email → same wallet, same USDC balance.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/signals` | GET | All signals (teaser only) |
| `/api/signals?wallet=0x...` | GET | With unlock status |
| `/api/signals/:id` | GET | Full signal if unlocked |
| `/api/unlock` | POST | Verify payment, unlock signal |
| `/api/stats` | GET | Platform statistics |

WebSocket: `ws://localhost:3009` — real-time signal push

---

*Built with ❤️ for Lepton Hackathon 2026 — Circle × Canteen*
