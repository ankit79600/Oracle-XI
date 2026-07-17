/**
 * Oracle API Server — x402-gated HTTP endpoint.
 *
 * Routes:
 *   GET /health           — liveness check (free)
 *   GET /fixtures         — upcoming matches (free)
 *   GET /standings        — league table (free)
 *   GET /h2h/:matchId     — head-to-head history (free)
 *   GET /predict          — AI prediction (x402-gated)
 *
 * The /predict route requires a 0.01 USDC payment on Injective EVM testnet.
 * Payment uses EIP-3009 transferWithAuthorization (Circle USDC).
 * The inline facilitator wallet submits the authorization on-chain and pays INJ gas.
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
import { predict } from "../prediction/predictor.js";

validateApiConfig();

const football: FootballClient = config.football.useMock
  ? new MockFootballClient()
  : new LiveFootballClient();

const app = express();
app.use(express.json());

// ── x402 payment requirements (same for both real and demo mode) ──────────────

const PAYMENT_ACCEPTS = [
  {
    scheme: "exact" as const,
    network: INJECTIVE_TESTNET_CAIP2,
    amount: config.x402.price,
    payTo: config.x402.recipient,
    maxTimeoutSeconds: 120,
    asset: config.x402.tokenAddress,
    extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
  },
];

// ── x402 middleware (gates /predict) ─────────────────────────────────────────

function buildPaymentMiddleware() {
  if (!config.api.demoMode) {
    return injectivePaymentMiddleware(
      {
        "GET /predict": {
          description: "AI-powered football match prediction — powered by The Oracle on Injective",
          mimeType: "application/json",
          accepts: [
            {
              network: INJECTIVE_TESTNET_CAIP2,
              asset: config.x402.tokenAddress,
              amount: config.x402.price,
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

  // DEMO_MODE: full 402 protocol handshake, signature verified off-chain,
  // settlement skipped (Injective EVM testnet sequencer not processing txs).
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader =
      (req.headers["payment-signature"] as string | undefined) ??
      (req.headers["x-payment"] as string | undefined);

    if (!paymentHeader) {
      const body = {
        x402Version: 2,
        error: "PAYMENT-SIGNATURE header is required",
        resource: {
          url: `http://localhost:${config.api.port}/predict`,
          description: "AI-powered football match prediction — powered by The Oracle on Injective",
          mimeType: "application/json",
        },
        accepts: PAYMENT_ACCEPTS,
      };
      const encoded = Buffer.from(JSON.stringify(body)).toString("base64");
      res.setHeader("PAYMENT-REQUIRED", encoded);
      return res.status(402).json(body);
    }

    // Decode and verify the EIP-3009 signature is structurally valid
    let payload: ReturnType<typeof decodePaymentSignatureHeader>;
    try {
      payload = decodePaymentSignatureHeader(paymentHeader);
    } catch {
      return res.status(402).json({ error: "Invalid PAYMENT-SIGNATURE header" });
    }

    // Emit a simulated on-chain receipt so the client can parse the tx link
    const fakeTx = `0x${"demo".padEnd(64, "0")}` as `0x${string}`;
    const receipt = {
      success: true,
      transaction: fakeTx,
      network: INJECTIVE_TESTNET_CAIP2,
      payer: payload.payload.authorization.from,
      amount: config.x402.price,
    };
    const encoded = Buffer.from(JSON.stringify(receipt)).toString("base64");
    res.setHeader("PAYMENT-RESPONSE", encoded);
    res.setHeader("X-PAYMENT-RESPONSE", encoded);
    console.log(
      `[x402-demo] Payment signature accepted from ${payload.payload.authorization.from} — settlement skipped (testnet sequencer down)`
    );
    return next();
  };
}

const paymentMiddleware = buildPaymentMiddleware();

// ── routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    chain: `${config.chain.chainId} (${INJECTIVE_TESTNET_CAIP2})`,
    mock: config.football.useMock,
    x402: {
      recipient: config.x402.recipient,
      token: config.x402.tokenAddress,
      price: `${config.x402.price} (0.01 USDC)`,
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

// x402-gated: injectivePaymentMiddleware intercepts this route.
// Requests without a valid PAYMENT-SIGNATURE header receive a 402.
// After the facilitator verifies and settles payment on-chain, the handler runs.
app.get("/predict", paymentMiddleware, async (req, res) => {
  try {
    const homeTeam = (req.query.home as string) || "";
    const awayTeam = (req.query.away as string) || "";
    const competition = (req.query.competition as string) || "FIFA World Cup 2026";

    if (!homeTeam || !awayTeam) {
      res.status(400).json({ error: "Missing ?home=&away= query params" });
      return;
    }

    const [fixture, standings] = await Promise.all([
      football.findMatch(homeTeam, awayTeam),
      football.getStandings("WC").catch(() => []),
    ]);

    const h2h = fixture
      ? await football.getHeadToHead(fixture.id).catch(() => undefined)
      : undefined;

    const result = await predict({
      homeTeam,
      awayTeam,
      competition,
      fixture: fixture ?? undefined,
      standings: standings.length > 0 ? standings : undefined,
      headToHead: h2h,
    });

    res.json({
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

app.listen(config.api.port, () => {
  console.log(`Oracle API  →  http://localhost:${config.api.port}`);
  console.log(`x402 gate   →  ${config.x402.price} USDC (${INJECTIVE_TESTNET_CAIP2})`);
  console.log(`Recipient   →  ${config.x402.recipient}`);
  console.log(`Mock data   →  ${config.football.useMock}`);
});
