require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { CircleUserControlledWalletsClient } = require('@circle-fin/user-controlled-wallets');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, 'alphachef.db'));

// Recreate wallet_users without NOT NULL on circle_user_id if the old schema has it
{
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_users'").get();
  if (row && /circle_user_id\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(row.sql)) {
    console.log('[wallet-server] Migrating wallet_users: removing NOT NULL from circle_user_id');
    db.exec(`
      CREATE TABLE wallet_users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        circle_user_id TEXT UNIQUE,
        wallet_address TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        circle_wallet_id TEXT,
        circle_blockchain TEXT
      );
      INSERT OR IGNORE INTO wallet_users_new
        SELECT id, email, circle_user_id, wallet_address, created_at, circle_wallet_id, circle_blockchain
        FROM wallet_users;
      DROP TABLE wallet_users;
      ALTER TABLE wallet_users_new RENAME TO wallet_users;
    `);
    console.log('[wallet-server] Migration complete');
  } else if (!row) {
    db.exec(`
      CREATE TABLE wallet_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        circle_user_id TEXT UNIQUE,
        wallet_address TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        circle_wallet_id TEXT,
        circle_blockchain TEXT
      );
    `);
  }
}

// Idempotent column additions for older schemas
for (const col of ['circle_wallet_id TEXT', 'circle_blockchain TEXT']) {
  try { db.exec(`ALTER TABLE wallet_users ADD COLUMN ${col}`); } catch (_) {}
}

const apiKey = process.env.CIRCLE_API_KEY || '';
const appId  = process.env.CIRCLE_APP_ID  || '';
console.log(`[wallet-server] CIRCLE_API_KEY loaded: ${apiKey ? apiKey.slice(0, 8) + '…' : '(empty — check .env)'}`);
console.log(`[wallet-server] CIRCLE_APP_ID loaded: ${appId ? appId.slice(0, 8) + '…' : '(empty — check .env)'}`);

const circleClient = apiKey
  ? new CircleUserControlledWalletsClient({ apiKey })
  : null;

function circleErr(e) {
  const msg = e?.response?.data?.message || e?.message || 'Circle API error';
  const detail = JSON.stringify(e?.response?.data || {});
  return `${msg} | detail: ${detail}`;
}

// ── GET /api/wallet/config ─────────────────────────────────────────────────
app.get('/api/wallet/config', (req, res) => {
  res.json({ appId });
});

// ── POST /api/wallet/init ──────────────────────────────────────────────────
// RETURNING USER: email in DB with wallet_address → return immediately, no OTP.
//                 Pass forceOtp:true to send OTP anyway (session expired case).
// NEW USER:       Send OTP via createDeviceTokenForEmailLogin — requires deviceId.
app.post('/api/wallet/init', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured — check CIRCLE_API_KEY in .env' });
  const { email, deviceId, forceOtp } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  try {
    const existing = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

    // Returning user with a complete wallet — no OTP needed
    if (existing?.wallet_address && !forceOtp) {
      console.log(`[wallet/init] Returning user ${email} — skipping OTP`);
      return res.json({ isReturning: true, walletAddress: existing.wallet_address });
    }

    // New user or forced re-auth — deviceId required to send OTP
    if (!deviceId) return res.status(400).json({ error: 'deviceId required', needsOtp: true });

    console.log(`[wallet/init] Sending OTP to ${email} (forceOtp=${!!forceOtp})`);
    const deviceResp = await circleClient.createDeviceTokenForEmailLogin({
      deviceId, email, idempotencyKey: uuidv4(),
    });
    console.log('[wallet/init] OTP response:', JSON.stringify(deviceResp.data));

    const { deviceToken, deviceEncryptionKey, otpToken } = deviceResp.data;
    if (!deviceToken) throw new Error('Circle returned no deviceToken — check API key and Circle console config');
    if (!otpToken) throw new Error('Circle returned no otpToken — OTP email may not have been sent');

    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
    }

    res.json({
      deviceToken,
      deviceEncryptionKey,
      challengeId: otpToken,
      isNewUser: !existing,
      isReturning: !!existing?.wallet_address,
      walletAddress: existing?.wallet_address || null,
    });
  } catch (e) {
    console.error('[wallet/init] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/confirm ───────────────────────────────────────────────
// Called after verifyOtp() fires onLoginComplete with {userToken, encryptionKey}.
// Creates a wallet-initialization challenge via createUserPinWithWallets and
// returns the challengeId so the frontend SDK can execute() it to create the wallet.
// Error 155106 = user already initialized → skip challenge, return isExisting:true.
app.post('/api/wallet/confirm', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, userToken } = req.body;
  if (!email || !userToken) return res.status(400).json({ error: 'email and userToken required' });

  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);

  try {
    console.log(`[wallet/confirm] Calling createUserPinWithWallets for ${email}`);
    const initResp = await circleClient.createUserPinWithWallets({
      userToken,
      blockchains: ['ETH-SEPOLIA'],
    });
    console.log('[wallet/confirm] createUserPinWithWallets response:', JSON.stringify(initResp.data));
    const { challengeId } = initResp.data;
    return res.json({ challengeId });
  } catch (initErr) {
    const code = initErr?.code ?? initErr?.response?.data?.code;
    if (code === 155106) {
      // User already initialized — wallet exists, skip challenge
      console.log('[wallet/confirm] User already initialized (155106) — wallet exists');
      return res.json({ isExisting: true });
    }
    console.error('[wallet/confirm] error:', initErr);
    return res.status(500).json({ error: circleErr(initErr) });
  }
});

