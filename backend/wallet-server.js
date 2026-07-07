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
// Called after verifyOtp() succeeds.
// Uses the deviceToken to fetch the real Circle wallet for this user.
app.post('/api/wallet/confirm', async (req, res) => {
  const { email, deviceToken, deviceEncryptionKey } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log('[wallet/confirm] email:', email, '| has deviceToken:', !!deviceToken);

  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

  // Returning user who already has a confirmed Circle wallet
  if (user?.wallet_address && user?.circle_wallet_id) {
    console.log('[wallet/confirm] Returning user, Circle wallet already stored:', user.wallet_address);
    return res.json({
      walletAddress: user.wallet_address,
      isExisting: true,
      hasPassword: !!user.password_hash,
    });
  }

  // Try to fetch the real Circle wallet using the fresh deviceToken
  if (deviceToken && circleClient) {
    try {
      console.log('[wallet/confirm] Fetching Circle wallets with deviceToken...');
      const walletsResp = await circleClient.listWallets({ userToken: deviceToken });
      const wallets = walletsResp.data?.wallets || [];
      console.log('[wallet/confirm] Circle wallets found:', wallets.length, wallets.map(w => `${w.blockchain}:${w.address}`).join(', '));

      if (wallets.length > 0) {
        const w = wallets[0];
        db.prepare(
          'UPDATE wallet_users SET wallet_address = ?, circle_wallet_id = ?, circle_blockchain = ?, circle_user_id = ? WHERE email = ?'
        ).run(w.address, w.id, w.blockchain, w.userId || null, email);
        console.log('[wallet/confirm] Stored Circle wallet:', w.address, w.id, w.blockchain, 'userId:', w.userId);
        return res.json({
          walletAddress: w.address,
          isExisting: !!user.wallet_address,
          hasPassword: !!user.password_hash,
        });
      }
    } catch (e) {
      console.error('[wallet/confirm] listWallets error:', circleErr(e));
      // Fall through to fallback below
    }
  }

  // Fallback: if user already has an address from before (could be old fake one), keep it
  if (user?.wallet_address) {
    console.log('[wallet/confirm] Returning old wallet address (no Circle wallet_id):', user.wallet_address);
    return res.json({ walletAddress: user.wallet_address, isExisting: true, hasPassword: !!user.password_hash });
  }

  // Last resort: generate a placeholder address (Circle wallet may not exist yet)
  const generated = ethers.Wallet.createRandom();
  db.prepare('UPDATE wallet_users SET wallet_address = ? WHERE email = ?').run(generated.address, email);
  console.log('[wallet/confirm] WARN: No Circle wallet found — using placeholder address:', generated.address);
  return res.json({ walletAddress: generated.address, isExisting: false, hasPassword: false });
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

// ── POST /api/wallet/prepare-unlock ───────────────────────────────────────
// Step 1 of the Circle transfer flow:
//   1. Verify spend password
//   2. Create a USDC transfer challenge on Circle (server-side)
//   3. Return {challengeId, deviceToken, deviceEncryptionKey} to frontend
// The frontend must then call sdk.execute(challengeId) for user approval,
// then POST /api/unlock to record the unlock after Circle confirms.
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '';
const USDC_TOKEN_ADDRESS = process.env.USDC_TOKEN_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // ETH-SEPOLIA USDC

app.post('/api/wallet/prepare-unlock', async (req, res) => {
  const { email, signalId, walletAddress, password, deviceToken, deviceEncryptionKey } = req.body;

  console.log('[prepare-unlock] START —', {
    email: email ? email.slice(0, 8) + '…' : '(missing)',
    signalId: signalId || '(missing)',
    walletAddress: walletAddress ? walletAddress.slice(0, 10) + '…' : '(missing)',
    has_password: !!password,
    has_deviceToken: !!deviceToken,
  });

  if (!email || !signalId || !walletAddress || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, signalId, walletAddress, password' });
  }
  if (!deviceToken) {
    return res.status(401).json({
      error: 'Session expired — please reconnect your Circle wallet to unlock signals.',
      code: 'SESSION_EXPIRED',
    });
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

  // 2. Get signal details (shared SQLite DB with server.js)
  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });

  // 3. Check already unlocked
  const alreadyUnlocked = db.prepare(
    'SELECT id FROM unlocks WHERE signal_id = ? AND LOWER(wallet_address) = LOWER(?)'
  ).get(signalId, walletAddress);
  if (alreadyUnlocked) {
    console.log('[prepare-unlock] Signal already unlocked — skipping Circle challenge');
    return res.json({ alreadyUnlocked: true });
  }

  // 4. Ensure we have the Circle wallet ID
  let circleWalletId = user.circle_wallet_id;
  let circleBlockchain = user.circle_blockchain || 'ETH-SEPOLIA';

  if (!circleWalletId && circleClient) {
    console.log('[prepare-unlock] circle_wallet_id missing — fetching from Circle via deviceToken');
    try {
      const walletsResp = await circleClient.listWallets({ userToken: deviceToken });
      const wallets = walletsResp.data?.wallets || [];
      console.log('[prepare-unlock] Circle wallets:', wallets.map(w => `${w.blockchain}:${w.address}`).join(', '));
      if (wallets.length > 0) {
        circleWalletId = wallets[0].id;
        circleBlockchain = wallets[0].blockchain;
        db.prepare(
          'UPDATE wallet_users SET circle_wallet_id = ?, circle_blockchain = ?, wallet_address = ?, circle_user_id = ? WHERE email = ?'
        ).run(circleWalletId, circleBlockchain, wallets[0].address, wallets[0].userId || null, email);
        console.log('[prepare-unlock] Stored Circle wallet ID:', circleWalletId, circleBlockchain, 'userId:', wallets[0].userId);
      }
    } catch (e) {
      console.error('[prepare-unlock] listWallets error:', circleErr(e));
    }
  }

  if (!circleWalletId) {
    return res.status(400).json({
      error: 'No Circle wallet found — please reconnect your wallet so Circle can create it.',
      code: 'NO_CIRCLE_WALLET',
    });
  }

  if (!PLATFORM_WALLET) {
    return res.status(500).json({ error: 'Platform wallet not configured (PLATFORM_WALLET env missing)' });
  }

  // 5. Generate a fresh userToken — the stored deviceToken may have expired
  let transferToken = deviceToken;
  let transferEncryptionKey = deviceEncryptionKey;
  const freshUser = db.prepare('SELECT circle_user_id FROM wallet_users WHERE email = ?').get(email);
  if (freshUser?.circle_user_id && circleClient) {
    try {
      const freshTokenResp = await circleClient.createUserToken({ userId: freshUser.circle_user_id });
      transferToken = freshTokenResp.data.userToken;
      transferEncryptionKey = freshTokenResp.data.encryptionKey;
      console.log('[prepare-unlock] Generated fresh userToken — old token replaced');
    } catch (e) {
      console.warn('[prepare-unlock] createUserToken failed, using provided deviceToken:', e.message);
    }
  }

  // 6. Create the Circle transfer challenge
  const amount = (signal.price_usdc || 0.05).toFixed(4);
  const transferReq = {
    userToken: transferToken,
    idempotencyKey: uuidv4(),
    amounts: [amount],
    destinationAddress: PLATFORM_WALLET,
    tokenAddress: USDC_TOKEN_ADDRESS,
    tokenBlockchain: circleBlockchain,
    walletId: circleWalletId,
    fee: { type: 'level', config: { feeLevel: 'HIGH' } },
    refId: signalId,
  };
  console.log('[prepare-unlock] Creating Circle transfer challenge:', JSON.stringify(transferReq));
  try {
    const challengeResp = await circleClient.createTransaction(transferReq);
    const { challengeId } = challengeResp.data;
    console.log('[prepare-unlock] Got challengeId:', challengeId);

    return res.json({ challengeId, deviceToken: transferToken, deviceEncryptionKey: transferEncryptionKey });
  } catch (e) {
    const msg = circleErr(e);
    console.error('[prepare-unlock] Circle createUserTransactionTransferChallenge error:', msg);
    return res.status(500).json({ error: `Circle transfer creation failed: ${msg}` });
  }
});

// ── POST /api/wallet/refresh ───────────────────────────────────────────────
// Generates a fresh userToken for the Circle user without requiring OTP.
// Frontend calls this before prepare-unlock to avoid "userToken is invalid" errors.
app.post('/api/wallet/refresh', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });

  const user = db.prepare('SELECT circle_user_id FROM wallet_users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.circle_user_id) {
    return res.status(404).json({ error: 'No Circle user ID on file — reconnect wallet to register' });
  }

  try {
    const tokenResp = await circleClient.createUserToken({ userId: user.circle_user_id });
    const { userToken, encryptionKey } = tokenResp.data;
    console.log('[wallet/refresh] Refreshed token for', email);
    return res.json({ userToken, encryptionKey });
  } catch (e) {
    console.error('[wallet/refresh] Error:', circleErr(e));
    return res.status(500).json({ error: `Failed to refresh session: ${circleErr(e)}` });
  }
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
