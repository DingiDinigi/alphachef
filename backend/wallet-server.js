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

for (const col of ['circle_wallet_id TEXT', 'circle_blockchain TEXT', 'password_hash TEXT', 'arc_wallet_id TEXT', 'arc_wallet_address TEXT']) {
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
// Fetches Circle wallets, finds or creates an ARC-TESTNET wallet, stores it.
app.post('/api/wallet/confirm', async (req, res) => {
  const { email, deviceToken, deviceEncryptionKey } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log('[wallet/confirm] email:', email, '| has deviceToken:', !!deviceToken);

  db.prepare('INSERT OR IGNORE INTO wallet_users (id, email) VALUES (?, ?)').run(uuidv4(), email);
  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);

  // Already have an ARC-TESTNET wallet stored — return it immediately
  if (user?.arc_wallet_id && user?.arc_wallet_address) {
    console.log('[wallet/confirm] Returning user, ARC-TESTNET wallet stored:', user.arc_wallet_address);
    return res.json({
      walletAddress: user.arc_wallet_address,
      isExisting: true,
      hasPassword: !!user.password_hash,
    });
  }

  // Fetch all Circle wallets for this user
  if (deviceToken && circleClient) {
    try {
      console.log('[wallet/confirm] Fetching Circle wallets...');
      const walletsResp = await circleClient.listWallets({ userToken: deviceToken });
      const wallets = walletsResp.data?.wallets || [];
      console.log('[wallet/confirm] Circle wallets found:', wallets.length,
        wallets.map(w => `${w.blockchain}:${w.address}`).join(', '));

      // Find an existing ARC-TESTNET wallet
      let arcWallet = wallets.find(w => w.blockchain === 'ARC-TESTNET');

      // If none, create one in the same wallet set
      if (!arcWallet && wallets.length > 0) {
        const walletSetId = wallets[0].walletSetId;
        console.log('[wallet/confirm] No ARC-TESTNET wallet — creating one in walletSetId:', walletSetId);
        try {
          const createResp = await circleClient.createWallets({
            userToken: deviceToken,
            blockchains: ['ARC-TESTNET'],
            count: 1,
            walletSetId,
          });
          const newWallets = createResp.data?.wallets || [];
          arcWallet = newWallets.find(w => w.blockchain === 'ARC-TESTNET') || newWallets[0];
          console.log('[wallet/confirm] Created ARC-TESTNET wallet:', arcWallet?.address);
        } catch (e) {
          console.error('[wallet/confirm] createWallets error:', circleErr(e));
        }
      }

      const primaryWallet = arcWallet || wallets[0];
      if (primaryWallet) {
        const arcId   = arcWallet?.id      || (primaryWallet.blockchain === 'ARC-TESTNET' ? primaryWallet.id      : null);
        const arcAddr = arcWallet?.address || (primaryWallet.blockchain === 'ARC-TESTNET' ? primaryWallet.address : null);
        db.prepare(
          'UPDATE wallet_users SET wallet_address = ?, circle_wallet_id = ?, circle_blockchain = ?, circle_user_id = ?, arc_wallet_id = ?, arc_wallet_address = ? WHERE email = ?'
        ).run(primaryWallet.address, primaryWallet.id, primaryWallet.blockchain,
              primaryWallet.userId || null, arcId, arcAddr, email);
        const returnAddress = arcAddr || primaryWallet.address;
        console.log('[wallet/confirm] Stored. ARC addr:', arcAddr, '| primary:', primaryWallet.address);
        return res.json({
          walletAddress: returnAddress,
          isExisting: !!user.wallet_address,
          hasPassword: !!user.password_hash,
        });
      }
    } catch (e) {
      console.error('[wallet/confirm] listWallets error:', circleErr(e));
    }
  }

  // Fallback: return previously stored address if any
  if (user?.wallet_address) {
    console.log('[wallet/confirm] Returning old wallet address:', user.wallet_address);
    return res.json({ walletAddress: user.wallet_address, isExisting: true, hasPassword: !!user.password_hash });
  }

  // Last resort: placeholder
  const generated = ethers.Wallet.createRandom();
  db.prepare('UPDATE wallet_users SET wallet_address = ? WHERE email = ?').run(generated.address, email);
  console.log('[wallet/confirm] WARN: No Circle wallet found — placeholder:', generated.address);
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

// USDC contract address on ARC-TESTNET. Used as last-resort fallback if Circle's
// token registry lookup fails to find a tokenId dynamically.
const USDC_BY_CHAIN = {
  'ARC-TESTNET': process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
};
function usdcAddressForChain(blockchain) {
  return USDC_BY_CHAIN[blockchain] || USDC_BY_CHAIN['ARC-TESTNET'];
}

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

  // 4. Ensure we have an ARC-TESTNET wallet ID (prefer arc_wallet_id, fall back to circle_wallet_id)
  let circleWalletId = user.arc_wallet_id || user.circle_wallet_id;
  let circleBlockchain = user.arc_wallet_id ? 'ARC-TESTNET' : (user.circle_blockchain || 'ARC-TESTNET');

  if (!circleWalletId && circleClient) {
    console.log('[prepare-unlock] wallet id missing — fetching from Circle via deviceToken');
    try {
      const walletsResp = await circleClient.listWallets({ userToken: deviceToken });
      const wallets = walletsResp.data?.wallets || [];
      console.log('[prepare-unlock] Circle wallets:', wallets.map(w => `${w.blockchain}:${w.address}`).join(', '));
      const arcWallet = wallets.find(w => w.blockchain === 'ARC-TESTNET') || wallets[0];
      if (arcWallet) {
        circleWalletId = arcWallet.id;
        circleBlockchain = arcWallet.blockchain;
        const arcId   = arcWallet.blockchain === 'ARC-TESTNET' ? arcWallet.id      : null;
        const arcAddr = arcWallet.blockchain === 'ARC-TESTNET' ? arcWallet.address : null;
        db.prepare(
          'UPDATE wallet_users SET circle_wallet_id = ?, circle_blockchain = ?, wallet_address = ?, circle_user_id = ?, arc_wallet_id = ?, arc_wallet_address = ? WHERE email = ?'
        ).run(arcWallet.id, arcWallet.blockchain, arcWallet.address, arcWallet.userId || null, arcId, arcAddr, email);
        console.log('[prepare-unlock] Stored wallet:', circleWalletId, circleBlockchain);
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

  // 5. Resolve USDC tokenId for the transfer.
  //    Strategy: wallet balance API first (has Circle's internal tokenId), then
  //    Circle's token-list API (finds the registered USDC token even if the wallet
  //    balance isn't indexed yet), then fall back to tokenAddress+blockchain.
  //    Never fail early here — let Circle return the specific error if it can't execute.
  const amount = (signal.price_usdc || 0.05).toFixed(4);
  let usdcTokenId = null;

  // 5a. Try wallet token balances (includeAll covers externally-received tokens)
  try {
    const balResp = await circleClient.getWalletTokenBalance({
      walletId: circleWalletId,
      userToken: deviceToken,
      includeAll: true,
    });
    const tokenBalances = balResp.data?.tokenBalances || [];
    console.log('[prepare-unlock] Circle wallet balances (includeAll):', JSON.stringify(
      tokenBalances.map(b => ({ sym: b.token?.symbol, amt: b.amount, id: b.token?.id, addr: b.token?.tokenAddress }))
    ));
    const usdcBal = tokenBalances.find(b =>
      b.token?.symbol?.toUpperCase().includes('USDC') ||
      b.token?.name?.toUpperCase().includes('USD COIN')
    );
    if (usdcBal) {
      usdcTokenId = usdcBal.token.id;
      console.log('[prepare-unlock] tokenId from wallet balance:', usdcTokenId, 'balance:', usdcBal.amount);
    }
  } catch (e) {
    console.error('[prepare-unlock] getWalletTokenBalance error:', circleErr(e));
  }

  // 5b. If wallet balance didn't have USDC, query Circle's token registry directly
  if (!usdcTokenId) {
    try {
      const tResp = await fetch(
        `https://api.circle.com/v1/w3s/tokens?blockchain=${encodeURIComponent(circleBlockchain)}&pageSize=50`,
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );
      const tData = await tResp.json();
      const tokens = tData?.data?.tokens || [];
      console.log('[prepare-unlock] Circle token registry for', circleBlockchain, ':', JSON.stringify(
        tokens.map(t => ({ sym: t.symbol, name: t.name, id: t.id, addr: t.tokenAddress }))
      ));
      const usdcToken = tokens.find(t =>
        t.symbol?.toUpperCase() === 'USDC' ||
        t.name?.toUpperCase().includes('USD COIN')
      );
      if (usdcToken?.id) {
        usdcTokenId = usdcToken.id;
        console.log('[prepare-unlock] tokenId from Circle registry:', usdcTokenId);
      }
    } catch (e) {
      console.error('[prepare-unlock] token registry lookup error:', e.message);
    }
  }

  console.log('[prepare-unlock] Final tokenSpec — tokenId:', usdcTokenId, 'blockchain:', circleBlockchain);

  // 6. Create the Circle transfer challenge.
  const tokenSpec = usdcTokenId
    ? { tokenId: usdcTokenId }
    : { tokenAddress: usdcAddressForChain(circleBlockchain), blockchain: circleBlockchain };

  const transferReq = {
    userToken: deviceToken,
    idempotencyKey: uuidv4(),
    amounts: [amount],
    destinationAddress: PLATFORM_WALLET,
    ...tokenSpec,
    walletId: circleWalletId,
    fee: { type: 'level', config: { feeLevel: 'HIGH' } },
    refId: signalId,
  };
  console.log('[prepare-unlock] Creating Circle transfer challenge:', JSON.stringify(transferReq));
  try {
    const challengeResp = await circleClient.createTransaction(transferReq);
    const { challengeId } = challengeResp.data;
    console.log('[prepare-unlock] Got challengeId:', challengeId);

    return res.json({ challengeId, deviceToken, deviceEncryptionKey });
  } catch (e) {
    const msg = circleErr(e);
    console.error('[prepare-unlock] Circle createTransaction error:', msg);
    // "userToken is invalid" / "userToken had expired" → must re-authenticate
    if (msg.toLowerCase().includes('usertoken')) {
      return res.status(401).json({
        error: 'Circle session expired — please reconnect your wallet.',
        code: 'SESSION_EXPIRED',
      });
    }
    return res.status(500).json({ error: `Circle transfer creation failed: ${msg}` });
  }
});

// ── POST /api/wallet/refresh ───────────────────────────────────────────────
// No-op for Circle email-auth users: createUserToken only works for PIN-auth
// users, not EMAIL-auth users.  Returns refreshFailed so the frontend falls
// back to the stored deviceToken and, if expired, shows the reconnect prompt.
app.post('/api/wallet/refresh', (req, res) => {
  res.json({ refreshFailed: true, reason: 'email_auth_not_supported' });
});

// ── GET /api/wallet/balance ────────────────────────────────────────────────
// RPC and USDC address per blockchain. The Circle wallet's actual blockchain
// (stored in circle_blockchain) determines which chain to query.
const CHAIN_CONFIG = {
  'ARC-TESTNET': {
    rpc:  process.env.ARC_RPC_URL,
    usdc: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
  },
};

async function getOnChainUsdcBalance(walletAddress, blockchain) {
  const chain = CHAIN_CONFIG[blockchain] || CHAIN_CONFIG['ARC-TESTNET'];
  if (!chain.rpc) throw new Error(`No RPC configured for ${blockchain}`);
  const calldata = '0x70a08231' + walletAddress.slice(2).toLowerCase().padStart(64, '0');
  const resp = await fetch(chain.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: chain.usdc, data: calldata }, 'latest'], id: 1 }),
  });
  const json = await resp.json();
  const hex = json.result || '0x0';
  return Number(BigInt(hex)) / 1e6;
}

app.get('/api/wallet/balance', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ balance: '0' });
  const user = db.prepare('SELECT wallet_address, circle_blockchain, arc_wallet_id, arc_wallet_address FROM wallet_users WHERE email = ?').get(email);
  const walletAddr = user?.arc_wallet_address || user?.wallet_address;
  if (!walletAddr) return res.json({ balance: '0' });
  const blockchain = user?.arc_wallet_id ? 'ARC-TESTNET' : (user?.circle_blockchain || 'ARC-TESTNET');
  try {
    const balance = await getOnChainUsdcBalance(walletAddr, blockchain);
    console.log(`[balance] ${email} — ${blockchain} — ${balance} USDC`);
    res.json({ balance: balance.toFixed(6), walletAddress: walletAddr, blockchain });
  } catch (e) {
    console.error('[balance] error:', e.message);
    res.json({ balance: '0', walletAddress: walletAddr, blockchain });
  }
});

const PORT = process.env.WALLET_PORT || 3015;
app.listen(PORT, () => console.log(`AlphaChef wallet service running on port ${PORT}`));
