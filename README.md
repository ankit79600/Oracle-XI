# Oracle XI — AI World Cup Analyst on Injective

> **Injective Global Cup Hackathon 2026**
> Premium AI football predictions, pay-per-call via x402, settled on the Injective blockchain.

[![CI](https://github.com/ankit79600/Oracle-XI/actions/workflows/ci.yml/badge.svg)](https://github.com/ankit79600/Oracle-XI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

---

## What It Does

Oracle XI is an **AI sports analyst** packaged as an MCP (Model Context Protocol) server. It answers questions like "Who wins England vs Germany and why?" using live World Cup data from [football-data.org](https://www.football-data.org), backed by Claude Opus 4.8 with extended thinking. Premium prediction tools are gated behind **x402 micropayments** that settle on the Injective EVM testnet in ~650ms.

### The real-world problem

World Cup match prediction is a billion-dollar market dominated by closed systems. Oracle XI opens it up: any AI agent can pay for a data-backed prediction atomically, without an account, without a subscription, and without human approval — just a signed USDC transfer on Injective.

---

## Injective Technology Used

### 1. Tiered x402 Pay-Per-Call

Prediction tools are gated behind the [x402 HTTP payment protocol](https://injective.com/blog/x402) using `@injectivelabs/x402`. Two price tiers:

| Tier | Model | Price | Tool |
|---|---|---|---|
| **Quick** | Claude Haiku 4.5 | 0.003 USDC | `predict_quick` → `GET /predict/quick` |
| **Pro** | Claude Opus 4.8 + extended thinking | 0.01 USDC | `predict_pro` → `GET /predict` |
| **Pro Stream** | Claude Opus 4.8 + extended thinking | 0.01 USDC | `GET /predict/stream` (SSE) |

The full EIP-3009 flow for every paid call:

1. Client sends `GET /predict[/quick]` to Oracle API.
2. API returns `HTTP 402` with a `PAYMENT-REQUIRED` header (price, token, recipient, network).
3. MCP server's x402 client (`createInjectiveClient`) signs an **EIP-3009 `transferWithAuthorization`** off-chain — no gas needed from the payer.
4. Client retries with the signed payload in `PAYMENT-SIGNATURE`.
5. Oracle API's inline **facilitator** wallet submits `transferWithAuthorization` on Injective EVM testnet, paying INJ gas.
6. USDC is transferred; prediction JSON is returned with a `PAYMENT-RESPONSE` receipt.

> **Why USDC, not USDT?** `@injectivelabs/x402` requires EIP-3009 `transferWithAuthorization`. Native testnet USDC (Circle FiatTokenV2_2) supports it; IBC-bridged USDT does not.  
> Token address: `0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d`

### 2. MCP Server (v2.0)

Eight tools across two tiers:

| Tool | Tier | Description |
|---|---|---|
| `get_fixtures` | Free | Upcoming/recent match schedule |
| `get_standings` | Free | Live league table with form |
| `head_to_head` | Free | Historical H2H between two teams |
| `live_scores` | Free | Matches currently in play with minute |
| `top_scorers` | Free | Golden boot leaderboard for any competition |
| `team_form` | Free | Last N results for a team (W/D/L breakdown) |
| `predict_quick` | **x402 — 0.003 USDC** | AI prediction via Haiku 4.5 (fast) |
| `predict_pro` | **x402 — 0.01 USDC** | AI prediction via Opus 4.8 + extended thinking |

### 3. Extended Thinking (Pro Tier)

Pro predictions use Claude Opus 4.8 with a **5,000-token thinking budget**. The model reasons privately about standings, H2H history, and form before committing to a structured prediction — producing substantially more reliable win probabilities and score forecasts than single-pass generation.

### 4. Streaming Prediction Endpoint

`GET /predict/stream` is a **Server-Sent Events** endpoint at the pro price. It streams three event types in real time:

- `thinking` — Oracle's internal reasoning (shown as "Oracle is thinking...")
- `token` — analysis text, token by token
- `prediction` — final structured JSON once reasoning is complete

### 5. Injective EVM Testnet

All payments settle on the **Injective EVM Testnet** (chain ID 1439):

- RPC: `https://k8s.testnet.json-rpc.injective.network/`
- Explorer: [testnet.blockscout.injective.network](https://testnet.blockscout.injective.network)
- Payment token: **USDC** at `0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d`

---

## Architecture

```
Claude Desktop / Claude Code / Any MCP client
        │
        │  stdio (MCP protocol)
        ▼
┌─────────────────────────────────┐
│   Oracle MCP Server  v2.0       │  src/mcp/server.ts
│                                 │
│  Free:   get_fixtures           │
│          get_standings          │
│          head_to_head           │
│          live_scores            │
│          top_scorers            │
│          team_form              │
│                                 │
│  Paid:   predict_quick ─────────┼──► GET /predict/quick (0.003 USDC)
│          predict_pro ───────────┼──► GET /predict        (0.01 USDC)
└─────────────────────────────────┘
                 │ x402 client (EIP-3009 sign → retry)
                 ▼
┌─────────────────────────────────┐
│   Oracle API Server             │  src/api/server.ts
│   Express + payment middleware  │
│                                 │
│   GET /health        (free)     │
│   GET /fixtures      (free)     │
│   GET /standings     (free)     │
│   GET /h2h/:id       (free)     │
│   GET /live          (free)     │
│   GET /scorers/:comp (free)     │
│   GET /team-form     (free)     │
│   GET /predict/quick (x402)     │
│   GET /predict       (x402)     │
│   GET /predict/stream (x402 SSE)│
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
football-data.org   Anthropic Claude
(live match data)   Haiku 4.5 / Opus 4.8
                    + extended thinking
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- A funded Injective EVM testnet wallet ([faucet](https://testnet.faucet.injective.network/))
- [football-data.org](https://www.football-data.org) free API key (or `USE_MOCK_DATA=true`)
- Anthropic API key

### Install

```bash
git clone https://github.com/ankit79600/Oracle-XI.git
cd Oracle-XI
npm install
cp .env.example .env
```

### Configure `.env`

```bash
# Football data
FOOTBALL_DATA_API_KEY=your_key        # from football-data.org (free tier)
USE_MOCK_DATA=false                   # set true to skip football API entirely

# Injective wallets
PRIVATE_KEY=0x...                     # payer wallet — signs EIP-3009 auth (no gas needed)
X402_FACILITATOR_KEY=0x...            # pays INJ gas for settlement (can equal PRIVATE_KEY)
X402_RECIPIENT=0x...                  # oracle treasury wallet that receives USDC

# AI
ANTHROPIC_API_KEY=sk-ant-...

# x402 pricing (optional — defaults shown)
X402_PRICE=10000                      # 0.01 USDC pro tier (6 decimals)
X402_PRICE_QUICK=3000                 # 0.003 USDC quick tier

# Server (optional)
API_PORT=3002
DEMO_MODE=false                       # skip on-chain settlement (testnet fallback)
```

> **Get testnet USDC:** Visit [faucet.circle.com](https://faucet.circle.com), select "Injective Testnet". The facilitator wallet also needs testnet INJ for gas from [testnet.faucet.injective.network](https://testnet.faucet.injective.network/).

### Run

```bash
# Option A — both servers together
npm start

# Option B — individually
npm run start:api   # Terminal 1: Oracle API (x402-gated HTTP)
npm run start:mcp   # Terminal 2: Oracle MCP (stdio)

# Development (hot reload)
npm run dev:api
npm run dev:mcp
```

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "oracle-xi": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/Oracle-XI/src/mcp/server.ts"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "FOOTBALL_DATA_API_KEY": "...",
        "X402_RECIPIENT": "0x...",
        "API_PORT": "3002"
      }
    }
  }
}
```

Restart Claude Desktop. You will see "oracle-xi" in the MCP tools list with 8 tools.

### Try it

```
User: Show me live scores right now

[Claude calls live_scores — free, instant]

User: Who are the top scorers at the World Cup?

[Claude calls top_scorers(competition="WC") — free]

User: Show England's recent form

[Claude calls team_form(team="England") — free]

User: Who wins England vs Germany and why? (quick prediction)

[Claude calls predict_quick — x402: 0.003 USDC → Injective testnet]

User: Give me a deep analysis of Brazil vs Argentina

[Claude calls predict_pro — x402: 0.01 USDC, Opus 4.8 + extended thinking]
```

### Demo mode (no API keys needed)

```bash
USE_MOCK_DATA=true DEMO_MODE=true npm run start:api
USE_MOCK_DATA=true npm run start:mcp
```

The mock client provides realistic World Cup 2026 fixtures, standings, live scores, and top scorers. `DEMO_MODE=true` runs the full x402 handshake but skips on-chain settlement — useful when the testnet sequencer is degraded.

---

## API Reference

All endpoints are on `http://localhost:3002` by default.

### Free Endpoints

| Method | Path | Query params | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check, shows x402 config |
| `GET` | `/fixtures` | `competition`, `matchday` | Match schedule |
| `GET` | `/standings` | `competition` | League table |
| `GET` | `/h2h/:matchId` | `limit` | Head-to-head history |
| `GET` | `/live` | `competition` (optional) | In-play matches |
| `GET` | `/scorers/:competition` | — | Top goal scorers |
| `GET` | `/team-form` | `team`, `limit` | Last N results for a team |

### x402-Gated Endpoints

| Method | Path | Price | Model |
|---|---|---|---|
| `GET` | `/predict/quick` | 0.003 USDC | Haiku 4.5 |
| `GET` | `/predict` | 0.01 USDC | Opus 4.8 + extended thinking |
| `GET` | `/predict/stream` | 0.01 USDC | Opus 4.8 + extended thinking (SSE) |

Query params for all predict endpoints: `home`, `away`, `competition`

#### SSE Event Types (`/predict/stream`)

```
event: thinking   data: { "text": "..." }    # Oracle's reasoning (optional display)
event: token      data: { "text": "..." }    # Analysis text, streamed token by token
event: prediction data: { "data": {...}, "tier": "pro", ... }  # Final structured JSON
event: done       data: {}                   # Stream complete
event: error      data: { "message": "..." } # On failure
```

---

## Project Structure

```
Oracle-XI/
├── .github/
│   └── workflows/
│       └── ci.yml              # Suggested: typecheck + build on every push/PR
├── src/
│   ├── config.ts               # Env parsing and validation
│   ├── football/
│   │   ├── types.ts            # Shared interfaces (Fixture, Standing, TopScorer, ...)
│   │   ├── client.ts           # Live football-data.org client (serialised rate limiter, cache)
│   │   └── mock.ts             # Mock client for demos and testing
│   ├── prediction/
│   │   └── predictor.ts        # Tiered prediction (tool_use + Zod + extended thinking + stream)
│   ├── x402/
│   │   └── client.ts           # EIP-3009 pay-and-retry client
│   ├── api/
│   │   └── server.ts           # Express server: free routes + tiered x402 gates + SSE stream
│   └── mcp/
│       └── server.ts           # MCP stdio server (8 tools: 6 free + 2 paid)
├── .env.example
├── DEMO.md
├── package.json
└── tsconfig.json
```

---

## CI/CD Pipeline

> The project does not yet have a CI workflow file. Add `.github/workflows/ci.yml` to get automatic type-checking and build validation on every pull request.

### Suggested `ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build
```

### Suggested additional jobs once tests exist

```yaml
      - name: Unit tests
        run: npm test

      - name: Integration tests (mock mode)
        run: USE_MOCK_DATA=true npm run test:integration
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### GitHub Secrets to configure

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Used in CI for |
|---|---|
| `ANTHROPIC_API_KEY` | Integration tests with real LLM |
| `FOOTBALL_DATA_API_KEY` | Live API smoke tests (optional) |

Production deployment secrets (if self-hosting):

| Secret | Purpose |
|---|---|
| `PRIVATE_KEY` | Payer wallet for x402 |
| `X402_FACILITATOR_KEY` | Gas-paying facilitator wallet |
| `X402_RECIPIENT` | Treasury wallet receiving USDC |

### Recommended branch protection (Settings → Branches)

- Require CI to pass before merging to `main`
- Require at least 1 pull request review
- Restrict force-pushes to `main`

---

## What's Next (Recommended Improvements)

### Testing

The project currently has no test suite. Recommended additions:

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

- **Unit tests** for `predictor.ts` — mock the Anthropic client, test `normaliseProbs`, Zod validation, tier routing
- **Unit tests** for `MockFootballClient` — all 8 methods
- **Integration tests** for the API server — use `supertest` against a running Express instance with `USE_MOCK_DATA=true`
- **Rate limiter test** — assert concurrent calls are serialised without deadlock

### Linting

```bash
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

Add `lint` to the CI workflow to catch style issues before typecheck.

### Docker

```dockerfile
# Dockerfile (suggested)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/api/server.js"]
```

```yaml
# docker-compose.yml (suggested)
services:
  oracle-api:
    build: .
    ports: ["3002:3002"]
    env_file: .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### Observability

- Add request logging middleware (e.g. `morgan`) to the Express server
- Emit a structured log line for every x402 payment: `{ tier, payer, amount, txHash, latencyMs }`
- Track prediction latency per tier to compare Haiku vs Opus response times
- Consider [Prometheus](https://prometheus.io) metrics at `/metrics` for production monitoring

### Mainnet Readiness

- Switch `INJECTIVE_TESTNET_CAIP2` to `INJECTIVE_MAINNET_CAIP2` in `api/server.ts`
- Update `X402_TOKEN_ADDRESS` to the mainnet USDC address
- Update `RPC_URL` to a mainnet endpoint
- Audit `X402_PRICE` and `X402_PRICE_QUICK` for real-money amounts
- Add a hard cap on `budget_tokens` for extended thinking to control Anthropic API costs

### Dependabot

Add `.github/dependabot.yml` to auto-update npm dependencies weekly:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

---

## Rate Limits & Caching

football-data.org free tier: 10 requests/minute. The live client uses a **serialising promise chain** rate limiter — concurrent calls queue rather than bypass the 6.1s inter-request gap. Every response is cached for 5 minutes (`node-cache`). Set `USE_MOCK_DATA=true` to bypass entirely.

---

## Security Notes

- Never commit `.env` — it is in `.gitignore`
- `PRIVATE_KEY` only signs EIP-3009 authorisations; keep the wallet funded with minimal USDC
- `X402_FACILITATOR_KEY` pays INJ gas — keep it funded with small INJ only
- `@injectivelabs/x402` RC1 is used for the payment protocol; audit before mainnet use
- The Anthropic API key is server-side only — never exposed to MCP clients

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| MCP protocol | `@modelcontextprotocol/sdk` | 1.29.0 |
| AI predictions | `@anthropic-ai/sdk` | 0.112.3 |
| x402 payments | `@injectivelabs/x402` | 0.1.0-rc.1 |
| HTTP server | `express` | 4.x |
| Validation | `zod` | 3.x |
| EVM interaction | `viem` | 2.x |
| Football data | `football-data.org` v4 API | — |

---

## License

MIT
