import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import type { Fixture, Standing, HeadToHeadResult } from "../football/types.js";

export type PredictionTier = "quick" | "pro";

export interface PredictionInput {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  fixture?: Fixture;
  standings?: Standing[];
  headToHead?: HeadToHeadResult;
}

export interface PredictionResult {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  predictedScore: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  keyFactors: string[];
  recommendation: string;
}

export type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "token"; text: string }
  | { type: "prediction"; data: PredictionResult };

const PredictionSchema = z.object({
  homeWinProbability: z.number().int().min(0).max(100),
  drawProbability: z.number().int().min(0).max(100),
  awayWinProbability: z.number().int().min(0).max(100),
  predictedScore: z.string().regex(/^\d+-\d+$/),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().min(10),
  keyFactors: z.array(z.string()).min(1),
  recommendation: z.string().min(5),
});

const predictionTool: Anthropic.Tool = {
  name: "submit_prediction",
  description:
    "Submit the structured match prediction with all required fields. Probabilities must sum exactly to 100.",
  input_schema: {
    type: "object",
    properties: {
      homeWinProbability: { type: "integer", minimum: 0, maximum: 100 },
      drawProbability: { type: "integer", minimum: 0, maximum: 100 },
      awayWinProbability: { type: "integer", minimum: 0, maximum: 100 },
      predictedScore: { type: "string", description: "e.g. '2-1'" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      reasoning: {
        type: "string",
        description: "2-3 paragraph analytical reasoning citing specific data points",
      },
      keyFactors: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "3-5 key tactical or statistical factors driving the prediction",
      },
      recommendation: {
        type: "string",
        description: "One bold declarative sentence summarising the prediction",
      },
    },
    required: [
      "homeWinProbability",
      "drawProbability",
      "awayWinProbability",
      "predictedScore",
      "confidence",
      "reasoning",
      "keyFactors",
      "recommendation",
    ],
  },
};

function formatStandings(standings: Standing[], teamNames: string[]): string {
  const normalise = (s: string) => s.toLowerCase();
  const relevant = standings.filter((s) =>
    teamNames.some((n) => normalise(s.team.name).includes(normalise(n)))
  );
  const rows = relevant.length > 0 ? relevant : standings.slice(0, 6);
  return rows
    .map(
      (s) =>
        `  P${s.position} ${s.team.name.padEnd(20)} Pts:${s.points} ` +
        `GD:${s.goalDifference >= 0 ? "+" : ""}${s.goalDifference} Form:${s.form ?? "N/A"}`
    )
    .join("\n");
}

function formatH2H(h2h: HeadToHeadResult, home: string, away: string): string {
  const { aggregates, matches } = h2h;
  return [
    `Last ${aggregates.numberOfMatches} meetings:`,
    `  ${home} wins: ${aggregates.homeTeam.wins} | Draws: ${aggregates.homeTeam.draws} | ${away} wins: ${aggregates.awayTeam.wins}`,
    `  Total goals: ${aggregates.totalGoals}`,
    "  Recent:",
    ...matches
      .slice(0, 5)
      .map(
        (m) =>
          `    ${m.utcDate.slice(0, 10)}: ${m.homeTeam.name} ` +
          `${m.score.fullTime.home ?? "?"}-${m.score.fullTime.away ?? "?"} ${m.awayTeam.name}`
      ),
  ].join("\n");
}

function buildPrompt(input: PredictionInput): string {
  const blocks: string[] = [];

  if (input.fixture) {
    const f = input.fixture;
    blocks.push(
      `Match: ${f.homeTeam.name} vs ${f.awayTeam.name}`,
      `Date: ${f.utcDate.slice(0, 10)}`,
      `Competition: ${f.competition.name}`,
      `Status: ${f.status}`
    );
  }

  if (input.standings && input.standings.length > 0) {
    blocks.push(
      "\nCurrent Standings (relevant teams):\n" +
        formatStandings(input.standings, [input.homeTeam, input.awayTeam])
    );
  }

  if (input.headToHead) {
    blocks.push(
      "\nHead-to-Head History:\n" +
        formatH2H(input.headToHead, input.homeTeam, input.awayTeam)
    );
  }

  return (
    `You are The Oracle, an expert football analyst. Analyze the following match and provide a data-backed prediction.\n\n` +
    `## Match Context\n${blocks.join("\n")}\n\n` +
    `Predict the outcome of ${input.homeTeam} vs ${input.awayTeam} in the ${input.competition}. ` +
    `Be analytical, cite specific numbers from the data, and do not hedge excessively.`
  );
}

