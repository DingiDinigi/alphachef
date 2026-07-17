require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const cron = require('node-cron');
const { ethers } = require('ethers');
const Groq = require('groq-sdk');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = `http://localhost:${process.env.PORT || 3011}`;
const AGENT_SECRET = process.env.AGENT_SECRET || 'alphachef-agent-secret-2024';
const ARC_RPC = process.env.ARC_RPC_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';

let provider;
let wallet;
let contract;

const ALPHACHEF_ABI = [
  'function registerSignal(string calldata signalId, uint256 priceUsdc) external',
  'event SignalRegistered(string indexed signalId, uint256 priceUsdc, uint256 timestamp)',
];

// Known whale addresses to monitor
const WHALE_ADDRESSES = [
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
  '0x28c6c06298d514db089934071355e5743bf21d60',
  '0xf977814e90da44bfa03b6295a0616a897441acec',
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  '0x8103683202aa8da10536036edec788d28935703d',
];

async function initChain() {
  try {
    // Pin a static network so ethers does not endlessly retry auto-detection
    // when the Arc RPC endpoint is unreachable (keeps mock mode quiet + cheap).
    const arcNetwork = ethers.Network.from({ chainId: 5042002, name: 'arc' });
    provider = new ethers.JsonRpcProvider(ARC_RPC, arcNetwork, { staticNetwork: arcNetwork });
    if (process.env.PRIVATE_KEY) {
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    }
    if (CONTRACT_ADDRESS && wallet) {
      contract = new ethers.Contract(CONTRACT_ADDRESS, ALPHACHEF_ABI, wallet);
    }
    await log('INFO', '⚡ Agent connected to Arc testnet');
  } catch (e) {
    await log('WARN', `Chain connection failed: ${e.message} - running in mock mode`);
  }
}

async function log(level, message) {
  console.log(`[${level}] ${message}`);
  try {
    await axios.post(`${BACKEND_URL}/api/logs`, { level, message }, {
      headers: { 'x-agent-secret': AGENT_SECRET },
      timeout: 3000,
    });
  } catch (_) {}
}

// Source 1: Smart money wallet movements
async function checkSmartMoney() {
  try {
    if (!provider) return null;

    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);

    const signals = [];

    if (block && block.transactions) {
      for (const txHash of block.transactions.slice(0, 20)) {
        try {
          const tx = await provider.getTransaction(txHash);
          if (!tx) continue;

          const fromLower = (tx.from || '').toLowerCase();
          const toLower = (tx.to || '').toLowerCase();

          const isWhale = WHALE_ADDRESSES.some(w =>
            w.toLowerCase() === fromLower || w.toLowerCase() === toLower
          );

          if (isWhale) {
            const valueEth = parseFloat(ethers.formatEther(tx.value || 0n));
            if (valueEth > 5) {
              signals.push({
                source: 'smart_money',
                token: 'ARC',
                detail: `Smart money wallet ${tx.from?.slice(0,8)}... moved ${valueEth.toFixed(2)} tokens`,
                strength: valueEth > 50 ? 3 : 2,
              });
            }
          }
        } catch (_) {}
      }
    }

    return signals.length > 0 ? signals[0] : null;
  } catch (e) {
    await log('WARN', `Smart money check failed: ${e.message}`);
    return null;
  }
}

