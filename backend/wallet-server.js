require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { CircleUserControlledWalletsClient } = require('@circle-fin/user-controlled-wallets');

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

for (const col of ['circle_wallet_id TEXT', 'circle_blockchain TEXT', 'password_hash TEXT']) {
  try { db.exec(`ALTER TABLE wallet_users ADD COLUMN ${col}`); } catch (_) {}
}

const apiKey = process.env.CIRCLE_API_KEY || '';
const appId  = process.env.CIRCLE_APP_ID  || '';
console.log(`[wallet-server] CIRCLE_API_KEY: ${apiKey ? apiKey.slice(0, 8) + '…' : '(empty)'}`);
console.log(`[wallet-server] CIRCLE_APP_ID: ${appId ? appId.slice(0, 8) + '…' : '(empty)'}`);

const circleClient = apiKey
  ? new CircleUserControlledWalletsClient({ apiKey })
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
// Always sends OTP — returns deviceToken/challengeId for Circle SDK verifyOtp().
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
// Called after verifyOtp() succeeds. No PIN required.
// Returns existing wallet address or generates a new one for new users.
app.post('/api/wallet/confirm', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

  if (user?.wallet_address) {
    console.log('[wallet/confirm] Returning user', email, 'wallet:', user.wallet_address);
    return res.json({
      walletAddress: user.wallet_address,
      isExisting: true,
      hasPassword: !!user.password_hash,
    });
  }

  // New user — generate a fresh Ethereum address
  const generated = ethers.Wallet.createRandom();
  db.prepare('UPDATE wallet_users SET wallet_address = ? WHERE email = ?').run(generated.address, email);
  console.log('[wallet/confirm] New user', email, 'generated wallet:', generated.address);

  return res.json({
    walletAddress: generated.address,
    isExisting: false,
    hasPassword: false,
  });
});

// ── POST /api/wallet/set-password ─────────────────────────────────────────
// Sets or updates the spend password for an account.
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
// Verifies spend password before allowing a signal unlock.
app.post('/api/wallet/verify-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = db.prepare('SELECT password_hash FROM wallet_users WHERE email = ?').get(email);
  if (!user?.password_hash) return res.status(404).json({ error: 'No password set — please reconnect your wallet to set one' });

  const valid = await checkPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ success: true });
});

// ── GET /api/wallet/balance ────────────────────────────────────────────────
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
  return Number(BigInt(hex)) / 1e6;
}

app.get('/api/wallet/balance', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ balance: '0' });
  const user = db.prepare('SELECT wallet_address FROM wallet_users WHERE email = ?').get(email);
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
