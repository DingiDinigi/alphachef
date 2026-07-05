require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const path = require('path');
const { CircleUserControlledWalletsClient } = require('@circle-fin/user-controlled-wallets');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, 'alphachef.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    teaser TEXT NOT NULL,
    full_analysis TEXT NOT NULL,
    agent_reasoning TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK(confidence IN ('HIGH','MEDIUM','LOW')),
    price_usdc REAL NOT NULL,
    sources TEXT NOT NULL,
    token TEXT,
    tx_hash TEXT,
    contract_signal_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS unlocks (
    id TEXT PRIMARY KEY,
    signal_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    amount_usdc REAL NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (signal_id) REFERENCES signals(id)
  );

  CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS wallet_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    circle_user_id TEXT UNIQUE NOT NULL,
    wallet_address TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Circle UCW client
const circleClient = process.env.CIRCLE_API_KEY
  ? new CircleUserControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY })
  : null;

const AGENT_SECRET = process.env.AGENT_SECRET || 'alphachef-agent-secret-2024';

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function hasUnlocked(signalId, walletAddress) {
  if (!walletAddress) return false;
  const unlock = db.prepare(
    'SELECT id FROM unlocks WHERE signal_id = ? AND LOWER(wallet_address) = LOWER(?)'
  ).get(signalId, walletAddress);
  return !!unlock;
}

function signalToTeaser(s, walletAddress) {
  const unlocked = hasUnlocked(s.id, walletAddress);
  return {
    id: s.id,
    title: s.title,
    teaser: s.teaser,
    full_analysis: unlocked ? s.full_analysis : null,
    agent_reasoning: unlocked ? s.agent_reasoning : null,
    confidence: s.confidence,
    price_usdc: s.price_usdc,
    sources: JSON.parse(s.sources),
    token: s.token,
    tx_hash: s.tx_hash,
    contract_signal_id: s.contract_signal_id,
    created_at: s.created_at,
    unlocked,
  };
}

app.post('/api/signals', (req, res) => {
  const authHeader = req.headers['x-agent-secret'];
  if (authHeader !== AGENT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, teaser, full_analysis, agent_reasoning, confidence, price_usdc, sources, token, tx_hash, contract_signal_id } = req.body;

  if (!title || !teaser || !full_analysis || !confidence) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO signals (id, title, teaser, full_analysis, agent_reasoning, confidence, price_usdc, sources, token, tx_hash, contract_signal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, teaser, full_analysis, agent_reasoning || '', confidence, price_usdc || 0.01, JSON.stringify(sources || []), token || null, tx_hash || null, contract_signal_id || null);

  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(id);
  broadcast({ type: 'new_signal', signal: signalToTeaser(signal, null) });

  res.json({ id, success: true });
});

app.get('/api/signals', (req, res) => {
  const wallet = req.query.wallet || null;
  const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT 50').all();
  res.json(signals.map(s => signalToTeaser(s, wallet)));
});

app.get('/api/signals/:id', (req, res) => {
  const wallet = req.query.wallet || null;
  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(req.params.id);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  res.json(signalToTeaser(signal, wallet));
});

app.post('/api/unlock', async (req, res) => {
  const { signal_id, wallet_address, tx_hash } = req.body;

  if (!signal_id || !wallet_address || !tx_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signal_id);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });

  if (hasUnlocked(signal_id, wallet_address)) {
    return res.json({ success: true, message: 'Already unlocked' });
  }

  try {
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.fun');
    const receipt = await provider.getTransactionReceipt(tx_hash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction not confirmed' });
    }
  } catch (e) {
    console.warn('Could not verify tx on-chain:', e.message);
  }

  const unlockId = uuidv4();
  db.prepare(`
    INSERT INTO unlocks (id, signal_id, wallet_address, tx_hash, amount_usdc)
    VALUES (?, ?, ?, ?, ?)
  `).run(unlockId, signal_id, wallet_address, tx_hash, signal.price_usdc);

  const fullSignal = signalToTeaser(signal, wallet_address);
  broadcast({ type: 'signal_unlocked', signal_id, wallet_address });

  res.json({ success: true, signal: fullSignal });
});

