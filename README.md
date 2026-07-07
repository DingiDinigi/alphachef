# AlphaChef

> **Built for Lepton Hackathon — Circle × Canteen**

**The autonomous on-chain alpha signal platform where AI chefs cook signals 24/7 and you pay USDC to eat.**

[![Live](https://img.shields.io/badge/LIVE-alphachef.site-c9a227?style=for-the-badge)](https://alphachef.site)
[![Circle DCW](https://img.shields.io/badge/Circle-Developer--Controlled_Wallets-blue?style=for-the-badge)](https://developers.circle.com)
[![ARC Testnet](https://img.shields.io/badge/Network-ARC--TESTNET-c9a227?style=for-the-badge)](https://testnet.arcscan.app)
[![GitHub](https://img.shields.io/badge/GitHub-DingiDinigi%2Falphachef-white?style=for-the-badge&logo=github)](https://github.com/DingiDinigi/alphachef)

---

## Live Demo

**[https://alphachef.site](https://alphachef.site)**

Signals are already cooking. Connect your wallet with email OTP, fund it with test USDC from the Circle faucet (select ARC network), and pay to unlock full analysis.

---

## Why AlphaChef Wins

| Criteria | AlphaChef |
|----------|-------------|
| **Circle Developer-Controlled Wallets** | Real USDC transfers on ARC-TESTNET — backend signs via entity secret, instant settlement |
| **Circle email OTP onboarding** | Email → ARC-TESTNET wallet in seconds, no seed phrase, no MetaMask |
| **Frictionless payments** | No approval modal — spend password verifies intent, transfer executes server-side |
| **Real-time on-chain data** | 8 autonomous signal sources, 30-min loop |
| **Autonomous AI agent** | Groq LLM (llama-3.3-70b) writes plain-English analysis 24/7 |
| **Actual working demo** | Enter password → USDC debited → signal unlocked in < 2s |
| **Business model** | Signals priced $0.01–$0.05 USDC by confidence tier |
| **Production design** | Premium dark theme, animated 3D globe, gold glow effects |

---

## Architecture

```
                        alphachef.site (nginx)
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐
  │   Frontend   │   │  wallet-server   │   │  main backend   │
  │  React+Vite  │   │   port 3015      │   │   port 3012     │
  │  (dist/)     │   │  /api/wallet/*   │   │  /api/*  /ws    │
  └──────────────┘   └──────────────────┘   └─────────────────┘
          │                    │                    │
          └────────────────────┴────────────────────┘
                               │
                    ┌──────────────────┐
                    │   SQLite DB      │
                    │ alphachef.db     │
                    │ (shared by both) │
                    └──────────────────┘
```

**nginx routing** (`nginx.conf`):
- `/api/wallet` → `localhost:3015` (wallet microservice — longer prefix wins)
- `/api` → `localhost:3012` (main backend)
- `/ws` → `localhost:3011` (WebSocket)
- `/` → `frontend/dist` (static files)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite |
| Animations | Canvas 2D (3D wireframe globe with depth shading + gold glow) |
| Backend | Node.js, Express, SQLite (better-sqlite3), WebSocket |
| Wallet server | Node.js, Express — Circle UCW (email OTP) + Circle DCW (wallet creation + transfers) |
| Agent | Node.js cron, Groq SDK (llama-3.3-70b) |
| Payments | Circle Developer-Controlled Wallets, USDC on ARC-TESTNET |
| Fonts | Playfair Display + Inter + JetBrains Mono |
| Process manager | PM2 |
| Reverse proxy | nginx |

---

## Circle Wallet Flow

### Connect (new user)

```
1. User enters email in WalletModal
2. wallet-server calls createDeviceTokenForEmailLogin (Circle UCW)
   → returns deviceToken + OTP challengeId
3. Circle SDK shows OTP iframe — user enters code from email
4. On OTP success: wallet-server calls:
     devClient.createWalletSet({ name: email })
     devClient.createWallets({ blockchains: ['ARC-TESTNET'], count: 1, accountType: 'EOA' })
5. ARC-TESTNET wallet address stored in DB (arc_wallet_id, arc_wallet_address)
6. User prompted to set a spend password (pbkdf2-hashed in DB)
7. User funds wallet via https://faucet.circle.com/ (select ARC network)
```

### Unlock a signal (paying with USDC)

```
1. User clicks "Unlock Signal" — PasswordUnlockModal opens
2. User enters their spend password
3. POST /api/wallet/prepare-unlock:
   - Verifies spend password against pbkdf2 hash in DB
   - Calls devClient.getWalletTokenBalance to find USDC tokenId on ARC-TESTNET
   - Calls devClient.createTransaction({ walletId: arc_wallet_id, tokenId, amount, ... })
     → transfer signed server-side via entity secret — no user approval modal
   - Records unlock in DB immediately (tx_hash: "dcw:{transactionId}")
   - Returns { alreadyUnlocked: true }
4. Frontend shows the unlocked signal content
```

The entity secret signs transfers entirely server-side. The spend password is the user's consent mechanism — no Circle SDK `execute()` call during unlock.

---

## Signal Unlock Paths

| Path | Trigger | How |
|------|---------|-----|
| **A (primary)** | Circle DCW | `prepare-unlock` submits transfer + records unlock server-side |
| **B (legacy)** | MetaMask/Rabby | `message` + `tx_hash` signature verification via `/api/unlock` |

---

## Autonomous Agent

The agent runs every 30 minutes and monitors:

| # | Source | What It Detects |
|---|--------|-----------------|
| 1 | Smart Money Wallets | Known whale address movements |
| 2 | Token Accumulation | DEX buy pressure anomalies (>80% buy ratio) |
| 3 | Liquidity Events | New pools with >$100K initial liquidity |
| 4 | Bridge Activity | Large USDC bridging |
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

## API Reference

### Main backend (`/api/*` → port 3012)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/signals` | GET | All signals (teaser only unless `?wallet=0x...`) |
| `/api/signals/:id` | GET | Full signal if `?wallet=0x...` has unlocked |
| `/api/unlock` | POST | Record MetaMask unlock (legacy path B) |
| `/api/stats` | GET | Platform statistics (signals, unlocks, revenue) |
| `/api/logs` | POST | Agent log ingestion (agent-secret required) |

WebSocket: `ws://alphachef.site/ws` — real-time push on `new_signal` and `signal_unlocked` events.

### Wallet microservice (`/api/wallet/*` → port 3015)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/config` | GET | Returns Circle App ID for frontend SDK init |
| `/api/wallet/init` | POST | Start email OTP — returns deviceToken + challengeId |
| `/api/wallet/confirm` | POST | After OTP: create DCW ARC-TESTNET wallet, return address |
| `/api/wallet/set-password` | POST | Set spend password (stored as pbkdf2 hash) |
| `/api/wallet/verify-password` | POST | Verify spend password |
| `/api/wallet/prepare-unlock` | POST | Verify password + submit DCW transfer + record unlock |
| `/api/wallet/balance` | GET | Live USDC balance via Circle DCW token balance API |
| `/api/wallet/refresh` | POST | No-op (returns refreshFailed for email-auth users) |

---

## On-Chain Proof

Every signal unlock is recorded on ARC-TESTNET. Judges can verify any transaction at:

**[https://testnet.arcscan.app](https://testnet.arcscan.app)** (Blockscout)

- Transaction: `https://testnet.arcscan.app/tx/{txHash}`
- Contract: `https://testnet.arcscan.app/address/0x722e0b499FedCE47a90Df7837405003B203dF417`

The signal detail page shows the full transaction hash and a "View on Arc Explorer →" button.

---

## Setup

### Prerequisites

- Node.js 18+
- PM2: `npm install -g pm2`
- nginx
- Circle developer account (API key + App ID + registered entity secret)

### Environment

```bash
cp .env.example .env
```

Required variables:

```env
CIRCLE_API_KEY=...
CIRCLE_APP_ID=...               # from Circle developer console
CIRCLE_ENTITY_SECRET=...        # entity secret registered with Circle for DCW
GROQ_API_KEY=...
PLATFORM_WALLET=0x...           # receives USDC from signal unlocks
CONTRACT_ADDRESS=0x722e0b499FedCE47a90Df7837405003B203dF417
AGENT_SECRET=your-secret-here
ARC_RPC_URL=...                 # Arc testnet RPC URL
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

Also set in `frontend/.env`:

```env
VITE_CIRCLE_APP_ID=...
```

### Install & build

```bash
npm run install:all
cd frontend && npm run build
```

### Start services with PM2

```bash
pm2 start backend/wallet-server.js --name alphachef-wallet
PORT=3012 pm2 start backend/server.js --name alphachef-backend
pm2 save && pm2 startup
```

### nginx

```bash
sudo cp nginx.conf /etc/nginx/sites-available/alphachef
sudo nginx -t
sudo systemctl reload nginx
```

### Rebuild frontend (after source changes)

```bash
cd frontend && npm run build
sudo systemctl reload nginx
```

---

## PM2 Processes

| Name | File | Port |
|------|------|------|
| `alphachef-wallet` | `backend/wallet-server.js` | 3015 |
| `alphachef-backend` | `backend/server.js` | 3012 |
| `alphachef-agent` | `backend/agent.js` | — |

---

## Database

Single SQLite file at `backend/alphachef.db`, shared by both servers.

| Table | Purpose |
|-------|---------|
| `signals` | Published alpha signals |
| `unlocks` | Payment records — `tx_hash` prefixed `dcw:` for developer-controlled transfers |
| `wallet_users` | Circle user accounts (email, arc_wallet_id, arc_wallet_address, arc_wallet_set_id, password_hash) |
| `agent_logs` | Agent activity log |

---

## Business Model

AlphaChef is a fully autonomous signal business. The AI agent publishes all signals. All USDC payments flow to the platform wallet.

| Revenue Stream | Rate |
|---------------|------|
| Signal unlock fees | $0.01–$0.05 USDC per signal |
| Platform fee (Phase 2) | 10% of each payment |
| Agent earnings | 100% to platform wallet at launch |

In phase 4 of the roadmap, Alpha callers can publish their own signals on the AlphaChef platform and earn 90% revenue while 10% goes to the platform.

---

*Built for Lepton Hackathon 2026 — Circle × Canteen*
