/**
 * Oracle XI MCP Server
 *
 * Free tools (no payment):
 *   get_fixtures   — upcoming/recent match schedule
 *   get_standings  — competition league table
 *   head_to_head   — historical H2H results
 *   live_scores    — in-play matches right now
 *   top_scorers    — golden boot leaderboard for a competition
 *   team_form      — last N results for a specific team
 *
 * Premium tools (x402 pay-per-call on Injective EVM testnet):
 *   predict_quick  — AI prediction via Haiku 4.5  (0.003 USDC)
 *   predict_pro    — AI prediction via Opus 4.8 + extended thinking (0.01 USDC)
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
  version: "2.0.0",
});

// ── Tool: get_fixtures ────────────────────────────────────────────────────────

server.tool(
  "get_fixtures",
  "Get upcoming and recent match fixtures for a football competition. Returns schedule, results, and status. Supported codes: WC (World Cup), PL (Premier League), CL (Champions League), BL1 (Bundesliga), PD (La Liga), SA (Serie A), FL1 (Ligue 1).",
  {
    competition: z.string().default("WC").describe("Competition code, e.g. WC, PL, CL"),
    matchday: z.number().int().positive().optional().describe("Filter to a specific matchday"),
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
    competition: z.string().default("WC").describe("Competition code, e.g. WC, PL, CL"),
  },
  async ({ competition }) => {
    const standings = await football.getStandings(competition);
    const header = "Pos | Team                   | Pts | W  | D  | L  | GD  | Form";
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
    matchId: z.number().int().positive().describe("Match ID from get_fixtures"),
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

// ── Tool: live_scores ─────────────────────────────────────────────────────────

server.tool(
  "live_scores",
  "Get all matches currently in play. Optionally filter to a specific competition. Returns real-time scores and match minute.",
  {
    competition: z
      .string()
      .optional()
      .describe("Competition code to filter (omit for all competitions)"),
  },
  async ({ competition }) => {
    const fixtures = await football.getLiveScores(competition);

    if (fixtures.length === 0) {
      return {
        content: [{ type: "text", text: "## Live Scores\nNo matches currently in play." }],
      };
    }

    const rows = fixtures.map(
      (f) =>
        `${f.homeTeam.name.padEnd(22)} ${f.score.fullTime.home ?? "?"}-${f.score.fullTime.away ?? "?"} ${f.awayTeam.name.padEnd(22)}` +
        (f.minute ? ` [${f.minute}']` : " [LIVE]") +
        ` — ${f.competition.name}`
    );

    return {
      content: [
        {
          type: "text",
          text: `## Live Scores (${fixtures.length} match${fixtures.length !== 1 ? "es" : ""})\n\`\`\`\n${rows.join("\n")}\n\`\`\``,
        },
      ],
    };
  }
);

// ── Tool: top_scorers ─────────────────────────────────────────────────────────

server.tool(
  "top_scorers",
  "Get the top goal scorers for a football competition. Returns player name, team, goals, assists, and penalty breakdown.",
  {
    competition: z
      .string()
      .default("WC")
      .describe("Competition code, e.g. WC, PL, CL"),
  },
  async ({ competition }) => {
    const scorers = await football.getTopScorers(competition);

    if (scorers.length === 0) {
      return {
        content: [{ type: "text", text: `## ${competition} Top Scorers\nNo scorer data available.` }],
      };
    }

    const header = "Rank | Player                  | Team                   | G  | A  | Pen";
    const sep = "─".repeat(72);
    const rows = scorers.map(
      (s) =>
        `${String(s.position).padStart(4)} | ${s.player.name.padEnd(23)} | ${s.team.name.padEnd(22)} | ` +
        `${String(s.goals).padStart(2)} | ${String(s.assists ?? 0).padStart(2)} | ${String(s.penalties ?? 0).padStart(3)}`
    );

    return {
      content: [
        {
          type: "text",
          text:
            `## ${competition} Top Scorers\n` +
            "```\n" +
            `${header}\n${sep}\n${rows.join("\n")}` +
            "\n```",
        },
      ],
    };
  }
);

// ── Tool: team_form ───────────────────────────────────────────────────────────

server.tool(
  "team_form",
  "Get a team's last N results across all competitions. Shows recent performance, score, and opponent. Useful context before running a prediction.",
  {
    team: z.string().describe("Team name, e.g. 'England', 'Brazil'"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of recent results to return"),
  },
  async ({ team, limit }) => {
    const fixtures = await football.getTeamForm(team, limit);

    if (fixtures.length === 0) {
      return {
        content: [
          { type: "text", text: `## ${team} Recent Form\nNo finished matches found.` },
        ],
      };
    }

    const rows = fixtures.map((f) => {
      const homeScore = f.score.fullTime.home ?? 0;
      const awayScore = f.score.fullTime.away ?? 0;
      const isHome = f.homeTeam.name.toLowerCase().includes(team.toLowerCase());
      const teamGoals = isHome ? homeScore : awayScore;
      const oppGoals = isHome ? awayScore : homeScore;
      const opponent = isHome ? f.awayTeam.name : f.homeTeam.name;
      const venue = isHome ? "H" : "A";
      const outcome =
        teamGoals > oppGoals ? "W" : teamGoals < oppGoals ? "L" : "D";
      return (
        `${f.utcDate.slice(0, 10)} [${venue}] ${outcome} ${teamGoals}-${oppGoals} vs ${opponent.padEnd(22)} — ${f.competition.name}`
      );
    });

    const outcomes = rows.map((r) => r.match(/\[.\] ([WDL])/)?.[1] ?? "");
    const summary = outcomes.join(" ");

    return {
      content: [
        {
          type: "text",
          text:
            `## ${team} Recent Form: ${summary}\n` +
            "```\n" +
            rows.join("\n") +
            "\n```",
        },
      ],
    };
  }
);

// ── Tool: predict_quick (x402) ────────────────────────────────────────────────

server.tool(
  "predict_quick",
  [
    "PREMIUM — x402 pay-per-call (0.003 USDC on Injective EVM testnet, chain 1439).",
    "Fast AI prediction powered by Haiku 4.5. Returns win probabilities, predicted score,",
    "key tactical factors, and analytical reasoning. Use predict_pro for deeper analysis.",
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
      const res = await oracleClient.get("/predict/quick", {
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
              `**Quick prediction failed:** ${msg}`,
              "",
              "Troubleshooting:",
              "- Is the Oracle API server running? (`npm run start:api`)",
              "- Does your payer wallet hold testnet USDC?",
              "- Is X402_RECIPIENT set in .env?",
            ].join("\n"),
          },
        ],
        isError: true,
      };
    }

    return formatPredictionOutput(result, homeTeam, awayTeam, txHash);
  }
);

// ── Tool: predict_pro (x402) ──────────────────────────────────────────────────

server.tool(
  "predict_pro",
  [
    "PREMIUM — x402 pay-per-call (0.01 USDC on Injective EVM testnet, chain 1439).",
    "Deep AI prediction powered by Opus 4.8 with extended thinking. Returns in-depth",
    "win probabilities, predicted score, tactical analysis, and reasoning grounded in",
    "live match data. For fast predictions use predict_quick (0.003 USDC).",
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
              `**Pro prediction failed:** ${msg}`,
              "",
              "Troubleshooting:",
              "- Is the Oracle API server running? (`npm run start:api`)",
              "- Does your payer wallet hold testnet USDC?",
              "- Is X402_RECIPIENT set in .env?",
            ].join("\n"),
          },
        ],
        isError: true,
      };
    }

    return formatPredictionOutput(result, homeTeam, awayTeam, txHash);
  }
);

// ── shared output formatter ───────────────────────────────────────────────────

function formatPredictionOutput(
  result: Record<string, unknown>,
  homeTeam: string,
  awayTeam: string,
  txHash?: `0x${string}`
) {
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
  const tier = (result.tier as string | undefined) ?? "pro";
  const model = (result.model as string | undefined) ?? "";

  const output = [
    `# Oracle Prediction: ${homeTeam} vs ${awayTeam}`,
    `**Competition:** ${result.competition as string}  |  **Confidence:** ${p.confidence.toUpperCase()}  |  **Tier:** ${tier.toUpperCase()}`,
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
    `*Data: ${result.dataSource as string}  |  Model: ${model}  |  Chain: ${result.chain as string}*` +
      (txHash
        ? `  |  [Tx on Injective](https://testnet.blockscout.injective.network/tx/${txHash})`
        : ""),
  ].join("\n");

  return { content: [{ type: "text" as const, text: output }] };
}

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Oracle XI MCP server v2.0 running (stdio)");
