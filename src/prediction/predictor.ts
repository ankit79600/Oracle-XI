import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { Fixture, Standing, HeadToHeadResult } from "../football/types.js";

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

function formatStandings(standings: Standing[], teamNames: string[]): string {
  const normalise = (s: string) => s.toLowerCase();
  const relevant = standings.filter((s) =>
    teamNames.some((n) => normalise(s.team.name).includes(normalise(n)))
  );
  const rows = (relevant.length > 0 ? relevant : standings.slice(0, 6));
  return rows.map(formatRow).join("\n");
}

function formatRow(s: Standing): string {
  return `  P${s.position} ${s.team.name.padEnd(20)} Pts:${s.points} GD:${s.goalDifference >= 0 ? "+" : ""}${s.goalDifference} Form:${s.form ?? "N/A"}`;
}

function formatH2H(h2h: HeadToHeadResult, home: string, away: string): string {
  const { aggregates, matches } = h2h;
  return [
    `Last ${aggregates.numberOfMatches} meetings:`,
    `  ${home} wins: ${aggregates.homeTeam.wins} | Draws: ${aggregates.homeTeam.draws} | ${away} wins: ${aggregates.awayTeam.wins}`,
    `  Total goals: ${aggregates.totalGoals}`,
    "  Recent:",
    ...matches.slice(0, 5).map(
      (m) =>
        `    ${m.utcDate.slice(0, 10)}: ${m.homeTeam.name} ${m.score.fullTime.home ?? "?"}-${m.score.fullTime.away ?? "?"} ${m.awayTeam.name}`
    ),
  ].join("\n");
}

/** Rule-based fallback when no Anthropic API key is configured. */
function mockPredict(input: PredictionInput): PredictionResult {
  const { homeTeam, awayTeam, standings, headToHead } = input;

  // Derive a simple advantage score from standings position + H2H wins
  let homeAdvantage = 0;
  if (standings) {
    const hs = standings.find((s) => s.team.name.toLowerCase().includes(homeTeam.toLowerCase()));
    const as_ = standings.find((s) => s.team.name.toLowerCase().includes(awayTeam.toLowerCase()));
    if (hs && as_) homeAdvantage += (as_.position - hs.position) * 2;
  }
  if (headToHead) {
    homeAdvantage += (headToHead.aggregates.homeTeam.wins - headToHead.aggregates.awayTeam.wins) * 3;
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
    reasoning: `[DEMO MODE — add ANTHROPIC_API_KEY for full AI analysis]\n\n` +
      `Based on available data, ${homeTeam} hold a ${homeAdvantage >= 0 ? "slight" : "slight"} ` +
      `${homeAdvantage >= 0 ? "advantage" : "disadvantage"} heading into this fixture. ` +
      `Standings position and head-to-head record both favour ${homeWin >= awayWin ? homeTeam : awayTeam}. ` +
      `Home advantage is factored into the win probability. ` +
      `This is a rule-based estimate; set ANTHROPIC_API_KEY for a full data-backed LLM prediction.`,
    keyFactors: [
      `Standings differential: ${homeAdvantage >= 0 ? homeTeam : awayTeam} ranked higher`,
      `H2H record: ${headToHead ? `${headToHead.aggregates.homeTeam.wins}W-${headToHead.aggregates.homeTeam.draws}D-${headToHead.aggregates.awayTeam.wins}L for ${homeTeam}` : "no H2H data"}`,
      "Home advantage factored into probabilities",
    ],
    recommendation: `${homeWin >= awayWin ? homeTeam : awayTeam} are predicted to win ${homeGoals}-${awayGoals}. Add ANTHROPIC_API_KEY for full AI reasoning.`,
  };
}

export async function predict(input: PredictionInput): Promise<PredictionResult> {
  if (!config.llm.anthropicApiKey) {
    console.warn("[predictor] No ANTHROPIC_API_KEY — using rule-based fallback");
    return mockPredict(input);
  }

  const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });

  const contextBlocks: string[] = [];

  if (input.fixture) {
    const f = input.fixture;
    contextBlocks.push(
      `Match: ${f.homeTeam.name} vs ${f.awayTeam.name}`,
      `Date: ${f.utcDate.slice(0, 10)}`,
      `Competition: ${f.competition.name}`,
      `Status: ${f.status}`
    );
  }

  if (input.standings && input.standings.length > 0) {
    contextBlocks.push(
      "\nCurrent Standings (relevant teams):\n" +
        formatStandings(input.standings, [input.homeTeam, input.awayTeam])
    );
  }

  if (input.headToHead) {
    contextBlocks.push(
      "\nHead-to-Head History:\n" +
        formatH2H(input.headToHead, input.homeTeam, input.awayTeam)
    );
  }

  const prompt = `You are The Oracle, an expert football analyst. Analyze the following match and provide a data-backed prediction.

## Match Context
${contextBlocks.join("\n")}

## Your Task
Predict the outcome of ${input.homeTeam} vs ${input.awayTeam} in the ${input.competition}.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
{
  "homeWinProbability": <integer 0-100>,
  "drawProbability": <integer 0-100>,
  "awayWinProbability": <integer 0-100>,
  "predictedScore": "<home goals>-<away goals>",
  "confidence": "<low|medium|high>",
  "reasoning": "<2-3 paragraph analytical reasoning citing the data above>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "recommendation": "<one bold declarative sentence summarising the prediction>"
}

Probabilities must sum to 100. Be analytical, cite specific numbers from the data. Do not hedge excessively.`;

  const message = await client.messages.create({
    model: config.llm.model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const json = raw.replace(/^```[a-z]*\n?/m, "").replace(/\n?```$/m, "").trim();
  const result = JSON.parse(json) as PredictionResult;

  const total = result.homeWinProbability + result.drawProbability + result.awayWinProbability;
  if (total !== 100) {
    const scale = 100 / total;
    result.homeWinProbability = Math.round(result.homeWinProbability * scale);
    result.drawProbability = Math.round(result.drawProbability * scale);
    result.awayWinProbability = 100 - result.homeWinProbability - result.drawProbability;
  }

  return result;
}
