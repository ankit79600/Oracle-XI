/**
 * Oracle XI MCP Server
 *
 * Free tools (no payment):
 *   get_fixtures        — upcoming/recent match schedule
 *   get_standings       — competition league table
 *   head_to_head        — historical H2H results
 *   live_scores         — in-play matches right now
 *   top_scorers         — golden boot leaderboard for a competition
 *   team_form           — last N results for a specific team
 *   tournament_bracket  — upcoming WC fixtures with quick predictions
 *
 * Premium tools (x402 pay-per-call on Injective EVM):
 *   predict_quick   — Haiku 4.5 prediction              (0.003 USDC)
 *   predict_sonnet  — Sonnet 4.6 prediction             (0.006 USDC)
 *   predict_pro     — Opus 4.8 + extended thinking      (0.01 USDC)
 *   predict_stream  — streaming prediction with full reasoning (0.01 USDC)
 *   predict_batch   — 2-5 quick predictions in parallel (N × 0.003 USDC)
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
import type { SseEvent } from "../x402/client.js";

validateMcpConfig();

const football: FootballClient = config.football.useMock
  ? new MockFootballClient()
  : new LiveFootballClient();

const oracleClient = createOracleClient(`http://localhost:${config.api.port}`);

const server = new McpServer({
  name: "oracle-xi",
  version: "2.1.0",
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

// ── Tool: tournament_bracket ──────────────────────────────────────────────────

server.tool(
  "tournament_bracket",
  [
    "Get the current FIFA World Cup 2026 bracket with quick AI predictions for all upcoming matches.",
    "Shows completed results and predicts scheduled fixtures using Haiku 4.5.",
    "Predictions run in parallel — cost: 0.003 USDC × number of upcoming matches.",
    "Payment is handled automatically via EIP-3009 using the configured PRIVATE_KEY.",
  ].join(" "),
  {
    competition: z
      .string()
      .default("WC")
      .describe("Competition code (default: WC for FIFA World Cup 2026)"),
    maxPredictions: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("Maximum number of upcoming matches to predict (1-8, default 4)"),
  },
  async ({ competition, maxPredictions }) => {
    const fixtures = await football.getFixtures(competition);

    const finished = fixtures.filter((f) => f.status === "FINISHED");
    const upcoming = fixtures
      .filter((f) => f.status === "SCHEDULED")
      .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
      .slice(0, maxPredictions);
    const live = fixtures.filter((f) => f.status === "IN_PLAY");

    const lines: string[] = [`# ${competition} Bracket — Oracle XI\n`];

    if (live.length > 0) {
      lines.push("## 🔴 In Play");
      for (const f of live) {
        lines.push(
          `  ${f.homeTeam.name} ${f.score.fullTime.home ?? "?"}-${f.score.fullTime.away ?? "?"} ${f.awayTeam.name}` +
            (f.minute ? ` [${f.minute}']` : "")
        );
      }
      lines.push("");
    }

    if (finished.length > 0) {
      lines.push(`## ✅ Results (${finished.length} matches)`);
      for (const f of finished.slice(-8)) {
        lines.push(
          `  ${f.utcDate.slice(0, 10)} | ${f.homeTeam.name.padEnd(20)} ${f.score.fullTime.home}-${f.score.fullTime.away} ${f.awayTeam.name}`
        );
      }
      lines.push("");
    }

    if (upcoming.length === 0) {
      lines.push("## 📅 Upcoming\nNo scheduled matches found.");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    lines.push(`## 🔮 Upcoming Predictions (${upcoming.length} matches via quick tier)`);
    lines.push(
      `> Cost: ${upcoming.length} × 0.003 USDC = ${(upcoming.length * 0.003).toFixed(3)} USDC\n`
    );

    const predictions = await Promise.allSettled(
      upcoming.map((f) =>
        oracleClient.get("/predict/quick", {
          home: f.homeTeam.name,
          away: f.awayTeam.name,
          competition: f.competition.name,
        })
      )
    );

    for (let i = 0; i < upcoming.length; i++) {
      const f = upcoming[i];
      const result = predictions[i];
      lines.push(`### ${f.utcDate.slice(0, 10)}: ${f.homeTeam.name} vs ${f.awayTeam.name}`);

      if (result.status === "rejected") {
        lines.push(`  ⚠ Prediction failed: ${result.reason}`);
      } else {
        const p = (result.value.data as { prediction: {
          homeWinProbability: number;
          drawProbability: number;
          awayWinProbability: number;
          predictedScore: string;
          confidence: string;
          recommendation: string;
        } }).prediction;
        lines.push(
          `  **${f.homeTeam.name}** ${p.homeWinProbability}% · Draw ${p.drawProbability}% · **${f.awayTeam.name}** ${p.awayWinProbability}%`
        );
        lines.push(`  Predicted: **${p.predictedScore}** · Confidence: ${p.confidence.toUpperCase()}`);
        lines.push(`  > ${p.recommendation}`);
        if (result.value.txHash) {
          lines.push(
            `  [Tx on Injective](${config.chain.explorerUrl}/tx/${result.value.txHash})`
          );
        }
      }
      lines.push("");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Tool: predict_quick (x402) ────────────────────────────────────────────────

server.tool(
  "predict_quick",
  [
    "PREMIUM — x402 pay-per-call (0.003 USDC on Injective EVM, chain",
    `${config.chain.chainId}).`,
    "Fast AI prediction powered by Haiku 4.5. Returns win probabilities, predicted score,",
    "key tactical factors, and analytical reasoning. Use predict_sonnet or predict_pro for deeper analysis.",
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
    try {
      const res = await oracleClient.get("/predict/quick", {
        home: homeTeam,
        away: awayTeam,
        competition,
      });
      return formatPredictionOutput(res.data as Record<string, unknown>, homeTeam, awayTeam, res.txHash);
    } catch (e: unknown) {
      return predictionError("Quick prediction", e);
    }
  }
);

// ── Tool: predict_sonnet (x402) ───────────────────────────────────────────────

server.tool(
  "predict_sonnet",
  [
    "PREMIUM — x402 pay-per-call (0.006 USDC on Injective EVM, chain",
    `${config.chain.chainId}).`,
    "Balanced AI prediction powered by Sonnet 4.6. Better than Quick but faster than Pro.",
    "Returns win probabilities, predicted score, key tactical factors, and reasoning.",
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
    try {
      const res = await oracleClient.get("/predict/sonnet", {
        home: homeTeam,
        away: awayTeam,
        competition,
      });
      return formatPredictionOutput(res.data as Record<string, unknown>, homeTeam, awayTeam, res.txHash);
    } catch (e: unknown) {
      return predictionError("Sonnet prediction", e);
    }
  }
);

// ── Tool: predict_pro (x402) ──────────────────────────────────────────────────

server.tool(
  "predict_pro",
  [
    "PREMIUM — x402 pay-per-call (0.01 USDC on Injective EVM, chain",
    `${config.chain.chainId}).`,
    "Deep AI prediction powered by Opus 4.8 with extended thinking. Returns in-depth",
    "win probabilities, predicted score, tactical analysis, and reasoning grounded in",
    "live match data. For fast predictions use predict_quick (0.003 USDC) or predict_sonnet (0.006 USDC).",
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
    try {
      const res = await oracleClient.get("/predict", {
        home: homeTeam,
        away: awayTeam,
        competition,
      });
      return formatPredictionOutput(res.data as Record<string, unknown>, homeTeam, awayTeam, res.txHash);
    } catch (e: unknown) {
      return predictionError("Pro prediction", e);
    }
  }
);

// ── Tool: predict_stream (x402) ───────────────────────────────────────────────

server.tool(
  "predict_stream",
  [
    "PREMIUM — x402 pay-per-call (0.01 USDC on Injective EVM, chain",
    `${config.chain.chainId}).`,
    "Streaming AI prediction powered by Opus 4.8 with extended thinking.",
    "Returns the FULL reasoning trace: extended thinking block, live analysis text,",
    "and the structured prediction. Use this when you want to see how The Oracle reasons,",
    "not just the final answer. Takes longer than predict_pro due to streaming collection.",
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
    let events: SseEvent[];
    let txHash: `0x${string}` | undefined;

    try {
      const res = await oracleClient.getStream("/predict/stream", {
        home: homeTeam,
        away: awayTeam,
        competition,
      });
      events = res.events;
      txHash = res.txHash;
    } catch (e: unknown) {
      return predictionError("Stream prediction", e);
    }

    const thinkingParts: string[] = [];
    const tokenParts: string[] = [];
    let prediction: Record<string, unknown> | null = null;

    for (const ev of events) {
      if (ev.type === "thinking") {
        thinkingParts.push((ev.data as { text: string }).text);
      } else if (ev.type === "token") {
        tokenParts.push((ev.data as { text: string }).text);
      } else if (ev.type === "prediction") {
        prediction = (ev.data as { data: Record<string, unknown> }).data ?? ev.data as Record<string, unknown>;
      }
    }

    const output: string[] = [
      `# Oracle Stream Prediction: ${homeTeam} vs ${awayTeam}`,
      `**Competition:** ${competition}  |  **Model:** ${config.llm.proModel}  |  **Chain:** ${config.chain.caip2}`,
      "",
    ];

    if (thinkingParts.length > 0) {
      const thinkingText = thinkingParts.join("");
      const wordCount = thinkingText.split(/\s+/).filter(Boolean).length;
      output.push(
        `## 🧠 Extended Thinking (${wordCount.toLocaleString()} words)`,
        "",
        "```",
        thinkingText.slice(0, 2000) + (thinkingText.length > 2000 ? "\n… (truncated)" : ""),
        "```",
        ""
      );
    }

    if (tokenParts.length > 0) {
      output.push("## 📝 Analysis", "", tokenParts.join(""), "");
    }

    if (prediction) {
      const p = prediction as {
        homeWinProbability: number;
        drawProbability: number;
        awayWinProbability: number;
        predictedScore: string;
        confidence: string;
        reasoning: string;
        keyFactors: string[];
        recommendation: string;
      };
      output.push(
        "## 🔮 Prediction",
        "",
        `**Win Probabilities:**  ${homeTeam} ${p.homeWinProbability}%  ·  Draw ${p.drawProbability}%  ·  ${awayTeam} ${p.awayWinProbability}%`,
        `**Predicted Score:** ${p.predictedScore}  ·  **Confidence:** ${p.confidence.toUpperCase()}`,
        "",
        "**Key Factors:**",
        ...p.keyFactors.map((f) => `- ${f}`),
        "",
        `> **The Oracle says:** ${p.recommendation}`,
        ""
      );
    }

    if (txHash) {
      output.push(`*[Tx on Injective](${config.chain.explorerUrl}/tx/${txHash})*`);
    }

    return { content: [{ type: "text" as const, text: output.join("\n") }] };
  }
);

// ── Tool: predict_batch (x402, parallel) ─────────────────────────────────────

server.tool(
  "predict_batch",
  [
    "PREMIUM — x402 pay-per-call, 0.003 USDC per match on Injective EVM, chain",
    `${config.chain.chainId}.`,
    "Predict 2-5 matches simultaneously using Haiku 4.5 quick tier.",
    "Payments run in parallel — each match is a separate x402 transaction.",
    "Use predict_sonnet or predict_pro for individual matches needing deeper analysis.",
  ].join(" "),
  {
    matches: z
      .array(
        z.object({
          homeTeam: z.string().describe("Home team name"),
          awayTeam: z.string().describe("Away team name"),
          competition: z.string().default("FIFA World Cup 2026").describe("Competition name"),
        })
      )
      .min(2)
      .max(5)
      .describe("2-5 matches to predict simultaneously"),
  },
  async ({ matches }) => {
    const results = await Promise.allSettled(
      matches.map((m) =>
        oracleClient.get("/predict/quick", {
          home: m.homeTeam,
          away: m.awayTeam,
          competition: m.competition,
        })
      )
    );

    const lines: string[] = [
      `# Oracle Batch Predictions (${matches.length} matches)`,
      `**Chain:** ${config.chain.caip2}  |  **Tier:** Quick (Haiku 4.5)`,
      "",
    ];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const result = results[i];
      lines.push(`## ${m.homeTeam} vs ${m.awayTeam}`);
      lines.push(`*${m.competition}*`);
      lines.push("");

      if (result.status === "rejected") {
        lines.push(`⚠ Failed: ${result.reason}`);
      } else {
        const d = result.value.data as Record<string, unknown>;
        const p = d.prediction as {
          homeWinProbability: number;
          drawProbability: number;
          awayWinProbability: number;
          predictedScore: string;
          confidence: string;
          recommendation: string;
          keyFactors: string[];
        };
        lines.push(
          `**${m.homeTeam}** ${p.homeWinProbability}% · Draw ${p.drawProbability}% · **${m.awayTeam}** ${p.awayWinProbability}%`
        );
        lines.push(`Predicted score: **${p.predictedScore}** · Confidence: ${p.confidence.toUpperCase()}`);
        lines.push("");
        lines.push("Key factors:");
        p.keyFactors.forEach((f) => lines.push(`- ${f}`));
        lines.push("");
        lines.push(`> ${p.recommendation}`);
        if (result.value.txHash) {
          lines.push(
            `[Tx](${config.chain.explorerUrl}/tx/${result.value.txHash})`
          );
        }
      }
      lines.push("");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
        ? `  |  [Tx on Injective](${config.chain.explorerUrl}/tx/${txHash})`
        : ""),
  ].join("\n");

  return { content: [{ type: "text" as const, text: output }] };
}

function predictionError(label: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [
      {
        type: "text" as const,
        text: [
          `**${label} failed:** ${msg}`,
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

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Oracle XI MCP server v2.1 running (stdio) — chain: ${config.chain.caip2}`);
