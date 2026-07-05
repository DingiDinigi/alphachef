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
// NEW USER:      Circle sends OTP to email → returns deviceToken + otpToken as challengeId.
//               The W3S SDK execute(otpToken) handles OTP entry + PIN setup in one iframe flow.
// RETURNING:     wallet_address already in DB → return it immediately, no OTP needed.
app.post('/api/wallet/init', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured — check CIRCLE_API_KEY in .env' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  try {
    const existing = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

    // ── Returning user with wallet: instant restore, no OTP ──────────────
    if (existing?.wallet_address) {
      return res.json({ isNewUser: false, walletAddress: existing.wallet_address });
    }

    // ── New user: get device token + OTP challenge from Circle ───────────
    const deviceId = uuidv4();
    console.log(`[wallet/init] Calling createDeviceTokenForEmailLogin for ${email}`);
    const deviceResp = await circleClient.createDeviceTokenForEmailLogin({
      deviceId,
      email,
      idempotencyKey: uuidv4(),
    });
    console.log('[wallet/init] createDeviceTokenForEmailLogin response:', JSON.stringify(deviceResp.data));

    const { deviceToken, deviceEncryptionKey, otpToken } = deviceResp.data;
    if (!deviceToken) throw new Error('Circle returned no deviceToken — check API key and Circle console config');
    if (!otpToken) throw new Error('Circle returned no otpToken — OTP email may not have been sent');

    // ── Insert placeholder row now that Circle call succeeded ─────────────
    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
    }

    // The otpToken IS the challengeId — the SDK execute(otpToken) handles the
    // full OTP verification + PIN setup flow in Circle's hosted iframe.
    res.json({ deviceToken, deviceEncryptionKey, challengeId: otpToken, isNewUser: true });
  } catch (e) {
    console.error('[wallet/init] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/confirm ───────────────────────────────────────────────
// Called after the W3S SDK execute(otpToken) completes (OTP + PIN done).
// The SDK callback provides {userToken, encryptionKey} for the verified session.
// We initialize the user's wallet on Circle (POST /v1/w3s/user/initialize),
// handling error 155106 (already initialized = returning user) by listing wallets.
app.post('/api/wallet/confirm', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, userToken, encryptionKey } = req.body;
  if (!email || !userToken) return res.status(400).json({ error: 'email and userToken required' });

  // Ensure a placeholder row exists (may have been created in /init, or not)
  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);

  try {
    // ── Try to initialize user + create wallet ────────────────────────────
    // Error 155106 = user already initialized (returning user who completed OTP+PIN
    // previously). In that case we skip init and list their existing wallet instead.
    try {
      console.log(`[wallet/confirm] Calling createUserPinWithWallets for ${email}`);
      const initResp = await circleClient.createUserPinWithWallets({
        userToken,
        blockchains: ['ETH-SEPOLIA'],
      });
      console.log('[wallet/confirm] createUserPinWithWallets response:', JSON.stringify(initResp.data));
    } catch (initErr) {
      const code = initErr?.code ?? initErr?.response?.data?.code;
      if (code !== 155106) {
        console.error('[wallet/confirm] createUserPinWithWallets error:', initErr);
        return res.status(500).json({ error: circleErr(initErr) });
      }
      console.log('[wallet/confirm] User already initialized (155106) — listing existing wallet');
    }

    // ── Fetch the wallet (exists whether new or returning) ────────────────
    console.log(`[wallet/confirm] Calling listWallets for ${email}`);
    const walletsResp = await circleClient.listWallets({ userToken });
    console.log('[wallet/confirm] listWallets response:', JSON.stringify(walletsResp.data));

    const wallets = walletsResp.data?.wallets || [];
    if (!wallets.length) return res.status(404).json({ error: 'Wallet not yet available — please retry in a moment' });

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
    console.error('[wallet/confirm] error:', e);
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/unlock-challenge ─────────────────────────────────────
// Creates a signMessage challenge so the user enters their PIN to authorise
// a signal unlock. Returns challengeId + fresh userToken for the W3S SDK.
app.post('/api/wallet/unlock-challenge', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, signal_id } = req.body;
  if (!email || !signal_id) return res.status(400).json({ error: 'email and signal_id required' });

  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
  if (!user?.wallet_address) return res.status(404).json({ error: 'No Circle wallet found for this email' });
  if (!user.circle_user_id) return res.status(400).json({ error: 'Wallet not fully initialised — please reconnect' });

  try {
    const tokenResp = await circleClient.createUserToken({ userId: user.circle_user_id });
    const { userToken, encryptionKey } = tokenResp.data;

    const signResp = await circleClient.signMessage({
      userToken,
      walletAddress: user.wallet_address,
      blockchain: user.circle_blockchain || 'ETH-SEPOLIA',
      message: `AlphaChef signal unlock authorisation: ${signal_id}`,
      memo: 'Tap confirm to authorise the USDC payment and unlock this signal.',
    });
    const { challengeId } = signResp.data;

    res.json({ challengeId, userToken, encryptionKey });
  } catch (e) {
    console.error('/wallet/unlock-challenge error:', circleErr(e));
    res.status(500).json({ error: circleErr(e) });
  }
});

const PORT = process.env.WALLET_PORT || 3015;
app.listen(PORT, () => console.log(`AlphaChef wallet service running on port ${PORT}`));
