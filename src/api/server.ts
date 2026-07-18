/**
 * Oracle API Server — x402-gated HTTP endpoint.
 *
 * Routes:
 *   GET /health               — liveness check (free)
 *   GET /fixtures             — upcoming matches (free)
 *   GET /standings            — league table (free)
 *   GET /h2h/:matchId         — head-to-head history (free)
 *   GET /live                 — in-play matches (free)
 *   GET /scorers/:competition — top scorers (free)
 *   GET /team-form            — last N results for a team (free)
 *   GET /predict/quick        — AI prediction, Haiku 4.5 (x402 — 0.003 USDC)
 *   GET /predict              — AI prediction, Opus 4.8 + thinking (x402 — 0.01 USDC)
 *   GET /predict/stream       — streaming prediction with live reasoning (x402 — 0.01 USDC)
 */

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { injectivePaymentMiddleware } from "@injectivelabs/x402/middleware";
import { decodePaymentSignatureHeader } from "@injectivelabs/x402/client";
import { INJECTIVE_TESTNET_CAIP2 } from "@injectivelabs/x402/networks";
import { config, validateApiConfig } from "../config.js";
import { LiveFootballClient } from "../football/client.js";
import { MockFootballClient } from "../football/mock.js";
import type { FootballClient } from "../football/types.js";
import { predict, streamPrediction } from "../prediction/predictor.js";

validateApiConfig();

const football: FootballClient = config.football.useMock
  ? new MockFootballClient()
  : new LiveFootballClient();

const app = express();
app.use(express.json());

// ── payment middleware factory ────────────────────────────────────────────────

function buildPaymentMiddleware(
  endpoint: string,
  price: string,
  description: string
) {
  if (!config.api.demoMode) {
    return injectivePaymentMiddleware(
      {
        [`GET ${endpoint}`]: {
          description,
          mimeType: "application/json",
          accepts: [
            {
              network: INJECTIVE_TESTNET_CAIP2,
              asset: config.x402.tokenAddress,
              amount: price,
              payTo: config.x402.recipient,
              maxTimeoutSeconds: 120,
            },
          ],
        },
      },
      {
        facilitator: {
          privateKey: config.x402.facilitatorKey,
          rpcUrl: config.chain.rpcUrl,
          confirmations: 1,
        },
      }
    );
  }

  // DEMO_MODE: full 402 protocol handshake, signature verified, settlement skipped.
  return (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader =
      (req.headers["payment-signature"] as string | undefined) ??
      (req.headers["x-payment"] as string | undefined);

    if (!paymentHeader) {
      const body = {
        x402Version: 2,
        error: "PAYMENT-SIGNATURE header is required",
        resource: {
          url: `http://localhost:${config.api.port}${endpoint}`,
          description,
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "exact" as const,
            network: INJECTIVE_TESTNET_CAIP2,
            amount: price,
            payTo: config.x402.recipient,
            maxTimeoutSeconds: 120,
            asset: config.x402.tokenAddress,
            extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
          },
        ],
      };
      const encoded = Buffer.from(JSON.stringify(body)).toString("base64");
      res.setHeader("PAYMENT-REQUIRED", encoded);
      return res.status(402).json(body);
    }

    let payload: ReturnType<typeof decodePaymentSignatureHeader>;
    try {
      payload = decodePaymentSignatureHeader(paymentHeader);
    } catch {
      return res.status(402).json({ error: "Invalid PAYMENT-SIGNATURE header" });
    }

    const fakeTx = `0x${"demo".padEnd(64, "0")}` as `0x${string}`;
    const receipt = {
      success: true,
      transaction: fakeTx,
      network: INJECTIVE_TESTNET_CAIP2,
      payer: payload.payload.authorization.from,
      amount: price,
    };
    const encoded = Buffer.from(JSON.stringify(receipt)).toString("base64");
    res.setHeader("PAYMENT-RESPONSE", encoded);
    res.setHeader("X-PAYMENT-RESPONSE", encoded);
    console.log(
      `[x402-demo] ${endpoint} accepted from ${payload.payload.authorization.from} (${price} units, settlement skipped)`
    );
    return next();
  };
}

const quickPaymentMiddleware = buildPaymentMiddleware(
  "/predict/quick",
  config.x402.priceQuick,
  "AI match prediction — Quick (Haiku 4.5, fast, 0.003 USDC)"
);

const proPaymentMiddleware = buildPaymentMiddleware(
  "/predict",
  config.x402.price,
  "AI match prediction — Pro (Opus 4.8 + extended thinking, 0.01 USDC)"
);

const streamPaymentMiddleware = buildPaymentMiddleware(
  "/predict/stream",
  config.x402.price,
  "Streaming AI match prediction with live reasoning — Pro (Opus 4.8, 0.01 USDC)"
);

// ── free routes ───────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    chain: `${config.chain.chainId} (${INJECTIVE_TESTNET_CAIP2})`,
    mock: config.football.useMock,
    x402: {
      recipient: config.x402.recipient,
      token: config.x402.tokenAddress,
      pricePro: `${config.x402.price} (0.01 USDC)`,
      priceQuick: `${config.x402.priceQuick} (0.003 USDC)`,
      network: INJECTIVE_TESTNET_CAIP2,
    },
  });
});