function mockPredict(input: PredictionInput): PredictionResult {
  const { homeTeam, awayTeam, standings, headToHead } = input;

  let homeAdvantage = 0;
  if (standings) {
    const hs = standings.find((s) =>
      s.team.name.toLowerCase().includes(homeTeam.toLowerCase())
    );
    const as_ = standings.find((s) =>
      s.team.name.toLowerCase().includes(awayTeam.toLowerCase())
    );
    if (hs && as_) homeAdvantage += (as_.position - hs.position) * 2;
  }
  if (headToHead) {
    homeAdvantage +=
      (headToHead.aggregates.homeTeam.wins - headToHead.aggregates.awayTeam.wins) * 3;
  }

  const homeWin = Math.min(70, Math.max(25, 45 + homeAdvantage));
  const awayWin = Math.min(60, Math.max(15, 35 - homeAdvantage));
  const draw = 100 - homeWin - awayWin;
  const homeGoals = homeWin > 50 ? 2 : 1;
  const awayGoals = awayWin > homeWin ? 2 : homeWin > 55 ? 0 : 1;

  return {
    homeWinProbability: homeWin,
    drawProbability: draw,
    awayWinProbability: awayWin,
    predictedScore: `${homeGoals}-${awayGoals}`,
    confidence: "medium",
    reasoning:
      `[DEMO MODE — add ANTHROPIC_API_KEY for full AI analysis]\n\n` +
      `Based on available data, ${homeAdvantage >= 0 ? homeTeam : awayTeam} hold an advantage heading into this fixture. ` +
      `Standings position and head-to-head record both favour ${homeWin >= awayWin ? homeTeam : awayTeam}. ` +
      `This is a rule-based estimate; set ANTHROPIC_API_KEY for a full data-backed LLM prediction.`,
    keyFactors: [
      `Standings differential: ${homeAdvantage >= 0 ? homeTeam : awayTeam} ranked higher`,
      `H2H record: ${
        headToHead
          ? `${headToHead.aggregates.homeTeam.wins}W-${headToHead.aggregates.homeTeam.draws}D-${headToHead.aggregates.awayTeam.wins}L for ${homeTeam}`
          : "no H2H data"
      }`,
      "Home advantage factored into probabilities",
    ],
    recommendation: `${homeWin >= awayWin ? homeTeam : awayTeam} are predicted to win ${homeGoals}-${awayGoals}. Add ANTHROPIC_API_KEY for full AI reasoning.`,
  };
}

function normaliseProbs(r: PredictionResult): PredictionResult {
  const total = r.homeWinProbability + r.drawProbability + r.awayWinProbability;
  if (total === 100) return r;
  const scale = 100 / total;
  r.homeWinProbability = Math.round(r.homeWinProbability * scale);
  r.drawProbability = Math.round(r.drawProbability * scale);
  r.awayWinProbability = 100 - r.homeWinProbability - r.drawProbability;
  return r;
}

export async function predict(
  input: PredictionInput,
  tier: PredictionTier = "pro"
): Promise<PredictionResult> {
  if (!config.llm.anthropicApiKey) {
    console.warn("[predictor] No ANTHROPIC_API_KEY — using rule-based fallback");
    return mockPredict(input);
  }

  const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  const model = tier === "pro" ? config.llm.proModel : config.llm.quickModel;
  const prompt = buildPrompt(input);

  try {
    const message = await client.messages.create({
      model,
      max_tokens: tier === "pro" ? 8000 : 1500,
      tools: [predictionTool],
      tool_choice: { type: "tool", name: "submit_prediction" },
      messages: [{ role: "user", content: prompt }],
      ...(tier === "pro"
        ? { thinking: { type: "enabled" as const, budget_tokens: 5000 } }
        : {}),
    });
    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use")
      throw new Error("No tool_use block in response");

    const result = PredictionSchema.parse(toolBlock.input) as PredictionResult;
    return normaliseProbs(result);
  } catch (e: unknown) {
    console.warn(
      "[predictor] API error — falling back to rule-based:",
      (e as Error).message
    );
    return mockPredict(input);
  }
}

export async function* streamPrediction(
  input: PredictionInput
): AsyncGenerator<StreamEvent> {
  if (!config.llm.anthropicApiKey) {
    yield { type: "token", text: "[DEMO MODE] Set ANTHROPIC_API_KEY for live analysis.\n" };
    yield { type: "prediction", data: mockPredict(input) };
    return;
  }

  const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  const prompt =
    buildPrompt(input) +
    "\n\nFirst write a 3-paragraph analytical breakdown of this fixture, then call submit_prediction with your structured prediction.";

  const stream = client.messages.stream({
    model: config.llm.proModel,
    max_tokens: 8000,
    thinking: { type: "enabled" as const, budget_tokens: 5000 },
    tools: [predictionTool],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "thinking_delta") {
        yield { type: "thinking", text: event.delta.thinking };
      } else if (event.delta.type === "text_delta") {
        yield { type: "token", text: event.delta.text };
      }
    }
  }

  const finalMsg = await stream.finalMessage();
  const toolBlock = finalMsg.content.find((b) => b.type === "tool_use");

  if (toolBlock && toolBlock.type === "tool_use") {
    try {
      const result = PredictionSchema.parse(toolBlock.input) as PredictionResult;
      yield { type: "prediction", data: normaliseProbs(result) };
      return;
    } catch {
      // fall through to mockPredict
    }
  }

  yield { type: "prediction", data: mockPredict(input) };
}
