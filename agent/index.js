require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const cron = require('node-cron');
const { ethers } = require('ethers');
const Groq = require('groq-sdk');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = `http://localhost:${process.env.PORT || 3011}`;
const AGENT_SECRET = process.env.AGENT_SECRET || 'alphachef-agent-secret-2024';
const ARC_RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.fun';
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
    const block = await provider.getBlock(blockNumber, true);

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
    const mockTokens = ['EIGEN', 'ARB', 'OP', 'MATIC', 'AVAX', 'SEI', 'TIA'];
    const token = mockTokens[Math.floor(Math.random() * mockTokens.length)];
    const buyPressure = 60 + Math.random() * 40; // 60-100%

    if (buyPressure > 80) {
      return {
        source: 'token_accumulation',
        token,
        detail: `$${token} DEX buy pressure at ${buyPressure.toFixed(1)}% over last 2h — unusual accumulation pattern`,
        strength: buyPressure > 90 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 3: Liquidity events — new pools with large initial liquidity
async function checkLiquidityEvents() {
  try {
    const random = Math.random();
    if (random > 0.7) { // 30% chance of event
      const liquidityUsd = 100000 + Math.random() * 900000;
      const tokens = ['NEWTOKEN/USDC', 'LAUNCH/USDC', 'GEM/USDC', 'ALPHA/USDC'];
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
    const tokens = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE'];
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const rate = (Math.random() - 0.5) * 0.2; // -10% to +10% annualized

    if (Math.abs(rate) > 0.05) {
      const direction = rate > 0 ? 'positive' : 'negative';
      return {
        source: 'funding_rate',
        token,
        detail: `$${token} perp funding rate hits ${(rate * 100).toFixed(2)}% (${direction}) — ${rate > 0 ? 'heavy long bias, potential squeeze' : 'shorts dominant, reversal possible'}`,
        strength: Math.abs(rate) > 0.08 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 6: Social momentum (simulated keyword detection)
async function checkSocialMomentum() {
  try {
    const keywords = ['$EIGEN', '$ARB launch', '$OP airdrop', 'Circle USDC', 'Arc testnet', '$TIA staking'];
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

// Source 7: GitHub commit activity
async function checkGithubActivity() {
  try {
    const repos = [
      { name: 'eigenlayer/eigenlayer-contracts', token: 'EIGEN' },
      { name: 'OffchainLabs/arbitrum', token: 'ARB' },
      { name: 'ethereum-optimism/optimism', token: 'OP' },
      { name: 'celestiaorg/celestia-core', token: 'TIA' },
    ];

    if (Math.random() > 0.8) {
      const repo = repos[Math.floor(Math.random() * repos.length)];
      const commits = 5 + Math.floor(Math.random() * 20);
      return {
        source: 'github_activity',
        token: repo.token,
        detail: `${repo.name} had ${commits} commits in last 4h after 3 weeks dormant — major update incoming`,
        strength: commits > 15 ? 3 : 2,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Source 8: Exchange inflows/outflows
async function checkExchangeFlows() {
  try {
    if (Math.random() > 0.75) {
      const tokens = ['BTC', 'ETH', 'SOL'];
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

async function writeAnalysis(signals) {
  const sourceSummary = signals.map(s => `- ${s.source}: ${s.detail}`).join('\n');
  const token = signals[0]?.token || 'UNKNOWN';
  const totalStrength = signals.reduce((sum, s) => sum + s.strength, 0);

  if (!groq) {
    // Fallback analysis when no Groq key
    const confidence = totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW';
    return {
      title: `${confidence} Signal: ${token} — Multiple On-Chain Catalysts Detected`,
      teaser: `${signals.length} corroborating sources detected unusual ${token} activity. ${signals[0]?.detail?.slice(0, 80)}...`,
      full_analysis: `## Analysis\n\nOur autonomous agent has detected corroborating signals across ${signals.length} independent sources:\n\n${sourceSummary}\n\n## What This Means\n\nWhen multiple independent sources confirm the same directional bias, it significantly reduces noise and increases signal quality. The convergence of ${signals.map(s => s.source).join(', ')} creates a high-conviction setup.\n\n## Risk Factors\n\n- On-chain data has inherent delays\n- Social signals can be manufactured\n- Always size positions appropriately`,
      agent_reasoning: signals.map(s => s.detail).join('\n'),
      confidence,
    };
  }

  try {
    const prompt = `You are AlphaChef, an on-chain alpha signal analyst. Write a concise alpha signal report.

DETECTED SIGNALS:
${sourceSummary}

TOKEN: ${token}
NUMBER OF CORROBORATING SOURCES: ${signals.length}
TOTAL SIGNAL STRENGTH: ${totalStrength}/9

Write:
1. A punchy title (under 80 chars)
2. A teaser (1 sentence, the hook, ends with "...")
3. Full analysis (3-4 paragraphs, plain English, specific numbers, actionable)
4. Confidence: ${totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW'}

Format as JSON: { "title": "...", "teaser": "...", "full_analysis": "...", "confidence": "HIGH|MEDIUM|LOW" }`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return {
      title: result.title || `Signal: ${token} — ${signals.length} sources converging`,
      teaser: result.teaser || signals[0]?.detail,
      full_analysis: result.full_analysis || sourceSummary,
      agent_reasoning: signals.map(s => s.detail).join('\n'),
      confidence: result.confidence || (totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW'),
    };
  } catch (e) {
    await log('WARN', `Groq API failed: ${e.message}`);
    const confidence = totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW';
    return {
      title: `${confidence}: ${token} — ${signals.length} Sources Converging`,
      teaser: signals[0]?.detail?.slice(0, 120) + '...',
      full_analysis: `Multiple on-chain and social sources have converged on $${token}:\n\n${sourceSummary}`,
      agent_reasoning: signals.map(s => s.detail).join('\n'),
      confidence,
    };
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

async function runAgentLoop() {
  await log('INFO', '🍳 AlphaChef agent loop starting...');

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
    await log('INFO', 'Insufficient signal convergence — skipping publish');
    return;
  }

  // Group signals by token and pick highest conviction
  const tokenGroups = {};
  for (const sig of rawSignals) {
    const token = sig.token || 'MULTI';
    if (!tokenGroups[token]) tokenGroups[token] = [];
    tokenGroups[token].push(sig);
  }

  // Find best group with 2+ sources
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

  // If no single token has 2+ signals, take top 2 highest strength signals
  if (!bestGroup) {
    rawSignals.sort((a, b) => b.strength - a.strength);
    bestGroup = rawSignals.slice(0, 2);
  }

  const totalStrength = bestGroup.reduce((sum, s) => sum + s.strength, 0);
  const confidence = totalStrength >= 6 ? 'HIGH' : totalStrength >= 4 ? 'MEDIUM' : 'LOW';
  const priceMap = { HIGH: 0.05, MEDIUM: 0.03, LOW: 0.01 };
  const priceUsdc = priceMap[confidence];

  await log('INFO', `Publishing ${confidence} signal from ${bestGroup.length} sources — $${priceUsdc} USDC`);

  const analysis = await writeAnalysis(bestGroup);
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

  // Run immediately then every 5 minutes
  await runAgentLoop();
  cron.schedule('*/5 * * * *', runAgentLoop);

  await log('INFO', '🍳 AlphaChef agent is cooking. Signals every 5 minutes.');
}

main().catch(console.error);