app.get("/fixtures", async (req, res) => {
  try {
    const competition = (req.query.competition as string) || "WC";
    const matchday = req.query.matchday
      ? parseInt(req.query.matchday as string, 10)
      : undefined;
    const fixtures = await football.getFixtures(competition, matchday);
    res.json({ fixtures });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/standings", async (req, res) => {
  try {
    const competition = (req.query.competition as string) || "WC";
    const standings = await football.getStandings(competition);
    res.json({ standings });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/h2h/:matchId", async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId, 10);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const h2h = await football.getHeadToHead(matchId, limit);
    res.json(h2h);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/live", async (req, res) => {
  try {
    const competition = req.query.competition as string | undefined;
    const fixtures = await football.getLiveScores(competition);
    res.json({ count: fixtures.length, fixtures });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/scorers/:competition", async (req, res) => {
  try {
    const scorers = await football.getTopScorers(req.params.competition.toUpperCase());
    res.json({ competition: req.params.competition.toUpperCase(), scorers });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/team-form", async (req, res) => {
  try {
    const team = req.query.team as string;
    if (!team) {
      res.status(400).json({ error: "Missing ?team= query param" });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const fixtures = await football.getTeamForm(team, limit);
    res.json({ team, fixtures });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── helper: gather prediction context ────────────────────────────────────────

async function gatherContext(homeTeam: string, awayTeam: string, competition: string) {
  const [fixture, standings] = await Promise.all([
    football.findMatch(homeTeam, awayTeam),
    football.getStandings("WC").catch(() => []),
  ]);
  const h2h = fixture
    ? await football.getHeadToHead(fixture.id).catch(() => undefined)
    : undefined;
  return {
    homeTeam,
    awayTeam,
    competition,
    fixture: fixture ?? undefined,
    standings: standings.length > 0 ? standings : undefined,
    headToHead: h2h,
  };
}

// ── x402-gated: quick tier ────────────────────────────────────────────────────

app.get("/predict/quick", quickPaymentMiddleware, async (req, res) => {
  try {
    const homeTeam = (req.query.home as string) || "";
    const awayTeam = (req.query.away as string) || "";
    const competition = (req.query.competition as string) || "FIFA World Cup 2026";

    if (!homeTeam || !awayTeam) {
      res.status(400).json({ error: "Missing ?home=&away= query params" });
      return;
    }

    const input = await gatherContext(homeTeam, awayTeam, competition);
    const result = await predict(input, "quick");

    res.json({
      tier: "quick",
      model: config.llm.quickModel,
      match: `${homeTeam} vs ${awayTeam}`,
      competition,
      prediction: result,
      dataSource: config.football.useMock ? "mock" : "football-data.org",
      chain: INJECTIVE_TESTNET_CAIP2,
    });
  } catch (e) {
    console.error("[predict/quick]", e);
    res.status(500).json({ error: String(e) });
  }
});

// ── x402-gated: pro tier (Opus 4.8 + extended thinking) ──────────────────────

app.get("/predict", proPaymentMiddleware, async (req, res) => {
  try {
    const homeTeam = (req.query.home as string) || "";
    const awayTeam = (req.query.away as string) || "";
    const competition = (req.query.competition as string) || "FIFA World Cup 2026";

    if (!homeTeam || !awayTeam) {
      res.status(400).json({ error: "Missing ?home=&away= query params" });
      return;
    }

    const input = await gatherContext(homeTeam, awayTeam, competition);
    const result = await predict(input, "pro");

    res.json({
      tier: "pro",
      model: config.llm.proModel,
      match: `${homeTeam} vs ${awayTeam}`,
      competition,
      prediction: result,
      dataSource: config.football.useMock ? "mock" : "football-data.org",
      chain: INJECTIVE_TESTNET_CAIP2,
    });
  } catch (e) {
    console.error("[predict]", e);
    res.status(500).json({ error: String(e) });
  }
});

// ── x402-gated: streaming pro tier ───────────────────────────────────────────

app.get("/predict/stream", streamPaymentMiddleware, async (req, res) => {
  const homeTeam = (req.query.home as string) || "";
  const awayTeam = (req.query.away as string) || "";
  const competition = (req.query.competition as string) || "FIFA World Cup 2026";

  if (!homeTeam || !awayTeam) {
    res.status(400).json({ error: "Missing ?home=&away= query params" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const emit = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const input = await gatherContext(homeTeam, awayTeam, competition);

    for await (const chunk of streamPrediction(input)) {
      if (chunk.type === "thinking") {
        emit("thinking", { text: chunk.text });
      } else if (chunk.type === "token") {
        emit("token", { text: chunk.text });
      } else if (chunk.type === "prediction") {
        emit("prediction", {
          data: chunk.data,
          tier: "pro",
          model: config.llm.proModel,
          match: `${homeTeam} vs ${awayTeam}`,
          competition,
          dataSource: config.football.useMock ? "mock" : "football-data.org",
          chain: INJECTIVE_TESTNET_CAIP2,
        });
      }
    }

    emit("done", {});
  } catch (e) {
    console.error("[predict/stream]", e);
    emit("error", { message: String(e) });
  } finally {
    res.end();
  }
});

// ── start ─────────────────────────────────────────────────────────────────────

app.listen(config.api.port, () => {
  console.log(`Oracle API  →  http://localhost:${config.api.port}`);
  console.log(`Quick tier  →  ${config.x402.priceQuick} USDC units (/predict/quick)`);
  console.log(`Pro tier    →  ${config.x402.price} USDC units (/predict, /predict/stream)`);
  console.log(`Recipient   →  ${config.x402.recipient}`);
  console.log(`Mock data   →  ${config.football.useMock}`);
});
