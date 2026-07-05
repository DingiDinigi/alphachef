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

// Ensure wallet_users table exists with all columns
db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    circle_user_id TEXT,
    wallet_address TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Idempotent migrations
for (const col of ['circle_wallet_id TEXT', 'circle_blockchain TEXT']) {
  try { db.exec(`ALTER TABLE wallet_users ADD COLUMN ${col}`); } catch (_) {}
}

const circleClient = process.env.CIRCLE_API_KEY
  ? new CircleUserControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY })
  : null;

function circleErr(e) {
  return e?.response?.data?.message || e?.message || 'Circle API error';
}

// ── GET /api/wallet/config ─────────────────────────────────────────────────
// Returns the Circle appId needed to initialise the W3S browser SDK.
app.get('/api/wallet/config', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  try {
    const resp = await fetch('https://api.circle.com/v1/w3s/config/entity/appId', {
      headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
    });
    const json = await resp.json();
    res.json({ appId: json.data?.appId || '' });
  } catch (e) {
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/init ──────────────────────────────────────────────────
// NEW USER:      Circle sends OTP to email → returns deviceToken + challengeId
//               (W3S SDK will show: OTP entry → PIN setup → wallet created)
// RETURNING:     wallet_address already in DB → return it immediately, no challenge
app.post('/api/wallet/init', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  try {
    let user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

    // ── Returning user: instant restore ──────────────────────────────────
    if (user?.wallet_address) {
      return res.json({ isNewUser: false, walletAddress: user.wallet_address });
    }

    // ── New user (or existing without wallet): email OTP flow ─────────
    const isNewUser = !user;
    if (!user) {
      db.prepare('INSERT INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
      user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
    }

    // Circle sends a 6-digit OTP to the user's email
    const deviceId = uuidv4();
    const deviceResp = await circleClient.createDeviceTokenForEmailLogin({
      deviceId,
      email,
      idempotencyKey: uuidv4(),
    });
    const { deviceToken, deviceEncryptionKey } = deviceResp.data;

    // Create the combined OTP-verify + PIN-setup + wallet-creation challenge.
    // The W3S SDK will step the user through all three phases.
    const challengeResp = await circleClient.createUserPinWithWallets({
      userToken: deviceToken,
      blockchains: ['ETH-SEPOLIA'],
    });
    const { challengeId } = challengeResp.data;

    res.json({ deviceToken, deviceEncryptionKey, challengeId, isNewUser });
  } catch (e) {
    console.error('/wallet/init error:', circleErr(e));
    res.status(500).json({ error: circleErr(e) });
  }
});

// ── POST /api/wallet/confirm ───────────────────────────────────────────────
// Called after the W3S SDK challenge completes. Uses the deviceToken (still
// valid immediately after challenge) to fetch the newly created wallet.
app.post('/api/wallet/confirm', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email, deviceToken } = req.body;
  if (!email || !deviceToken) return res.status(400).json({ error: 'email and deviceToken required' });

  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const walletsResp = await circleClient.listWallets({ userToken: deviceToken });
    const wallets = walletsResp.data?.wallets || [];
    if (!wallets.length) return res.status(404).json({ error: 'Wallet not found — please retry' });

    const { address: walletAddress, id: circleWalletId, blockchain, userId: circleUserId } = wallets[0];

    db.prepare(`
      UPDATE wallet_users
      SET wallet_address = ?, circle_wallet_id = ?, circle_blockchain = ?, circle_user_id = ?
      WHERE email = ?
    `).run(walletAddress, circleWalletId, blockchain, circleUserId, email);

    res.json({ walletAddress });
  } catch (e) {
    console.error('/wallet/confirm error:', circleErr(e));
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