// ── POST /api/wallet/finalize ──────────────────────────────────────────────
// Called after sdk.execute(challengeId) succeeds. Circle provisions wallets
// asynchronously, so we poll listWallets up to 8 times (16 seconds total).
app.post('/api/wallet/finalize', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, userToken } = req.body;
  if (!email || !userToken) return res.status(400).json({ error: 'email and userToken required' });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    let wallets = [];
    for (let attempt = 1; attempt <= 8; attempt++) {
      console.log(`[wallet/finalize] listWallets attempt ${attempt} for ${email}`);
      const walletsResp = await circleClient.listWallets({ userToken });
      wallets = walletsResp.data?.wallets || [];
      console.log(`[wallet/finalize] attempt ${attempt}: ${wallets.length} wallet(s)`);
      if (wallets.length > 0) break;
      if (attempt < 8) await sleep(2000);
    }

    if (!wallets.length) return res.status(404).json({ error: 'Wallet not available — Circle provisioning timed out. Please try again.' });

    const { address: walletAddress, id: circleWalletId, blockchain, userId: circleUserId } = wallets[0];
    db.prepare(`
      INSERT INTO wallet_users (id, email, circle_user_id, wallet_address, circle_wallet_id, circle_blockchain)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        circle_user_id    = excluded.circle_user_id,
        wallet_address    = excluded.wallet_address,
        circle_wallet_id  = excluded.circle_wallet_id,
        circle_blockchain = excluded.circle_blockchain
    `).run(uuidv4(), email, circleUserId, walletAddress, circleWalletId, blockchain);

    res.json({ walletAddress });
  } catch (e) {
    console.error('[wallet/finalize] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
// USDC on ARC testnet (chain 5042002) — 6 decimals, symbol USDC
const USDC_ARC = '0x3600000000000000000000000000000000000000';

async function getOnChainUsdcBalance(walletAddress) {
  const rpc = process.env.ARC_RPC_URL;
  if (!rpc) throw new Error('ARC_RPC_URL not configured in .env');
  const calldata = '0x70a08231' + walletAddress.slice(2).toLowerCase().padStart(64, '0');
  const resp = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: USDC_ARC, data: calldata }, 'latest'], id: 1 }),
  });
  const json = await resp.json();
  const hex = json.result || '0x0';
  return (Number(BigInt(hex)) / 1e6); // USDC has 6 decimals
}

// ── POST /api/wallet/create-payment ───────────────────────────────────────
// Checks ARC testnet USDC balance, then creates a Circle signMessage challenge.
// User PIN-confirms via SDK (no on-chain transfer — Circle wallet is ETH-SEPOLIA
// but USDC lives on ARC testnet, so PIN verification is the payment gate).
app.post('/api/wallet/create-payment', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, signal_id, userToken } = req.body;
  if (!email || !signal_id) return res.status(400).json({ error: 'email and signal_id required' });
  if (!userToken) return res.status(400).json({ error: 'Session expired — please reconnect your wallet' });

  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
  if (!user?.circle_wallet_id) return res.status(404).json({ error: 'No Circle wallet found for this email' });

  const price = 0.05;
  console.log(`[create-payment] email=${email} walletId=${user.circle_wallet_id} signal=${signal_id}`);

  try {
    // 1. Check on-chain balance on ARC testnet — authoritative source of truth
    const onChainBalance = await getOnChainUsdcBalance(user.wallet_address);
    console.log(`[create-payment] ARC testnet USDC balance=${onChainBalance}`);

    if (onChainBalance < price) {
      return res.status(400).json({
        error: `Insufficient USDC — your wallet has ${onChainBalance.toFixed(2)} USDC on ARC testnet. You need at least ${price} USDC. Fund your wallet using the faucet.`,
        balance: String(onChainBalance),
        walletAddress: user.wallet_address,
        required: String(price),
      });
    }

    // 2. Create signMessage challenge — user must enter PIN to authorise the signal unlock
    const signResp = await fetch('https://api.circle.com/v1/w3s/user/signMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: uuidv4(),
        walletId: user.circle_wallet_id,
        message: `AlphaChef unlock signal ${signal_id} | 0.05 USDC | ${Date.now()}`,
        userToken,
      }),
    });

    const signData = await signResp.json();
    console.log('[create-payment] Circle signMessage response:', JSON.stringify(signData));

    if (!signResp.ok) {
      return res.status(400).json({ error: signData.message || JSON.stringify(signData) });
    }

    const challengeId = signData.data?.challengeId;
    if (!challengeId) throw new Error('Circle did not return a challengeId for signMessage');

    res.json({ challengeId, balance: onChainBalance.toFixed(2) });
  } catch (e) {
    console.error('[create-payment] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── GET /api/wallet/balance ────────────────────────────────────────────────
// Queries on-chain USDC balance from ARC testnet (chain 5042002).
// Returns amount and wallet address so the UI can show where to send funds.
app.get('/api/wallet/balance', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ balance: '0' });
  const user = db.prepare('SELECT wallet_address, circle_wallet_id FROM wallet_users WHERE email = ?').get(email);
  if (!user?.wallet_address) return res.json({ balance: '0' });
  try {
    const balance = await getOnChainUsdcBalance(user.wallet_address);
    res.json({ balance: balance.toFixed(6), walletAddress: user.wallet_address });
  } catch (e) {
    console.error('[balance] error:', e.message);
    res.json({ balance: '0', walletAddress: user.wallet_address });
  }
});

const PORT = process.env.WALLET_PORT || 3015;
app.listen(PORT, () => console.log(`AlphaChef wallet service running on port ${PORT}`));