// Source 2: Token accumulation anomalies (simulated DEX data)
async function checkTokenAccumulation() {
  try {
    const tokens = ['BTC', 'ETH', 'SOL', 'ARB', 'OP', 'AVAX', 'MATIC', 'SEI', 'TIA', 'EIGEN', 'DOGE', 'LINK', 'UNI', 'AAVE', 'DOT', 'NEAR', 'INJ', 'SUI', 'APT', 'ATOM'];
    const token = tokens[Math.floor(Math.random() * tokens.length)];

    // Real DEX buy/sell data via DexScreener's public API - no key required.
    const resp = await axios.get('https://api.dexscreener.com/latest/dex/search', {
      params: { q: token },
      timeout: 8000,
    });

    // Only exact ticker matches - the search endpoint also returns unrelated
    // tokens that just happen to share the same symbol.
    const matches = (resp.data?.pairs || []).filter(p => p.baseToken?.symbol?.toUpperCase() === token);
    if (matches.length === 0) return null;

    // Rank by 24h VOLUME, not liquidity - liquidity can be spoofed cheaply
    // (fake pools routinely show huge liquidity with almost no real trading),
    // while sustained volume is much harder to fake and better reflects which
    // pair is the actual, legitimate market for this token.
    const best = matches.reduce((a, b) => (b.volume?.h24 || 0) > (a.volume?.h24 || 0) ? b : a, matches[0]);
    const txns = best.txns?.h1;
    if (!txns) return null;

    const buys = txns.buys || 0;
    const sells = txns.sells || 0;
    const total = buys + sells;
    if (total < 20) return null; // not enough real activity to mean anything

    const buyPressure = (buys / total) * 100;

    if (buyPressure > 80) {
      return {
        source: 'token_accumulation',
        token,
        detail: `$${token} DEX buy pressure at ${buyPressure.toFixed(1)}% over last hour (${buys} buys vs ${sells} sells on ${best.dexId}) — unusual accumulation pattern`,
        strength: buyPressure > 90 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    await log('WARN', `Token accumulation check failed: ${e.message}`);
    return null;
  }
}

// Source 3: Liquidity events — new pools with large initial liquidity
async function checkLiquidityEvents() {
  try {
    const random = Math.random();
    if (random > 0.7) { // 30% chance of event
      const liquidityUsd = 100000 + Math.random() * 900000;
      const tokens = ['NEWTOKEN/USDC', 'LAUNCH/USDC', 'ARB/USDC', 'OP/USDC', 'AVAX/USDC', 'TIA/USDC'];
      const pair = tokens[Math.floor(Math.random() * tokens.length)];

      return {
        source: 'liquidity_event',
        token: pair.split('/')[0],
        detail: `New ${pair} pool created with $${(liquidityUsd/1000).toFixed(0)}K initial liquidity on Arc DEX`,
        strength: liquidityUsd > 500000 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 4: Bridge activity — USDC moving into Arc
async function checkBridgeActivity() {
  try {
    if (!provider) return null;

    const random = Math.random();
    if (random > 0.75) {
      const amount = 100000 + Math.random() * 4900000;
      return {
        source: 'bridge_activity',
        token: 'USDC',
        detail: `$${(amount/1000000).toFixed(1)}M USDC bridged into Arc from Ethereum — institutional capital inflow`,
        strength: amount > 2000000 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 5: Funding rate anomalies
async function checkFundingRates() {
  try {
    const tokens = ['BTC', 'ETH', 'SOL', 'ARB', 'OP', 'AVAX', 'MATIC', 'SEI', 'TIA', 'EIGEN', 'DOGE', 'LINK', 'UNI', 'AAVE', 'DOT', 'NEAR', 'INJ', 'SUI', 'APT', 'ATOM'];
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const symbol = `${token}USDT`;

    // Real funding rate data from a randomly chosen major exchange each call -
    // no key required for any of these three. If the picked exchange doesn't
    // have a perpetual for this token, we get null and move on, same as any
    // other source's error handling.
    const exchanges = [
      {
        name: 'Binance',
        fetch: async () => {
          const resp = await axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol }, timeout: 8000 });
          return parseFloat(resp.data.lastFundingRate);
        },
      },
      {
        name: 'Bybit',
        fetch: async () => {
          const resp = await axios.get('https://api.bybit.com/v5/market/tickers', { params: { category: 'linear', symbol }, timeout: 8000 });
          const item = resp.data?.result?.list?.[0];
          return item ? parseFloat(item.fundingRate) : NaN;
        },
      },
      {
        name: 'OKX',
        fetch: async () => {
          const instId = `${token}-USDT-SWAP`;
          const resp = await axios.get('https://www.okx.com/api/v5/public/funding-rate', { params: { instId }, timeout: 8000 });
          const item = resp.data?.data?.[0];
          return item ? parseFloat(item.fundingRate) : NaN;
        },
      },
    ];

    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const rate8h = await exchange.fetch();
    if (Number.isNaN(rate8h)) return null;

    const annualized = rate8h * 3 * 365; // all three settle funding 3x/day

    if (Math.abs(annualized) > 0.10) {
      const direction = annualized > 0 ? 'positive' : 'negative';
      return {
        source: 'funding_rate',
        token,
        detail: `$${token} perp funding rate on ${exchange.name} hits ${(annualized * 100).toFixed(2)}% annualized (${direction}) — ${annualized > 0 ? 'heavy long bias, potential squeeze' : 'shorts dominant, reversal possible'}`,
        strength: Math.abs(annualized) > 0.20 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    await log('WARN', `Funding rate check failed: ${e.message}`);
    return null;
  }
}

// Source 6: Social momentum (simulated keyword detection)
async function checkSocialMomentum() {
  try {
    const keywords = [
      '$BTC ETF flows', '$ETH staking', '$SOL network activity', '$ARB launch', '$OP airdrop',
      '$AVAX subnets', '$TIA staking', '$EIGEN restaking', '$DOGE community', '$LINK oracle',
      'Circle USDC', 'Arc testnet',
    ];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    const spikePct = 200 + Math.random() * 800;

    if (Math.random() > 0.7) {
      return {
        source: 'social_momentum',
        token: keyword.replace('$', '').split(' ')[0],
        detail: `"${keyword}" mentions spiked ${spikePct.toFixed(0)}% on X/Twitter in last 30min — narrative forming`,
        strength: spikePct > 600 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 7: GitHub commit activity — REAL data via the public GitHub API
async function checkGithubActivity() {
  try {
    const repos = [
      { name: 'Layr-Labs/eigenlayer-contracts', token: 'EIGEN' },
      { name: 'OffchainLabs/arbitrum', token: 'ARB' },
      { name: 'ethereum-optimism/optimism', token: 'OP' },
      { name: 'celestiaorg/celestia-core', token: 'TIA' },
      { name: 'ava-labs/avalanchego', token: 'AVAX' },
      { name: 'sei-protocol/sei-chain', token: 'SEI' },
      { name: 'paritytech/polkadot-sdk', token: 'DOT' },
      { name: 'near/nearcore', token: 'NEAR' },
      { name: 'InjectiveFoundation/injective-core', token: 'INJ' },
      { name: 'MystenLabs/sui', token: 'SUI' },
      { name: 'aptos-labs/aptos-core', token: 'APT' },
      { name: 'smartcontractkit/chainlink', token: 'LINK' },
      { name: 'Uniswap/v4-core', token: 'UNI' },
      { name: 'aave/aave-v3-core', token: 'AAVE' },
      { name: 'cosmos/cosmos-sdk', token: 'ATOM' },
      { name: 'filecoin-project/lotus', token: 'FIL' },
    ];

    const repo = repos[Math.floor(Math.random() * repos.length)];
    const now = Date.now();
    const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000).toISOString();
    const threeWeeksAgo = new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString();

    const ghHeaders = { 'User-Agent': 'AlphaChef-Agent' };
    if (process.env.GITHUB_TOKEN) ghHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const recentResp = await axios.get(
      `https://api.github.com/repos/${repo.name}/commits`,
      { params: { since: fourHoursAgo, per_page: 100 }, headers: ghHeaders, timeout: 8000 }
    );
    const recentCommits = recentResp.data.length;

    if (recentCommits < 5) return null; // not enough recent activity to matter

    const priorResp = await axios.get(
      `https://api.github.com/repos/${repo.name}/commits`,
      { params: { since: threeWeeksAgo, until: fourHoursAgo, per_page: 10 }, headers: ghHeaders, timeout: 8000 }
    );
    const wasDormant = priorResp.data.length <= 2; // near-zero activity before this burst

    if (!wasDormant) return null; // steady active repo, not a notable spike

    return {
      source: 'github_activity',
      token: repo.token,
      detail: `${repo.name} had ${recentCommits} commits in last 4h after ~3 weeks dormant — major update incoming`,
      strength: recentCommits > 15 ? 3 : 2,
    };
  } catch (e) {
    await log('WARN', `GitHub activity check failed: ${e.message}`);
    return null;
  }
}

// Source 8: Exchange inflows/outflows
async function checkExchangeFlows() {
  try {
    if (Math.random() > 0.75) {
      const tokens = ['BTC', 'ETH', 'SOL', 'ARB', 'OP', 'AVAX', 'MATIC', 'SEI', 'TIA', 'EIGEN', 'DOGE', 'LINK', 'UNI', 'AAVE', 'DOT', 'NEAR', 'INJ', 'SUI', 'APT', 'ATOM'];
      const token = tokens[Math.floor(Math.random() * tokens.length)];
      const amount = 1000 + Math.random() * 9000;
      const isInflow = Math.random() > 0.5;

      return {
        source: 'exchange_flows',
        token,
        detail: `${amount.toFixed(0)} $${token} ${isInflow ? 'moved TO' : 'withdrawn FROM'} major exchange — ${isInflow ? 'sell pressure building' : 'potential bullish signal'}`,
        strength: amount > 7000 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

function buildFallbackTitle(signals, token) {
  const primary = signals[0];
  const sourceLabels = {
    smart_money: 'Whale Wallets Are Moving',
    token_accumulation: 'Quiet Accumulation Underway',
    liquidity_event: 'New Liquidity Just Landed',
    bridge_activity: 'Capital Is Flowing In',
    funding_rate: 'Funding Just Snapped',
    social_momentum: 'The Timeline Noticed First',
    github_activity: 'Something Shipped Overnight',
    exchange_flows: 'Exchange Balances Are Shifting',
  };
  const action = sourceLabels[primary?.source] || 'Something Is Happening';
  return `$${token}: ${action}`;
}

function buildFallback(signals, token, confidence) {
  const sourceSummary = signals.map(s => `- ${s.source}: ${s.detail}`).join('\n');
  return {
    title: buildFallbackTitle(signals, token),
    teaser: `Multiple independent sources just lit up around $${token} at the same time...`,
    full_analysis: `## What Happened\n${sourceSummary}\n\n## Why It Matters\nMultiple independent sources converging on the same token at the same time is the signal — no single data point here is conclusive on its own.`,
    agent_reasoning: signals.map(s => `Independent confirmation from ${s.source.replace(/_/g, ' ')} reduces the odds this is noise or a single-source false positive.`).join('\n'),
    verdict: `${confidence === 'HIGH' ? 'Moderate' : 'Low'} Conviction — generated from raw signal data; full model reasoning was unavailable for this report.`,
    confidence,
  };
}

function isCuriositySafe(text) {
  if (!text) return false;
  if (/\d/.test(text)) return false;   // no numbers, percentages, or counts
  if (/[\[\]]/.test(text)) return false; // no confidence-tier brackets like [HIGH]
  return true;
}

async function writeAnalysis(signals) {
  const sourceSummary = signals.map(s => `- [${s.source}] ${s.detail} (strength ${s.strength}/3)`).join('\n');
  const token = signals[0]?.token || 'UNKNOWN';
  const totalStrength = signals.reduce((sum, s) => sum + s.strength, 0);
  const confidence = totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW';
  const sourceCount = signals.length;

  if (!groq) {
    return buildFallback(signals, token, confidence);
  }

  const lengthGuidance = sourceCount >= 4
    ? '4-5 sections — this is a major, multi-source convergence, give it full analytical depth.'
    : sourceCount === 3
    ? '2-3 sections — solid convergence, moderate depth. Do not pad it out.'
    : '1-2 sections — a simple two-source signal. Keep it short. A short report is correct here, not a failure.';

  const prompt = `You are AlphaChef, an autonomous on-chain signal analyst. Write like Bloomberg Intelligence, Nansen Research, or Arkham Intelligence — concise, confident, analytical. Never write like a blog or like ChatGPT. Every sentence must add new information; never restate the same fact twice across sections.

DETECTED SIGNALS (raw data — do not just repeat this back verbatim):
${sourceSummary}

TOKEN: $${token}
CORROBORATING SOURCES: ${sourceCount}
CONFIDENCE TIER: ${confidence}

Return a JSON object with exactly these fields:

"title" — under 80 chars. Must create CURIOSITY that something notable is happening to $${token}, WITHOUT revealing direction (bullish/bearish), the conclusion, or specific numbers. Think Bloomberg terminal headline, not a data dump.
  GOOD: "$${token} Is Suddenly Everyone's Problem", "Something Is Building Under $${token}"
  BAD (gives away the analysis): "3 Whale Wallets Accumulating $${token} — $4.2M in 48hrs", "HIGH: $${token} — 2 Sources Converging"

"teaser" — exactly ONE sentence. Confirms something happened. Reveals zero specifics on direction, magnitude, or conclusion. Should make someone want to know what. End with "..." or no punctuation.

"sections" — an array of {"heading": "...", "body": "..."} objects. ${lengthGuidance} Headings are 2-4 words (e.g. "What Happened", "Why It Matters", "The Setup", "What Could Go Wrong"). Bodies are 2-4 dense sentences. First section states facts plainly; later sections explain significance — do not just re-list the raw signals.

"agent_reasoning" — newline-separated, one line per source. For EACH source explain WHY it moves conviction — the underlying market logic — not what the data literally says (that's already covered in sections).
  Write like: "Large liquidity additions typically signal serious market participants entering, not retail speculation."
  Not like: "$557K liquidity pool was created" (that's just restating the fact).

"verdict" — one or two sentences. Must start with "High Conviction", "Moderate Conviction", or "Low Conviction", then a dash, then the reasoning for that specific level. This is about signal quality, not a price prediction — never sound certain about market direction.
  Example: "Moderate Conviction — two independent sources agree, but funding-rate data alone has a history of false positives."

Respond with ONLY the JSON object, no markdown fences, no commentary.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    const sections = Array.isArray(result.sections) ? result.sections : [];
    const full_analysis = sections.map(s => `## ${s.heading}\n${s.body}`).join('\n\n');

    const safeTitle = isCuriositySafe(result.title) ? result.title : buildFallbackTitle(signals, token);
    const safeTeaser = isCuriositySafe(result.teaser) ? result.teaser : `Multiple sources just lit up around $${token}...`;

    return {
      title: safeTitle,
      teaser: safeTeaser,
      full_analysis: full_analysis || sourceSummary,
      agent_reasoning: result.agent_reasoning || signals.map(s => s.detail).join('\n'),
      verdict: result.verdict || `${confidence === 'HIGH' ? 'Moderate' : 'Low'} Conviction — reasoning unavailable.`,
      confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(result.confidence) ? result.confidence : confidence,
    };
  } catch (e) {
    await log('WARN', `Groq API failed: ${e.message}`);
    return buildFallback(signals, token, confidence);
  }
}

async function registerOnChain(signalId, priceUsdc6) {
  if (!contract) return null;
  try {
    const tx = await contract.registerSignal(signalId, priceUsdc6);
    const receipt = await tx.wait();
    await log('INFO', `Signal ${signalId} registered on-chain: ${receipt.hash}`);
    return receipt.hash;
  } catch (e) {
    await log('WARN', `On-chain registration failed: ${e.message}`);
    return null;
  }
}

async function publishSignal(analysis, signals, priceUsdc) {
  await log('INFO', `DIAGNOSTIC: analysis.verdict = ${JSON.stringify(analysis.verdict)} | typeof = ${typeof analysis.verdict} | title = ${analysis.title}`);
  const signalId = uuidv4();
  const priceUsdc6 = BigInt(Math.round(priceUsdc * 1_000_000)); // 6 decimals

  let txHash = null;
  if (process.env.PRIVATE_KEY) {
    txHash = await registerOnChain(signalId, priceUsdc6);
  }

  try {
    const resp = await axios.post(`${BACKEND_URL}/api/signals`, {
      title: analysis.title,
      teaser: analysis.teaser,
      full_analysis: analysis.full_analysis,
      agent_reasoning: analysis.agent_reasoning,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      price_usdc: priceUsdc,
      sources: signals.map(s => s.source),
      token: signals[0]?.token,
      tx_hash: txHash,
      contract_signal_id: signalId,
    }, {
      headers: { 'x-agent-secret': AGENT_SECRET },
      timeout: 10000,
    });

    await log('INFO', `✅ Published signal: ${analysis.title} [${analysis.confidence}] $${priceUsdc} USDC`);
    return resp.data;
  } catch (e) {
    await log('ERROR', `Failed to publish signal: ${e.message}`);
    return null;
  }
}

const COOLDOWN_HOURS = 4;
const CONFIDENCE_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

async function getLastPublishedForToken(token) {
  try {
    const { data } = await axios.get(`${BACKEND_URL}/api/signals`, { timeout: 5000 });
    return data.find(s => s.token === token) || null;
  } catch (e) {
    await log('WARN', `Could not check publish history: ${e.message}`);
    return null; // fail open - a check failure should never block a genuine signal
  }
}

async function runAgentLoop() {
  await log('INFO', '\ud83c\udf73 AlphaChef agent loop starting...');

  const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.allSettled([
    checkSmartMoney(),
    checkTokenAccumulation(),
    checkLiquidityEvents(),
    checkBridgeActivity(),
    checkFundingRates(),
    checkSocialMomentum(),
    checkGithubActivity(),
    checkExchangeFlows(),
  ]);

  const rawSignals = [s1, s2, s3, s4, s5, s6, s7, s8]
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  await log('INFO', `Found ${rawSignals.length} raw signals`);

  if (rawSignals.length < 2) {
    await log('INFO', 'Insufficient signal convergence - skipping publish');
    return;
  }

  // Group signals by token - only genuine multi-source convergence on the
  // SAME token counts. Forcing together two unrelated single-source signals
  // from different tokens is not real convergence and was inflating volume.
  const tokenGroups = {};
  for (const sig of rawSignals) {
    const token = sig.token || 'MULTI';
    if (!tokenGroups[token]) tokenGroups[token] = [];
    tokenGroups[token].push(sig);
  }

  let bestGroup = null;
  let bestStrength = 0;
  for (const [, sigs] of Object.entries(tokenGroups)) {
    if (sigs.length >= 2) {
      const strength = sigs.reduce((sum, s) => sum + s.strength, 0);
      if (strength > bestStrength) {
        bestStrength = strength;
        bestGroup = sigs;
      }
    }
  }

  if (!bestGroup) {
    await log('INFO', 'No genuine multi-source convergence on any single token - skipping publish (quality over volume)');
    return;
  }

  const bestToken = bestGroup[0].token || 'MULTI';
  const totalStrength = bestGroup.reduce((sum, s) => sum + s.strength, 0);
  const confidence = totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW';

  // Cooldown - don't re-announce the same token repeatedly unless the new
  // read is a genuine escalation in confidence tier.
  const lastForToken = await getLastPublishedForToken(bestToken);
  if (lastForToken && lastForToken.created_at) {
    const hoursSince = (Date.now() - new Date(lastForToken.created_at).getTime()) / (1000 * 60 * 60);
    const isEscalating = CONFIDENCE_RANK[confidence] > (CONFIDENCE_RANK[lastForToken.confidence] || 0);
    if (hoursSince < COOLDOWN_HOURS && !isEscalating) {
      await log('INFO', `Cooldown active for $${bestToken} (${hoursSince.toFixed(1)}h since last signal, not escalating) - skipping to avoid repetitive noise`);
      return;
    }
  }

  const priceMap = { HIGH: 0.05, MEDIUM: 0.03, LOW: 0.01 };
  const priceUsdc = priceMap[confidence];

  await log('INFO', `Publishing ${confidence} signal from ${bestGroup.length} sources - $${priceUsdc} USDC`);

  // Reserve Groq calls for signals worth writing about - LOW tier uses the
  // clean fallback template instead of spending API budget on it.
  const analysis = confidence === 'LOW'
    ? buildFallback(bestGroup, bestToken, confidence)
    : await writeAnalysis(bestGroup);

  await publishSignal(analysis, bestGroup, priceUsdc);
}

async function seedInitialSignals() {
  try {
    const resp = await axios.get(`${BACKEND_URL}/api/signals`, { timeout: 5000 });
    if (resp.data.length > 0) return;
  } catch (_) {
    // backend not ready yet, retry
    await new Promise(r => setTimeout(r, 3000));
  }

  await log('INFO', '🌱 Seeding initial signals...');

  const seedSignals = [
    {
      group: [
        { source: 'smart_money', token: 'EIGEN', detail: 'Smart money wallet 0x47ac... opened $2.1M EIGEN position across 8 transactions', strength: 3 },
        { source: 'token_accumulation', token: 'EIGEN', detail: 'EIGEN DEX buy pressure at 91.4% over last 3h on major DEXs', strength: 3 },
        { source: 'github_activity', token: 'EIGEN', detail: 'eigenlayer-contracts: 18 commits in 6h after 2 weeks dormant — major protocol upgrade incoming', strength: 2 },
      ],
    },
    {
      group: [
        { source: 'bridge_activity', token: 'USDC', detail: '$4.2M USDC bridged into Arc from Ethereum in last 2 hours — institutional capital inflow', strength: 3 },
        { source: 'liquidity_event', token: 'ARC', detail: 'New ARC/USDC pool created with $850K initial liquidity on Arc DEX', strength: 2 },
      ],
    },
    {
      group: [
        { source: 'funding_rate', token: 'ETH', detail: 'ETH perp funding rate hits -8.4% (negative) — shorts dominant, reversal squeeze incoming', strength: 3 },
        { source: 'exchange_flows', token: 'ETH', detail: '7,840 ETH withdrawn from Binance in last 4h — moving to cold storage (bullish)', strength: 3 },
        { source: 'social_momentum', token: 'ETH', detail: '"ETH" mentions spiked 743% on X in last 30min — narrative forming', strength: 2 },
      ],
    },
  ];

  for (const seed of seedSignals) {
    const analysis = await writeAnalysis(seed.group);
    const confidence = analysis.confidence;
    const priceMap = { HIGH: 0.05, MEDIUM: 0.03, LOW: 0.01 };
    await publishSignal(analysis, seed.group, priceMap[confidence]);
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function main() {
  await initChain();

  // Wait for backend to be ready
  let retries = 0;
  while (retries < 10) {
    try {
      await axios.get(`${BACKEND_URL}/api/stats`, { timeout: 3000 });
      break;
    } catch (_) {
      retries++;
      await log('INFO', `Waiting for backend... (${retries}/10)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await seedInitialSignals();

  // Run immediately then every 30 minutes
  await runAgentLoop();
  cron.schedule('*/30 * * * *', runAgentLoop);

  await log('INFO', '🍳 AlphaChef agent is cooking. Signals every 30 minutes.');
}

main().catch(console.error);
