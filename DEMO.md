# The Oracle — 60-Second Demo Script

> A screen recording walkthrough showing The Oracle's full x402 payment flow on Injective.

---

## Setup (before recording)

1. `cp .env.example .env` and fill in all keys
2. Terminal 1: `npm run start:api` — confirm `Oracle API running on http://localhost:3002`
3. Terminal 2: `npm run start:mcp` — confirm `Oracle XI MCP server running (stdio)`
4. Claude Desktop open with oracle-xi MCP server connected (hammer icon in toolbar)

---

## Script (60 seconds)

### [0:00–0:05] Title card

> "The Oracle — AI World Cup analyst on Injective. Live demo."

Show the Claude Desktop window with the oracle-xi MCP tools visible.

---

### [0:05–0:12] Free tool — fixtures

User types in Claude:

> "Show me the upcoming World Cup fixtures"

Claude calls `get_fixtures` (no payment). Response appears instantly:
```
2026-07-20 | England          vs Germany          | SCHEDULED
2026-07-22 | Brazil           vs Argentina        | SCHEDULED
...
```

Narrate: *"Free tool — live data from football-data.org, no payment needed."*

---

### [0:12–0:20] Free tool — standings

User types:

> "What's the World Cup standings?"

Claude calls `get_standings`. Table appears with positions, points, GD, form.

Narrate: *"Still free. England top, Germany second."*

---

### [0:20–0:50] Premium tool — predict (x402 payment live)

User types:

> "Who wins England vs Germany in the World Cup, and why?"

Claude calls `predict`. Switch to Terminal 1 (API server). Watch logs appear:

```
[oracle-api] PAYMENT-SIGNATURE received; verifying with facilitator...
[oracle-api] EIP-3009 authorization verified; submitting transferWithAuthorization...
[oracle-api] Payment settled: tx=0xabc123... payer=0x126fF3...
```

**Cut to Injective testnet explorer** (`testnet.blockscout.injective.network`):
Search for the tx hash. Show the USDC `transferWithAuthorization` call: 0.01 USDC
from payer wallet to treasury wallet, confirmed in 1 block (~650ms).

Switch back to Claude. The prediction has returned:

```
# Oracle Prediction: England vs Germany
Confidence: HIGH

Win Probabilities
- England: 58%
- Draw: 14%
- Germany: 28%

Predicted Score: 2-1

Key Factors
- England top of group with 9/9 points, +5 GD
- Germany strong but inconsistent form (W,D,W)
- England won last H2H 2-0 in 2025 Nations League

Analysis
[2-3 paragraphs of reasoning...]

The Oracle says: England are the clear favourites and should advance.
```

Narrate: *"Payment settled on Injective in under a second. Real on-chain USDC EIP-3009 transfer. Data-backed AI reasoning."*

---

### [0:50–0:60] Recap

Show the four MCP tools in Claude's toolbar. Briefly explain:

- `get_fixtures`, `get_standings`, `head_to_head` — **free**
- `predict` — **x402-gated, 0.01 USDT, Injective EVM testnet**

Final card: *"The Oracle — AI predictions, atomic micropayments, Injective."*

---

## Key talking points for judges

| Tech | How it's used |
|---|---|
| **MCP Server** | 4 tools exposed via stdio; works in Claude Desktop, Claude CLI, any MCP client |
| **x402** | HTTP 402 → EIP-3009 USDC authorization (gasless sign) → facilitator settles on-chain — entire flow automatic via `@injectivelabs/x402` |
| **Injective EVM Testnet** | Single-block finality (~650ms); chain ID 1439; USDT token |
| **Agent Skill** | `skills/oracle-xi/SKILL.md` — installable, discoverable, portable |
| **Live data** | football-data.org free tier; 5-min cache; rate limiter |
| **LLM reasoning** | Claude claude-sonnet-4-6 with structured prompt grounded in fetched data |
