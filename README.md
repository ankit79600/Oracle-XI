# The Oracle — AI World Cup Analyst on Injective

> **Injective Global Cup Hackathon 2026**
> Premium AI football predictions, pay-per-call via x402, settled on the Injective blockchain.

---

## What It Does

The Oracle is an **AI sports analyst** packaged as an MCP (Model Context Protocol) server. It answers questions like "Who wins England vs Germany and why?" using live World Cup data from [football-data.org](https://www.football-data.org), then backs those predictions with an LLM reasoning layer. The premium `predict` tool is gated behind a **0.01 USDT x402 micropayment** that settles on the Injective EVM testnet in ~650ms.

### The real-world problem

World Cup match prediction is a billion-dollar market dominated by closed systems. The Oracle opens it up: any AI agent can pay for a data-backed prediction atomically, without an account, without a subscription, and without human approval — just a signed USDT transfer on Injective.

---

## Injective Technology Used

### 1. x402 Pay-Per-Call

The `predict` MCP tool is gated behind the [x402 HTTP payment protocol](https://injective.com/blog/x402) using `@injectivelabs/x402`. When called:

1. The MCP server sends `GET /predict` to the Oracle API server.
2. The Oracle API returns `HTTP 402` with a `PAYMENT-REQUIRED` header containing payment requirements (0.01 USDC, token address, recipient, network).
3. The MCP server's x402 client (`createInjectiveClient`) signs an **EIP-3009 `transferWithAuthorization`** off-chain — no gas needed for the payer, just a signature.
4. The client retries with the signed payload in the `PAYMENT-SIGNATURE` header.
5. The Oracle API's inline **facilitator** wallet submits the `transferWithAuthorization` on Injective EVM testnet (~650ms single-block finality), paying INJ gas on behalf of the payer.
6. USDC is transferred; the API returns the prediction with a `PAYMENT-RESPONSE` receipt header.

The Oracle API server uses `injectivePaymentMiddleware` from `@injectivelabs/x402/middleware`, which handles verification, settlement, and receipt generation.

> **Why USDC, not USDT?** The `@injectivelabs/x402` protocol requires EIP-3009 `transferWithAuthorization`. Native testnet USDC (Circle FiatTokenV2_2) supports EIP-3009; IBC-bridged USDT does not. Token address: `0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d`.

### 2. MCP Server

The Oracle is a standard MCP server running over stdio, compatible with Claude Desktop, Claude Code, and any MCP-capable agent. It exposes:

| Tool | Tier | Description |
|---|---|---|
| `get_fixtures` | Free | Upcoming/recent match schedule |
| `get_standings` | Free | Live league table with form |
| `head_to_head` | Free | Historical H2H between two teams |
| `predict` | **x402-gated** | AI prediction: win %, score, reasoning |

### 3. Agent Skills

The Oracle is packaged as an [Agent Skill](https://agentskills.io/specification) (`skills/oracle-xi/SKILL.md`). Any compatible agent (Claude Code, Cursor, Codex CLI) can discover and activate this skill, getting instructions on when and how to invoke each tool automatically.

### 4. Injective EVM Testnet

All payments settle on the **Injective EVM Testnet** (chain ID 1439):
- RPC: `https://k8s.testnet.json-rpc.injective.network/`
- Explorer: [testnet.blockscout.injective.network](https://testnet.blockscout.injective.network)
- Payment token: **USDC** at `0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d` (Circle FiatTokenV2_2, EIP-3009)

---

## Architecture

```
Claude Desktop / Claude Code
        │
        │  stdio (MCP protocol)
        ▼
   ┌─────────────────────────┐
   │   Oracle MCP Server     │  src/mcp/server.ts
   │   4 tools: fixtures,    │
   │   standings, h2h,       │
   │   predict               │
   └──────────┬──────────────┘
              │ GET /predict (x402 client)
              │  ① 402 response
              │  ② viem: send USDT on Injective
              │  ③ retry with X-PAYMENT header
              ▼
   ┌─────────────────────────┐
   │   Oracle API Server     │  src/api/server.ts
   │   Express + x402 gate   │
   │   on /predict route     │
   └──────────┬──────────────┘
              │
     ┌────────┴────────┐
     │                 │
     ▼                 ▼
football-data.org   Anthropic Claude
(live match data)   (LLM prediction)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- A funded Injective EVM testnet wallet ([faucet](https://testnet.faucet.injective.network/))
- [football-data.org](https://www.football-data.org) free API key (or set `USE_MOCK_DATA=true`)
- Anthropic API key

### Install

```bash
git clone https://github.com/your-org/oracle-xi
cd oracle-xi
npm install
cp .env.example .env
```

### Configure `.env`

```bash
FOOTBALL_DATA_API_KEY=your_key          # from football-data.org
PRIVATE_KEY=0x...                       # Injective testnet wallet (payer — signs EIP-3009 auth)
X402_FACILITATOR_KEY=0x...              # wallet that pays INJ gas for settlement (can = PRIVATE_KEY)
X402_RECIPIENT=0x...                    # oracle treasury wallet (receives USDC)
ANTHROPIC_API_KEY=sk-ant-...
USE_MOCK_DATA=false                     # set true to skip football API
```

All other values have working testnet defaults.

> **Get testnet USDC:** The payer wallet needs USDC on Injective EVM testnet. Visit [faucet.circle.com](https://faucet.circle.com) and select "Injective Testnet" to receive test USDC. The faucet wallet also needs testnet INJ for gas (from [testnet.faucet.injective.network](https://testnet.faucet.injective.network/)). Note: testnet USDT from the Injective faucet **cannot** be used with x402 (no EIP-3009).

### Run

```bash
# Terminal 1 — Oracle API server (x402-gated HTTP)
npm run start:api

# Terminal 2 — Oracle MCP server (stdio)
npm run start:mcp
```

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "oracle-xi": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/oracle-xi/src/mcp/server.ts"],
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

Restart Claude Desktop. You should see "oracle-xi" in the MCP tools list.

### Try it

```
User: Who wins England vs Germany and why?

[Claude invokes predict tool]
[x402 payment: 0.01 USDT → Injective testnet, confirms in ~650ms]

Oracle: England win probability: 58%
        Germany: 28% | Draw: 14%
        Predicted score: 2-1
        ...
```

### Demo mode (no API keys needed)

```bash
USE_MOCK_DATA=true npm run start:api
USE_MOCK_DATA=true npm run start:mcp
```

The mock client provides realistic World Cup 2026 data without hitting any external API.

---

## Project Structure

```
oracle-xi/
├── src/
│   ├── config.ts               # Env validation
│   ├── football/
│   │   ├── types.ts            # Shared interfaces
│   │   ├── client.ts           # Live football-data.org client (rate-limited, cached)
│   │   └── mock.ts             # Mock client for demos
│   ├── prediction/
│   │   └── predictor.ts        # Claude prompt + structured JSON output
│   ├── x402/
│   │   └── client.ts           # viem x402 pay-and-retry client
│   ├── api/
│   │   └── server.ts           # Express server with x402 gate on /predict
│   └── mcp/
│       └── server.ts           # MCP stdio server (4 tools)
├── skills/
│   └── oracle-xi/
│       └── SKILL.md            # Agent Skill packaging
├── .env.example
└── README.md
```

---

## Security Notes

- Never commit `.env` (it's in `.gitignore`)
- The `PRIVATE_KEY` is only used to sign USDT payments; keep it in a testnet wallet with minimal funds
- `@injectivelabs/x402` is not among the packages affected by the July 2026 supply-chain incident; wallet-related `@injectivelabs` packages are avoided entirely (we use `viem` instead)

---

## Rate Limits & Caching

football-data.org free tier: 10 requests/minute. The live client caches every response for 5 minutes and enforces a 6.1s inter-request gap with a queue. Use `USE_MOCK_DATA=true` to bypass entirely.

---

## License

MIT
