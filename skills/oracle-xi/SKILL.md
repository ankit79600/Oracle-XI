---
name: oracle-xi
description: >
  AI-powered football match analyst and World Cup predictor backed by live
  football-data.org data and Injective x402 micropayments. Use this skill
  when the user asks about football fixtures, league standings, head-to-head
  records, or match predictions. The premium predict tool costs 0.01 USDT per
  call settled on Injective EVM testnet.
license: MIT
compatibility: >
  Requires Node.js 20+, a running Oracle XI API server (npm run start:api),
  and the MCP server registered in your Claude Desktop or Claude CLI config.
  Set USE_MOCK_DATA=true to run without an API key or real payments.
metadata:
  author: oracle-xi
  version: "1.0.0"
  chain: injective-evm-testnet
  chain-id: "1439"
  payment-token: USDC
  payment-amount: "0.01 USDC per predict call (EIP-3009 on Injective EVM testnet)"
  mcp-server: oracle-xi
---

# Oracle XI — Injective Agent Skill

You are operating the Oracle XI skill: an AI World Cup analyst that fetches
live football data and generates x402-gated match predictions settled on the
Injective blockchain.

## Available Tools

### get_fixtures
Fetch the match schedule for a competition.
- `competition` — code like `WC`, `PL`, `CL`, `BL1`, `PD`, `SA`, `FL1`
- `matchday` — optional specific matchday

**When to use:** user asks "when does X play next", "show me World Cup fixtures",
"what matches are on this week".

### get_standings
Fetch the current league table.
- `competition` — competition code

**When to use:** user asks "who's top of the table", "show standings", "what
position is X in".

### head_to_head
Fetch historical H2H record for a match.
- `matchId` — from get_fixtures output
- `limit` — max past meetings (default 10)

**When to use:** user asks "what's the H2H between X and Y", "who has the
better record". Always call get_fixtures first to get the matchId.

### predict
Premium AI prediction for a match (x402-gated: 0.01 USDC on Injective EVM testnet).
- `homeTeam` — e.g. "England"
- `awayTeam` — e.g. "Germany"
- `competition` — context string (default "FIFA World Cup 2026")

**When to use:** user asks "who wins X vs Y", "give me a prediction",
"what are the odds". Payment is signed automatically via EIP-3009 using PRIVATE_KEY;
no gas required from the payer wallet.

## Typical workflow

1. Call `get_fixtures` to confirm the match exists and get the match ID.
2. Call `get_standings` to pull current form/position data.
3. Call `head_to_head` with the match ID.
4. Call `predict` — the tool automatically triggers x402 payment, waits for
   confirmation on Injective EVM testnet, then returns the AI analysis.

## Setup

```bash
git clone https://github.com/your-org/oracle-xi
cd oracle-xi
npm install
cp .env.example .env
# Fill in FOOTBALL_DATA_API_KEY, PRIVATE_KEY, ANTHROPIC_API_KEY, X402_RECIPIENT

# Terminal 1: Oracle API server (x402-gated)
npm run start:api

# Terminal 2: MCP server
npm run start:mcp
```

Register the MCP server in Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "oracle-xi": {
      "command": "npx",
      "args": ["tsx", "/path/to/oracle-xi/src/mcp/server.ts"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "FOOTBALL_DATA_API_KEY": "...",
        "X402_RECIPIENT": "0x..."
      }
    }
  }
}
```

Or install as a Claude Code skill by copying `skills/oracle-xi/` to
`~/.claude/skills/oracle-xi/`.

## Mock mode

Set `USE_MOCK_DATA=true` to skip the football API entirely. The predict tool
still executes the real x402 payment and LLM call; only the data source is fake.
Perfect for demos without burning rate limits.
