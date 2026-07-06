# AlphaChef

> **Built for Lepton Hackathon — Circle × Canteen**

**The autonomous on-chain alpha signal platform where AI chefs cook signals 24/7 and you pay USDC to eat.**

[![Live](https://img.shields.io/badge/LIVE-alphachef.site-c9a227?style=for-the-badge)](https://alphachef.site)
[![Circle UCW](https://img.shields.io/badge/Circle-UCW-blue?style=for-the-badge)](https://developers.circle.com)
[![ETH Sepolia](https://img.shields.io/badge/Network-ETH--SEPOLIA-627eea?style=for-the-badge)](https://sepolia.etherscan.io)
[![GitHub](https://img.shields.io/badge/GitHub-DingiDinigi%2Falphachef-white?style=for-the-badge&logo=github)](https://github.com/DingiDinigi/alphachef)

---

## Live Demo

**[https://alphachef.site](https://alphachef.site)**

Signals are already cooking. Connect your Circle wallet with email OTP, get test USDC from the Circle faucet, and pay to unlock full analysis.

---

## Why AlphaChef Wins

| Criteria | AlphaChef |
|----------|-------------|
| **Circle UCW nanopayments** | Real USDC transfers via Circle User Controlled Wallets — SDK approval required |
| **Circle email OTP onboarding** | Email → Circle wallet in seconds, no seed phrase |
| **Correct transfer approval flow** | `sdk.execute(challengeId)` → user approves in Circle iframe → transfer executes |
| **Real-time on-chain data** | 8 autonomous signal sources, 5-min loop |
| **Autonomous AI agent** | Groq LLM writes plain-English analysis 24/7 |
| **Actual working demo** | Pay → approve in Circle → unlock in < 5s |
| **Business model** | Signals priced $0.01–$0.05 USDC by confidence |
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
| Frontend | React 19, Vite, TailwindCSS |
| Animations | Canvas 2D (3D wireframe globe with depth shading + gold glow) |
| Backend | Node.js, Express, SQLite (better-sqlite3), WebSocket |
| Wallet server | Node.js, Express — Circle UCW SDK server-side |
| Agent | Node.js cron, Groq SDK (llama-3.3-70b) |
| Payments | Circle User Controlled Wallets (UCW), USDC on ETH-SEPOLIA |
| Fonts | Playfair Display + Inter + JetBrains Mono |
| Process manager | PM2 |
| Reverse proxy | nginx |

---

## Circle Wallet Flow

### Connect (new user)
```
1. User enters email in WalletModal
2. Backend (wallet-server) calls createDeviceTokenForEmailLogin
   → returns deviceToken + deviceEncryptionKey
3. Frontend stores {deviceToken, deviceEncryptionKey} in sessionStorage (23h window)
4. SDK shows Circle OTP iframe — user enters code from email
5. On success: backend calls listWallets → stores real circle_wallet_id + wallet_address in DB
6. User sees wallet connected in nav
```

### Unlock a signal (paying with USDC)
```
1. User clicks "Unlock Signal" — PasswordUnlockModal opens
2. User enters spend password
   — frontend reads {deviceToken, deviceEncryptionKey} from sessionStorage
3. POST /api/wallet/prepare-unlock:
   - Verifies spend password against pbkdf2 hash in DB
   - Calls Circle createUserTransactionTransferChallenge → gets challengeId
4. Frontend calls sdk.execute(challengeId)
   → Circle shows transfer approval iframe to user
5. User approves the USDC transfer in Circle
6. SDK callback fires with result
7. POST /api/unlock with {circleConfirmed: true, circleTransferId}
8. Backend records unlock in DB → returns full signal
```

This is the only path that executes a real USDC transfer. The Circle SDK iframe is mandatory.

---

## Signal Unlock Paths

`/api/unlock` supports three paths:

| Path | Trigger | How |
|------|---------|-----|
| **A (primary)** | Circle UCW | `circleConfirmed: true` after `sdk.execute()` |
| **B** | MetaMask/Rabby | `message` + `tx_hash` signature verification |
| **C (blocked)** | Password-only | Returns 400 `SDK_REQUIRED` — Circle transfers require SDK approval |

---

## Autonomous Agent

The agent runs every 5 minutes and monitors:

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
| `/api/unlock` | POST | Record unlock after Circle SDK approval |
| `/api/stats` | GET | Platform statistics (signals, unlocks, revenue) |
| `/api/logs` | POST | Agent log ingestion (agent-secret required) |

WebSocket: `ws://alphachef.site/ws` — real-time push on `new_signal` and `signal_unlocked` events.

### Wallet microservice (`/api/wallet/*` → port 3015)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wallet/init-otp` | POST | Start email OTP — returns deviceToken + deviceEncryptionKey |
| `/api/wallet/confirm-otp` | POST | After OTP: store wallet_address + circle_wallet_id |
| `/api/wallet/set-password` | POST | Set spend password (stored as pbkdf2 hash) |
| `/api/wallet/prepare-unlock` | POST | Verify password + create Circle transfer challenge → challengeId |

---

## Setup

### Prerequisites

- Node.js 18+
- PM2: `npm install -g pm2`
- nginx
- Circle developer account + API key

### Environment

```bash
cp .env.example .env
```

Required variables:

```env
CIRCLE_API_KEY=...
CIRCLE_APP_ID=...              # from Circle developer console
GROQ_API_KEY=...
PLATFORM_WALLET=0x...          # receives USDC from signal unlocks
USDC_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  # ETH-SEPOLIA USDC
AGENT_SECRET=your-secret-here
ARC_RPC_URL=...                # optional: for on-chain balance checks
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
# Wallet microservice on port 3015
pm2 start backend/wallet-server.js --name alphachef-wallet

# Main backend on port 3012
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

---

## Database

Single SQLite file at `backend/alphachef.db`, shared by both servers.

| Table | Purpose |
|-------|---------|
| `signals` | Published alpha signals |
| `unlocks` | Payment records (wallet → signal, tx_hash) |
| `wallet_users` | Circle user accounts (email, circle_user_id, wallet_address, password_hash) |
| `agent_logs` | Agent activity log |

---

## Business Model

AlphaChef is a fully autonomous signal business. The AI agent publishes all signals. All USDC payments go to the platform wallet.

| Revenue Stream | Rate |
|---------------|------|
| Signal unlock fees | $0.01–$0.05 USDC per signal |
| Platform fee (Phase 2) | 10% of each payment |
| Agent earnings | 100% to platform wallet at launch |

---

*Built for Lepton Hackathon 2026 — Circle × Canteen*
