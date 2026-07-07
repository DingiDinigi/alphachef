require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { CircleUserControlledWalletsClient } = require('@circle-fin/user-controlled-wallets');
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, 'alphachef.db'));

// Schema migration: handle old table variants
{
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_users'").get();
  if (row && /circle_user_id\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(row.sql)) {
    console.log('[wallet-server] Migrating wallet_users schema');
    db.exec(`
      CREATE TABLE wallet_users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        circle_user_id TEXT UNIQUE,
        wallet_address TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        circle_wallet_id TEXT,
        circle_blockchain TEXT,
        password_hash TEXT
      );
      INSERT OR IGNORE INTO wallet_users_new
        SELECT id, email, circle_user_id, wallet_address, created_at, circle_wallet_id, circle_blockchain, NULL
        FROM wallet_users;
      DROP TABLE wallet_users;
      ALTER TABLE wallet_users_new RENAME TO wallet_users;
    `);
  } else if (!row) {
    db.exec(`
      CREATE TABLE wallet_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        circle_user_id TEXT UNIQUE,
        wallet_address TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        circle_wallet_id TEXT,
        circle_blockchain TEXT,
        password_hash TEXT
      );
    `);
  }
}

for (const col of [
  'circle_wallet_id TEXT', 'circle_blockchain TEXT', 'password_hash TEXT',
  'arc_wallet_id TEXT', 'arc_wallet_address TEXT', 'arc_wallet_set_id TEXT',
]) {
  try { db.exec(`ALTER TABLE wallet_users ADD COLUMN ${col}`); } catch (_) {}
}

const apiKey       = process.env.CIRCLE_API_KEY       || '';
const appId        = process.env.CIRCLE_APP_ID        || '';
const entitySecret = process.env.CIRCLE_ENTITY_SECRET || '';
console.log(`[wallet-server] CIRCLE_API_KEY: ${apiKey ? apiKey.slice(0, 8) + '…' : '(empty)'}`);
console.log(`[wallet-server] CIRCLE_APP_ID: ${appId ? appId.slice(0, 8) + '…' : '(empty)'}`);
console.log(`[wallet-server] CIRCLE_ENTITY_SECRET: ${entitySecret ? 'set' : '(empty)'}`);

// UCW client — used only for email OTP (init endpoint)
const circleClient = apiKey
  ? new CircleUserControlledWalletsClient({ apiKey })
  : null;

// DCW client — used for wallet creation and all transactions (no user PIN needed)
const devClient = (apiKey && entitySecret)
  ? initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  : null;