app.get('/api/stats', (req, res) => {
  const totalSignals = db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
  const totalUnlocks = db.prepare('SELECT COUNT(*) as c FROM unlocks').get().c;
  const totalRevenue = db.prepare('SELECT SUM(amount_usdc) as s FROM unlocks').get().s || 0;
  const highSignals = db.prepare("SELECT COUNT(*) as c FROM signals WHERE confidence = 'HIGH'").get().c;
  const recentLogs = db.prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 20').all();

  res.json({
    total_signals: totalSignals,
    total_unlocks: totalUnlocks,
    total_revenue_usdc: Math.round(totalRevenue * 100) / 100,
    high_confidence_signals: highSignals,
    agent_logs: recentLogs,
  });
});

app.post('/api/logs', (req, res) => {
  const authHeader = req.headers['x-agent-secret'];
  if (authHeader !== AGENT_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { level, message } = req.body;
  db.prepare('INSERT INTO agent_logs (level, message) VALUES (?, ?)').run(level || 'INFO', message);
  broadcast({ type: 'agent_log', level: level || 'INFO', message, timestamp: Date.now() });
  res.json({ success: true });
});

// --- Circle UCW wallet endpoints ---

app.get('/api/wallet/config', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  try {
    const resp = await fetch('https://api.circle.com/v1/w3s/config/entity/appId', {
      headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
    });
    const json = await resp.json();
    res.json({ appId: json.data?.appId || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/wallet/init', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  try {
    let user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
    let isNewUser = false;

    if (!user) {
      // Create new Circle user
      const circleUserId = uuidv4();
      await circleClient.createUser({ userId: circleUserId });
      db.prepare(
        'INSERT INTO wallet_users (id, email, circle_user_id) VALUES (?, ?, ?)'
      ).run(uuidv4(), email, circleUserId);
      user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
      isNewUser = true;
    }

    // Returning user with existing wallet — no challenge needed
    if (!isNewUser && user.wallet_address) {
      return res.json({ isNewUser: false, walletAddress: user.wallet_address });
    }

    // Get user token for challenge
    const tokenResp = await circleClient.createUserToken({ userId: user.circle_user_id });
    const { userToken, encryptionKey } = tokenResp.data;

    // Create PIN + wallet challenge (works for new users and returning users without a wallet)
    const challengeResp = await circleClient.createUserPinWithWallets({
      userToken,
      blockchains: ['ETH-SEPOLIA'],
    });
    const { challengeId } = challengeResp.data;

    res.json({ userToken, encryptionKey, challengeId, isNewUser, walletAddress: null });
  } catch (e) {
    console.error('Circle /wallet/init error:', e);
    res.status(500).json({ error: e.message || 'Circle initialization failed' });
  }
});

app.post('/api/wallet/confirm', async (req, res) => {
  if (!circleClient) return res.status(503).json({ error: 'Circle not configured' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    // Fresh token to list wallets
    const tokenResp = await circleClient.createUserToken({ userId: user.circle_user_id });
    const { userToken } = tokenResp.data;

    const walletsResp = await circleClient.listWallets({ userToken });
    const wallets = walletsResp.data?.wallets || [];
    if (!wallets.length) return res.status(404).json({ error: 'No wallet found yet' });

    const walletAddress = wallets[0].address;
    db.prepare('UPDATE wallet_users SET wallet_address = ? WHERE email = ?').run(walletAddress, email);

    res.json({ walletAddress });
  } catch (e) {
    console.error('Circle /wallet/confirm error:', e);
    res.status(500).json({ error: e.message || 'Failed to retrieve wallet' });
  }
});

// --- end Circle UCW endpoints ---

wss.on('connection', (ws) => {
  const stats = db.prepare('SELECT COUNT(*) as c FROM signals').get();
  ws.send(JSON.stringify({ type: 'connected', signal_count: stats.c }));
});

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
  console.log(`AlphaChef backend running on port ${PORT}`);
});
