#!/usr/bin/env python3
"""
Adds a dedicated, free A2MCP-compliant endpoint for OKX.AI ASP registration:
GET /api/mcp/signals

This is separate from your existing /api/signals (used by the website) so
it can be registered cleanly with OKX as "AlphaChef Signal Feed" without
mixing concerns. Free tier, no payment required, matches OKX's "just return
the result" pattern for free A2MCP services.

Tested against a copy of your actual backend/server.js before delivery.

USAGE (run from your project root):
    python3 add_mcp_endpoint.py
"""

import os
import shutil
import sys

ROOT = os.getcwd()


def require(condition, message):
    if not condition:
        print(f"\n[ABORTED] {message}")
        sys.exit(1)


def main():
    path = os.path.join(ROOT, "backend", "server.js")
    require(os.path.isfile(path), f"File not found: {path} — run this from your project root")

    with open(path) as f:
        content = f.read()

    old = "app.post('/api/unlock', async (req, res) => {"
    require(old in content, "insertion point not found — file structure may differ from expected")

    new = """// Free A2MCP endpoint for OKX.AI ASP registration — returns recent signal
// teasers as a standardized, agent-consumable JSON feed. No payment required;
// this is the "just return the result" free-tier pattern OKX.AI expects for
// A2MCP services. Full analysis still requires a paid unlock (see /api/unlock).
app.get('/api/mcp/signals', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const signals = db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({
    service: 'AlphaChef Signal Feed',
    description: 'Autonomous AI agent monitoring 8 on-chain and social sources for genuine multi-source token convergence. Returns recent signal teasers - full analysis and AI verdict require a paid unlock via Circle x402 on Arc testnet.',
    count: signals.length,
    signals: signals.map(s => ({
      id: s.id,
      title: s.title,
      teaser: s.teaser,
      token: s.token,
      confidence: s.confidence,
      unlock_price_usdc: s.price_usdc,
      published_at: s.created_at,
    })),
  });
});

app.post('/api/unlock', async (req, res) => {"""

    shutil.copy(path, path + ".bak6")
    print(f"backed up -> {path}.bak6")

    content = content.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(content)

    print(f"DONE -> added GET /api/mcp/signals to {path}")
    print("""
Next steps:
  node --check backend/server.js
  pm2 restart alphachef-backend

Test it once restarted:
  curl https://alphachef.site/api/mcp/signals

When OKX's registration flow asks for your endpoint URL, use:
  https://alphachef.site/api/mcp/signals
""")


if __name__ == "__main__":
    main()
