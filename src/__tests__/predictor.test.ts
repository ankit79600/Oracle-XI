import { describe, it, expect } from "vitest";
import { predict, streamPrediction } from "../prediction/predictor.js";
import type { Standing } from "../football/types.js";

// ANTHROPIC_API_KEY is empty in test setup, so all predict() calls use the
// rule-based mockPredict fallback — no real API calls are made.

const base = {
  homeTeam: "England",
  awayTeam: "Germany",
  competition: "FIFA World Cup 2026",
};

describe("predict()", () => {
  it("returns a structurally valid PredictionResult", async () => {
    const result = await predict(base);
    expect(result.homeWinProbability).toBeGreaterThanOrEqual(0);
    expect(result.homeWinProbability).toBeLessThanOrEqual(100);
    expect(result.drawProbability).toBeGreaterThanOrEqual(0);
    expect(result.awayWinProbability).toBeGreaterThanOrEqual(0);
    expect(result.predictedScore).toMatch(/^\d+-\d+$/);
    expect(["low", "medium", "high"]).toContain(result.confidence);
    expect(result.reasoning).toBeTruthy();
    expect(result.keyFactors).toBeInstanceOf(Array);
    expect(result.keyFactors.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
  });

  it("probabilities always sum to exactly 100", async () => {
    const result = await predict(base);
    const sum =
      result.homeWinProbability +
      result.drawProbability +
      result.awayWinProbability;
    expect(sum).toBe(100);
  });

  it("quick tier also returns valid result summing to 100", async () => {
    const result = await predict(base, "quick");
    const sum =
      result.homeWinProbability +
      result.drawProbability +
      result.awayWinProbability;
    expect(sum).toBe(100);
    expect(result.predictedScore).toMatch(/^\d+-\d+$/);
  });

  it("favours the higher-ranked home team when standings provided", async () => {
    const standings: Standing[] = [
      {
        position: 1,
        team: { id: 66, name: "England", shortName: "England", tla: "ENG" },
        playedGames: 3,
        won: 3,
        draw: 0,
        lost: 0,
        points: 9,
        goalsFor: 7,
        goalsAgainst: 2,
        goalDifference: 5,
      },
      {
        position: 5,
        team: { id: 4, name: "Germany", shortName: "Germany", tla: "GER" },
        playedGames: 3,
        won: 1,
        draw: 0,
        lost: 2,
        points: 3,
        goalsFor: 3,
        goalsAgainst: 5,
        goalDifference: -2,
      },
    ];
    const result = await predict({ ...base, standings });
    expect(result.homeWinProbability).toBeGreaterThan(result.awayWinProbability);
  });

  it("h2h advantage shifts win probability toward leading team", async () => {
    const headToHead = {
      aggregates: {
        numberOfMatches: 3,
        totalGoals: 6,
        homeTeam: { wins: 3, draws: 0, losses: 0 },
        awayTeam: { wins: 0, draws: 0, losses: 3 },
      },
      matches: [],
    };
    const result = await predict({ ...base, headToHead });
    expect(result.homeWinProbability).toBeGreaterThan(result.awayWinProbability);
  });
});

describe("streamPrediction()", () => {
  it("yields token and prediction events with no API key", async () => {
    const events: Array<{ type: string }> = [];
    for await (const ev of streamPrediction(base)) {
      events.push(ev);
    }
    expect(events.some((e) => e.type === "token")).toBe(true);
    expect(events.some((e) => e.type === "prediction")).toBe(true);
  });

  it("prediction event data sums to 100", async () => {
    for await (const ev of streamPrediction(base)) {
      if (ev.type === "prediction") {
        const { homeWinProbability, drawProbability, awayWinProbability } = ev.data;
        expect(homeWinProbability + drawProbability + awayWinProbability).toBe(100);
      }
    }
  });

  it("emits exactly one prediction event", async () => {
    let count = 0;
    for await (const ev of streamPrediction(base)) {
      if (ev.type === "prediction") count++;
    }
    expect(count).toBe(1);
  });
});
