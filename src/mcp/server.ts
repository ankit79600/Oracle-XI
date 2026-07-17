/**
 * The Oracle — MCP Server
 *
 * Exposes 4 tools via stdio to any MCP-compatible client (Claude Desktop,
 * Claude Code, etc.):
 *
 *   get_fixtures   (free)  — upcoming/recent match schedule
 *   get_standings  (free)  — competition league table
 *   head_to_head   (free)  — historical H2H results
 *   predict        (x402)  — AI prediction; pays 0.01 USDC on Injective EVM testnet
 *
 * The predict tool calls the Oracle API server using createInjectiveClient,
 * which handles the full EIP-3009 payment flow automatically.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config, validateMcpConfig } from "../config.js";
import { LiveFootballClient } from "../football/client.js";
import { MockFootballClient } from "../football/mock.js";
import type { FootballClient } from "../football/types.js";
import { createOracleClient } from "../x402/client.js";

validateMcpConfig();

const football: FootballClient = config.football.useMock
  ? new MockFootballClient()
  : new LiveFootballClient();

const oracleClient = createOracleClient(`http://localhost:${config.api.port}`);

const server = new McpServer({
  name: "oracle-xi",
  version: "1.0.0",
});

// ── Tool: get_fixtures ────────────────────────────────────────────────────────

server.tool(
  "get_fixtures",
  "Get upcoming and recent match fixtures for a football competition. Returns schedule, results, and status. Supported codes: WC (World Cup), PL (Premier League), CL (Champions League), BL1 (Bundesliga), PD (La Liga), SA (Serie A), FL1 (Ligue 1).",
  {
    competition: z
      .string()
      .default("WC")
      .describe("Competition code, e.g. WC, PL, CL"),
    matchday: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Filter to a specific matchday"),
  },
  async ({ competition, matchday }) => {
    const fixtures = await football.getFixtures(competition, matchday);
    const rows = fixtures
      .slice(0, 20)
      .map(
        (f) =>
          `${f.utcDate.slice(0, 10)} | ${f.homeTeam.name.padEnd(22)} vs ${f.awayTeam.name.padEnd(22)} | ` +
          (f.status === "FINISHED"
            ? `${f.score.fullTime.home}-${f.score.fullTime.away} FT`
            : f.status)
      );

    return {
      content: [
        {
          type: "text",
          text:
            `## ${competition} Fixtures (${fixtures.length} total)\n` +
            "```\n" +
            (rows.join("\n") || "No fixtures found.") +
            "\n```",
        },
      ],
    };
  }
);

// ── Tool: get_standings ───────────────────────────────────────────────────────

server.tool(
  "get_standings",
  "Get the current league table / standings for a football competition. Shows position, points, wins, draws, losses, goal difference, and form.",
  {
    competition: z
      .string()
      .default("WC")
      .describe("Competition code, e.g. WC, PL, CL"),
  },
  async ({ competition }) => {
    const standings = await football.getStandings(competition);
    const header =
      "Pos | Team                   | Pts | W  | D  | L  | GD  | Form";
    const sep = "─".repeat(66);
    const rows = standings.map(
      (s) =>
        `${String(s.position).padStart(3)} | ${s.team.name.padEnd(22)} | ` +
        `${String(s.points).padStart(3)} | ${String(s.won).padStart(2)} | ` +
        `${String(s.draw).padStart(2)} | ${String(s.lost).padStart(2)} | ` +
        `${(s.goalDifference >= 0 ? "+" : "") + s.goalDifference}`.padStart(4) +
        ` | ${s.form ?? "N/A"}`
    );

    return {
      content: [
        {
          type: "text",
          text:
            `## ${competition} Standings\n` +
            "```\n" +
            `${header}\n${sep}\n${rows.join("\n")}` +
            "\n```",
        },
      ],
    };
  }
);

// ── Tool: head_to_head ────────────────────────────────────────────────────────

server.tool(
  "head_to_head",
  "Get the historical head-to-head record between two teams for a given match. Call get_fixtures first to obtain the matchId.",
  {
    matchId: z
      .number()
      .int()
      .positive()
      .describe("Match ID from get_fixtures"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Max number of past meetings to return"),
  },
  async ({ matchId, limit }) => {
    const h2h = await football.getHeadToHead(matchId, limit);
    const { aggregates, matches } = h2h;
    const recent = matches
      .map(
        (m) =>
          `  ${m.utcDate.slice(0, 10)}: ` +
          `${m.homeTeam.name} ` +
          `${m.score.fullTime.home ?? "?"}-${m.score.fullTime.away ?? "?"} ` +
          `${m.awayTeam.name}`
      )
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: [
            `## Head-to-Head (match ${matchId})`,
            `Meetings: ${aggregates.numberOfMatches}`,
            `Home wins: ${aggregates.homeTeam.wins}  |  Draws: ${aggregates.homeTeam.draws}  |  Away wins: ${aggregates.awayTeam.wins}`,
            `Total goals: ${aggregates.totalGoals}`,
            "",
            "Recent results:",
            recent || "  No recent meetings found.",
          ].join("\n"),
        },
      ],
    };
  }
);

// ── Tool: predict (x402-gated) ────────────────────────────────────────────────

server.tool(
  "predict",
  [
    "PREMIUM — x402 pay-per-call (0.01 USDC on Injective EVM testnet, chain 1439).",
    "Returns an AI-powered match prediction with win probabilities, predicted score,",
    "key tactical factors, and analytical reasoning grounded in live match data.",
    "Payment is handled automatically via EIP-3009 using the configured PRIVATE_KEY.",
  ].join(" "),
  {
    homeTeam: z.string().describe("Home team name, e.g. 'England'"),
    awayTeam: z.string().describe("Away team name, e.g. 'Germany'"),
    competition: z
      .string()
      .default("FIFA World Cup 2026")
      .describe("Competition name for context"),
  },
  async ({ homeTeam, awayTeam, competition }) => {
    let txHash: `0x${string}` | undefined;
    let result: Record<string, unknown>;

    try {
      const res = await oracleClient.get("/predict", {
        home: homeTeam,
        away: awayTeam,
        competition,
      });
      result = res.data as Record<string, unknown>;
      txHash = res.txHash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [
          {
            type: "text",
            text: [
              `**Prediction failed:** ${msg}`,
              "",
              "Troubleshooting:",
              "- Is the Oracle API server running? (`npm run start:api`)",
              "- Does your payer wallet hold testnet USDC? (faucet.circle.com)",
              "- Is X402_RECIPIENT set in .env?",
            ].join("\n"),
          },
        ],
        isError: true,
      };
    }

    const p = result.prediction as {
      homeWinProbability: number;
      drawProbability: number;
      awayWinProbability: number;
      predictedScore: string;
      confidence: string;
      reasoning: string;
      keyFactors: string[];
      recommendation: string;
    };

    const output = [
      `# Oracle Prediction: ${homeTeam} vs ${awayTeam}`,
      `**Competition:** ${competition}  |  **Confidence:** ${p.confidence.toUpperCase()}`,
      "",
      "## Win Probabilities",
      `- **${homeTeam}:** ${p.homeWinProbability}%`,
      `- **Draw:** ${p.drawProbability}%`,
      `- **${awayTeam}:** ${p.awayWinProbability}%`,
      "",
      `## Predicted Score: **${homeTeam} ${p.predictedScore} ${awayTeam}**`,
      "",
      "## Key Factors",
      ...p.keyFactors.map((f) => `- ${f}`),
      "",
      "## Analysis",
      p.reasoning,
      "",
      "---",
      `**The Oracle says:** ${p.recommendation}`,
      "",
      `*Data: ${result.dataSource as string}  |  Chain: ${result.chain as string}*` +
        (txHash
          ? `  |  [Tx on Injective](https://testnet.blockscout.injective.network/tx/${txHash})`
          : ""),
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Oracle XI MCP server running (stdio)");