function circleErr(e) {
  const msg = e?.response?.data?.message || e?.message || 'Circle API error';
  return `${msg} | detail: ${JSON.stringify(e?.response?.data || {})}`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, dk) => {
      if (err) reject(err); else resolve(dk.toString('hex'));
    });
  });
  return `${salt}:${hash}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, dk) => {
      if (err) reject(err); else resolve(dk.toString('hex'));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// ── GET /api/wallet/config ─────────────────────────────────────────────────
app.get('/api/wallet/config', (req, res) => {
  res.json({ appId });
});

// ── POST /api/wallet/init ──────────────────────────────────────────────────
// Sends OTP via Circle UCW — returns deviceToken/challengeId for SDK verifyOtp().
app.post('/api/wallet/init', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured — check CIRCLE_API_KEY in .env' });
  const { email, deviceId } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  try {
    const existing = db.prepare('SELECT wallet_address FROM wallet_users WHERE email = ?').get(email);

    const deviceResp = await circleClient.createDeviceTokenForEmailLogin({
      deviceId, email, idempotencyKey: uuidv4(),
    });
    console.log('[wallet/init] OTP sent to', email);

    const { deviceToken, deviceEncryptionKey, otpToken } = deviceResp.data;
    if (!deviceToken) throw new Error('Circle returned no deviceToken');
    if (!otpToken) throw new Error('Circle returned no otpToken — OTP email may not have been sent');

    db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);

    res.json({
      deviceToken,
      deviceEncryptionKey,
      challengeId: otpToken,
      isReturning: !!existing?.wallet_address,
    });
  } catch (e) {
    console.error('[wallet/init] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/confirm ───────────────────────────────────────────────
// Called after verifyOtp() succeeds.
// Creates a developer-controlled ARC-TESTNET wallet for the user if none exists.
app.post('/api/wallet/confirm', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log('[wallet/confirm] email:', email);

  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

  // Already have a developer-controlled ARC-TESTNET wallet — return it
  if (user?.arc_wallet_id && user?.arc_wallet_address) {
    console.log('[wallet/confirm] Returning user — DCW wallet:', user.arc_wallet_address);
    return res.json({
      walletAddress: user.arc_wallet_address,
      isExisting: true,
      hasPassword: !!user.password_hash,
    });
  }

  if (!devClient) {
    return res.status(503).json({ error: 'Developer wallet client not configured — check CIRCLE_ENTITY_SECRET in .env' });
  }

  try {
    // Create a wallet set scoped to this user
    console.log('[wallet/confirm] Creating DCW wallet set for', email);
    const wsResp = await devClient.createWalletSet({
      name: email,
      idempotencyKey: uuidv4(),
    });
    const walletSetId = wsResp.data?.walletSet?.id;
    if (!walletSetId) throw new Error('Circle returned no walletSetId');
    console.log('[wallet/confirm] Wallet set created:', walletSetId);

    // Create an EOA wallet on ARC-TESTNET in that set
    const wResp = await devClient.createWallets({
      walletSetId,
      blockchains: ['ARC-TESTNET'],
      count: 1,
      accountType: 'EOA',
      idempotencyKey: uuidv4(),
    });
    const wallets = wResp.data?.wallets || [];
    const arcWallet = wallets.find(w => w.blockchain === 'ARC-TESTNET') || wallets[0];
    if (!arcWallet) throw new Error('Circle returned no wallets');
    console.log('[wallet/confirm] DCW wallet created:', arcWallet.address, arcWallet.id);

    db.prepare(
      'UPDATE wallet_users SET wallet_address = ?, arc_wallet_id = ?, arc_wallet_address = ?, arc_wallet_set_id = ? WHERE email = ?'
    ).run(arcWallet.address, arcWallet.id, arcWallet.address, walletSetId, email);

    return res.json({
      walletAddress: arcWallet.address,
      isExisting: false,
      hasPassword: !!user.password_hash,
    });
  } catch (e) {
    console.error('[wallet/confirm] DCW wallet creation error:', circleErr(e));
    return res.status(500).json({ error: `Wallet creation failed: ${circleErr(e)}` });
  }
});

// ── POST /api/wallet/set-password ─────────────────────────────────────────
app.post('/api/wallet/set-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = db.prepare('SELECT id FROM wallet_users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = await hashPassword(password);
  db.prepare('UPDATE wallet_users SET password_hash = ? WHERE email = ?').run(hash, email);
  console.log('[wallet/set-password] Password set for', email);
  res.json({ success: true });
});

// ── POST /api/wallet/verify-password ──────────────────────────────────────
app.post('/api/wallet/verify-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = db.prepare('SELECT password_hash FROM wallet_users WHERE email = ?').get(email);
  if (!user?.password_hash) return res.status(404).json({ error: 'No password set — please reconnect your wallet to set one' });

  const valid = await checkPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ success: true });
});

// ── POST /api/wallet/prepare-unlock ───────────────────────────────────────
// Developer-controlled flow — backend signs and submits the USDC transfer
// server-side using the entity secret. No Circle modal or user PIN needed.
// Records the unlock in the DB immediately and returns alreadyUnlocked:true
// so the frontend skips the Circle SDK step and shows the signal directly.
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '';

app.post('/api/wallet/prepare-unlock', async (req, res) => {
  const { email, signalId, walletAddress, password } = req.body;

  console.log('[prepare-unlock] START —', {
    email: email ? email.slice(0, 8) + '…' : '(missing)',
    signalId: signalId || '(missing)',
    walletAddress: walletAddress ? walletAddress.slice(0, 10) + '…' : '(missing)',
    has_password: !!password,
  });

  if (!email || !signalId || !walletAddress || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, signalId, walletAddress, password' });
  }

  // 1. Verify spend password
  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Wallet account not found — please reconnect' });
  if (!user.password_hash) {
    return res.status(401).json({ error: 'No spend password set — please reconnect your wallet to set one' });
  }
  const validPwd = await checkPassword(password, user.password_hash);
  if (!validPwd) {
    console.log('[prepare-unlock] Invalid password for', email);
    return res.status(401).json({ error: 'Incorrect spend password' });
  }
  console.log('[prepare-unlock] Password verified for', email);

  // 2. Get signal
  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });

  // 3. Check already unlocked
  const alreadyUnlocked = db.prepare(
    'SELECT id FROM unlocks WHERE signal_id = ? AND LOWER(wallet_address) = LOWER(?)'
  ).get(signalId, walletAddress);
  if (alreadyUnlocked) {
    console.log('[prepare-unlock] Already unlocked');
    return res.json({ alreadyUnlocked: true });
  }

  // 4. Require developer-controlled ARC-TESTNET wallet
  if (!user.arc_wallet_id) {
    return res.status(400).json({
      error: 'No ARC-TESTNET wallet found — please reconnect your wallet.',
      code: 'NO_ARC_WALLET',
    });
  }
  if (!devClient) {
    return res.status(503).json({ error: 'Developer wallet client not configured' });
  }
  if (!PLATFORM_WALLET) {
    return res.status(500).json({ error: 'Platform wallet not configured (PLATFORM_WALLET env missing)' });
  }

  const amount = (signal.price_usdc || 0.05).toFixed(4);
  let usdcTokenId = null;

  // 5a. Get USDC tokenId from wallet token balance
  try {
    const balResp = await devClient.getWalletTokenBalance({
      id: user.arc_wallet_id,
      includeAll: true,
    });
    const tokenBalances = balResp.data?.tokenBalances || [];
    console.log('[prepare-unlock] DCW wallet balances:', JSON.stringify(
      tokenBalances.map(b => ({ sym: b.token?.symbol, amt: b.amount, id: b.token?.id }))
    ));
    const usdcBal = tokenBalances.find(b =>
      b.token?.symbol?.toUpperCase().includes('USDC') ||
      b.token?.name?.toUpperCase().includes('USD COIN')
    );
    if (usdcBal) {
      usdcTokenId = usdcBal.token.id;
      console.log('[prepare-unlock] tokenId from balance:', usdcTokenId, 'amount:', usdcBal.amount);
    }
  } catch (e) {
    console.error('[prepare-unlock] getWalletTokenBalance error:', circleErr(e));
  }

  // 5b. Fall back to Circle token registry
  if (!usdcTokenId) {
    try {
      const tResp = await fetch(
        'https://api.circle.com/v1/w3s/tokens?blockchain=ARC-TESTNET&pageSize=50',
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );
      const tData = await tResp.json();
      const tokens = tData?.data?.tokens || [];
      console.log('[prepare-unlock] Token registry ARC-TESTNET:', JSON.stringify(
        tokens.map(t => ({ sym: t.symbol, id: t.id }))
      ));
      const usdcToken = tokens.find(t =>
        t.symbol?.toUpperCase() === 'USDC' ||
        t.name?.toUpperCase().includes('USD COIN')
      );
      if (usdcToken?.id) {
        usdcTokenId = usdcToken.id;
        console.log('[prepare-unlock] tokenId from registry:', usdcTokenId);
      }
    } catch (e) {
      console.error('[prepare-unlock] token registry error:', e.message);
    }
  }

  if (!usdcTokenId) {
    return res.status(402).json({
      error: 'No USDC found in ARC-TESTNET wallet. Fund via https://faucet.circle.com/ selecting ARC network.',
    });
  }

  // 6. Submit transfer — signed server-side via entity secret, no user approval modal
  const idempotencyKey = uuidv4();
  console.log('[prepare-unlock] Submitting DCW transfer:', {
    walletId: user.arc_wallet_id, amount, tokenId: usdcTokenId, to: PLATFORM_WALLET,
  });
  try {
    const txResp = await devClient.createTransaction({
      walletId: user.arc_wallet_id,
      amounts: [amount],
      destinationAddress: PLATFORM_WALLET,
      tokenId: usdcTokenId,
      fee: { type: 'level', config: { feeLevel: 'HIGH' } },
      idempotencyKey,
      refId: signalId,
    });
    const transactionId = txResp.data?.id || txResp.data?.transaction?.id || idempotencyKey;
    console.log('[prepare-unlock] DCW transaction submitted:', transactionId);

    // 7. Record unlock immediately (transaction is queued; optimistic)
    db.prepare(
      'INSERT OR IGNORE INTO unlocks (id, signal_id, wallet_address, tx_hash, amount_usdc) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), signalId, walletAddress, `dcw:${transactionId}`, Number(amount));
    console.log('[prepare-unlock] Unlock recorded — signal', signalId);

    return res.json({ alreadyUnlocked: true });
  } catch (e) {
    const msg = circleErr(e);
    console.error('[prepare-unlock] DCW createTransaction error:', msg);
    return res.status(500).json({ error: `Transfer failed: ${msg}` });
  }
});

// ── POST /api/wallet/refresh ───────────────────────────────────────────────
app.post('/api/wallet/refresh', (req, res) => {
  res.json({ refreshFailed: true, reason: 'email_auth_not_supported' });
});

// ── GET /api/wallet/balance ────────────────────────────────────────────────
// Uses DCW getWalletTokenBalance for live ARC-TESTNET USDC balance.
app.get('/api/wallet/balance', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ balance: '0' });
  const user = db.prepare('SELECT arc_wallet_id, arc_wallet_address FROM wallet_users WHERE email = ?').get(email);
  if (!user?.arc_wallet_id || !devClient) return res.json({ balance: '0' });

  try {
    const balResp = await devClient.getWalletTokenBalance({
      id: user.arc_wallet_id,
      includeAll: true,
    });
    const tokenBalances = balResp.data?.tokenBalances || [];
    const usdcBal = tokenBalances.find(b =>
      b.token?.symbol?.toUpperCase().includes('USDC') ||
      b.token?.name?.toUpperCase().includes('USD COIN')
    );
    const balance = usdcBal?.amount || '0';
    console.log(`[balance] ${email} — ARC-TESTNET — ${balance} USDC`);
    res.json({ balance, walletAddress: user.arc_wallet_address, blockchain: 'ARC-TESTNET' });
  } catch (e) {
    console.error('[balance] error:', e.message);
    res.json({ balance: '0', walletAddress: user.arc_wallet_address, blockchain: 'ARC-TESTNET' });
  }
});

const PORT = process.env.WALLET_PORT || 3015;
app.listen(PORT, () => console.log(`AlphaChef wallet service running on port ${PORT}`));
