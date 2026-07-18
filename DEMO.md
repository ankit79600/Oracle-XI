# Oracle XI — 90-Second Demo Script

> A screen recording walkthrough showing all 8 MCP tools and the full x402 payment flow on Injective.

---

## Setup (before recording)

1. `cp .env.example .env` and fill in all keys
2. Terminal 1: `npm run start:api` — confirm `Oracle API → http://localhost:3002`
3. Terminal 2: `npm run start:mcp` — confirm `Oracle XI MCP server v2.0 running (stdio)`
4. Claude Desktop open with oracle-xi MCP server connected (hammer icon shows 8 tools)

---

## Script

### [0:00–0:05] Title card

> "Oracle XI — AI World Cup analyst on Injective. Eight tools, two payment tiers, extended thinking. Live demo."

Show the Claude Desktop window with all 8 oracle-xi MCP tools visible in the toolbar.

---

### [0:05–0:15] Free tool — live scores

User types:

> "Show me any World Cup matches happening right now"

Claude calls `live_scores` (no payment):

```
## Live Scores (1 match)
France                 1-0 Brazil                 [67'] — FIFA World Cup 2026
```

Narrate: *"Free, instant, no payment needed. Real-time data from football-data.org."*

---

### [0:15–0:25] Free tool — top scorers

User types:

> "Who are the top scorers at the World Cup?"

Claude calls `top_scorers(competition="WC")` (no payment):

```
Rank | Player                   | Team       | G  | A  | Pen
─────────────────────────────────────────────────────────────
   1 | Kylian Mbappé            | France     |  5 |  2 |   1
   2 | Harry Kane               | England    |  4 |  1 |   2
   3 | Julián Álvarez           | Argentina  |  4 |  3 |   0
```

Narrate: *"Golden boot table — also free."*

---

### [0:25–0:35] Free tool — team form

User types:

> "How has England been performing recently?"

Claude calls `team_form(team="England", limit=5)` (no payment):

```
## England Recent Form: W W W D W
2026-07-06 [H] W 2-1 vs France         — FIFA World Cup 2026
2026-07-01 [A] W 3-0 vs Netherlands    — FIFA World Cup 2026
...
```

Narrate: *"Five-match form breakdown — free data to inform the prediction."*

---

### [0:35–0:50] Paid tool — predict_quick (Haiku 4.5)

User types:

> "Quick prediction — who wins England vs Germany?"

Claude calls `predict_quick`. Switch to Terminal 1 (API server). Watch logs:

```
[x402] GET /predict/quick — 402 issued
[x402] PAYMENT-SIGNATURE received; verifying...
[x402] Payment settled: tx=0xabc... payer=0x126f... amount=3000
```

Claude Desktop returns:

```
# Oracle Prediction: England vs Germany
Confidence: MEDIUM  |  Tier: QUICK  |  Model: Haiku 4.5

Win Probabilities
- England: 54%  |  Draw: 18%  |  Germany: 28%

Predicted Score: England 2-1 Germany

Key Factors
- England top group with 9/9 points, +5 GD
- Germany inconsistent form (W,D,W)
- England won last H2H 2-1

The Oracle says: England are favoured to advance.

Cost: 0.003 USDC  |  Tx on Injective: 0xabc...
```

Narrate: *"Fast, cheap — 0.003 USDC on Injective. Under a second."*

---

### [0:50–1:20] Paid tool — predict_pro (Opus 4.8 + extended thinking)

User types:

> "Give me a deep analysis — who wins Brazil vs Argentina and why?"

Claude calls `predict_pro`. Watch Terminal 1:

```
[x402] GET /predict — 402 issued
[x402] PAYMENT-SIGNATURE received; verifying...
[x402] Payment settled: tx=0xdef... payer=0x126f... amount=10000
[predictor] Opus 4.8 extended thinking — budget_tokens=5000
```

**Cut to Injective testnet explorer** (`testnet.blockscout.injective.network`):
Search for the tx hash. Show the USDC `transferWithAuthorization`: 0.01 USDC from payer to treasury, confirmed in ~650ms.

Switch back to Claude Desktop:

```
# Oracle Prediction: Brazil vs Argentina
Confidence: HIGH  |  Tier: PRO  |  Model: Opus 4.8

Win Probabilities
- Brazil: 42%  |  Draw: 24%  |  Argentina: 34%

Predicted Score: Brazil 2-1 Argentina

Key Factors
- Brazil ranked 4th, recovered from slow start (D,L,W)
- Argentina ranked 5th but boast best attack: Álvarez 4G+3A
- H2H: 3 meetings, Brazil 1W-1D-1L — no clear favourite
- Brazil's home-continent advantage in high-pressure knockouts

Analysis
[3 paragraphs of deep tactical reasoning citing specific statistics...]

The Oracle says: A narrow Brazil win, driven by superior
defensive organisation against Argentina's attack-heavy system.

Cost: 0.01 USDC  |  Tx on Injective: 0xdef...
```

Narrate: *"Opus 4.8 with extended thinking — 5,000-token private reasoning budget before the model commits. Deeper analysis, higher confidence, one USDC cent more."*

---

### [1:20–1:30] Recap

Show all 8 MCP tools in Claude's toolbar:

| Tool | Cost |
|---|---|
| `get_fixtures`, `get_standings`, `head_to_head` | Free |
| `live_scores`, `top_scorers`, `team_form` | Free |
| `predict_quick` | **0.003 USDC — Haiku 4.5** |
| `predict_pro` | **0.01 USDC — Opus 4.8 + thinking** |

Final card: *"Oracle XI — AI predictions, atomic micropayments, Injective."*

---

## Key talking points for judges

| Tech | How it's used |
|---|---|
| **MCP Server v2.0** | 8 tools over stdio — 6 free, 2 x402-gated; works in Claude Desktop, Claude Code, any MCP client |
| **Tiered x402** | Two price points (0.003 / 0.01 USDC); payment middleware factory handles both |
| **EIP-3009 / Injective** | Gasless signature from payer; facilitator submits on-chain; ~650ms single-block finality |
| **Extended thinking** | Opus 4.8 gets a 5k-token private reasoning budget before calling the prediction tool |
| **Tool use + Zod** | Model is forced via `tool_choice` to emit a typed struct; Zod validates before returning — no fragile JSON parsing |
| **SSE streaming** | `/predict/stream` emits `thinking`, `token`, `prediction` events in real time |
| **Rate limiter** | Serialising promise chain prevents concurrent football API calls from bypassing the 6.1s throttle |
| **Live data** | football-data.org v4 free tier; 5-min cache; 12 competitions supported |
