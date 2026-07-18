import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../api/server.js";

// All tests run with USE_MOCK_DATA=true and DEMO_MODE=true (set in setup.ts)

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.mock).toBe(true);
  });

  it("includes x402 pricing info", async () => {
    const res = await request(app).get("/health");
    expect(res.body.x402).toBeDefined();
    expect(res.body.x402.pricePro).toContain("0.01");
    expect(res.body.x402.priceQuick).toContain("0.003");
  });
});

describe("GET /fixtures", () => {
  it("returns fixtures array", async () => {
    const res = await request(app).get("/fixtures?competition=WC");
    expect(res.status).toBe(200);
    expect(res.body.fixtures).toBeInstanceOf(Array);
    expect(res.body.fixtures.length).toBeGreaterThan(0);
  });

  it("defaults to WC competition", async () => {
    const res = await request(app).get("/fixtures");
    expect(res.status).toBe(200);
    expect(res.body.fixtures).toBeInstanceOf(Array);
  });
});

describe("GET /standings", () => {
  it("returns standings array", async () => {
    const res = await request(app).get("/standings?competition=WC");
    expect(res.status).toBe(200);
    expect(res.body.standings).toBeInstanceOf(Array);
    expect(res.body.standings.length).toBeGreaterThan(0);
  });

  it("standings have position and points", async () => {
    const res = await request(app).get("/standings");
    const [first] = res.body.standings;
    expect(first.position).toBe(1);
    expect(first.points).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /live", () => {
  it("returns a count and fixtures array", async () => {
    const res = await request(app).get("/live");
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.fixtures).toBeInstanceOf(Array);
    expect(res.body.count).toBe(res.body.fixtures.length);
  });
});

describe("GET /scorers/:competition", () => {
  it("returns scorers for WC", async () => {
    const res = await request(app).get("/scorers/WC");
    expect(res.status).toBe(200);
    expect(res.body.competition).toBe("WC");
    expect(res.body.scorers).toBeInstanceOf(Array);
    expect(res.body.scorers.length).toBeGreaterThan(0);
  });

  it("normalises competition code to uppercase", async () => {
    const res = await request(app).get("/scorers/wc");
    expect(res.status).toBe(200);
    expect(res.body.competition).toBe("WC");
  });
});

describe("GET /team-form", () => {
  it("returns form for a known team", async () => {
    const res = await request(app).get("/team-form?team=England");
    expect(res.status).toBe(200);
    expect(res.body.team).toBe("England");
    expect(res.body.fixtures).toBeInstanceOf(Array);
  });

  it("returns 400 when team param is missing", async () => {
    const res = await request(app).get("/team-form");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GET /h2h/:matchId", () => {
  it("returns head-to-head data", async () => {
    const fixturesRes = await request(app).get("/fixtures");
    const matchId = fixturesRes.body.fixtures[0].id;

    const res = await request(app).get(`/h2h/${matchId}`);
    expect(res.status).toBe(200);
    expect(res.body.aggregates).toBeDefined();
    expect(res.body.matches).toBeInstanceOf(Array);
  });
});

describe("GET /predict/demo", () => {
  it("returns a prediction in demo mode", async () => {
    const res = await request(app)
      .get("/predict/demo")
      .query({ home: "England", away: "Germany", tier: "quick" });
    expect(res.status).toBe(200);
    expect(res.body.prediction).toBeDefined();
    expect(res.body.tier).toBe("quick");
    expect(res.body.match).toBe("England vs Germany");
  });

  it("returns 400 when home or away is missing", async () => {
    const res = await request(app).get("/predict/demo?home=England");
    expect(res.status).toBe(400);
  });

  it("prediction probabilities sum to 100", async () => {
    const res = await request(app)
      .get("/predict/demo")
      .query({ home: "Brazil", away: "Argentina" });
    const { prediction: p } = res.body;
    expect(p.homeWinProbability + p.drawProbability + p.awayWinProbability).toBe(100);
  });
});

describe("x402-gated routes without payment", () => {
  it("GET /predict returns 402 with payment details", async () => {
    // DEMO_MODE=true so the demo middleware runs instead of the real one.
    // Demo middleware returns 402 when there is no PAYMENT-SIGNATURE header.
    const res = await request(app).get("/predict?home=England&away=Germany");
    expect(res.status).toBe(402);
    expect(res.body.accepts).toBeDefined();
  });

  it("GET /predict/quick returns 402 without payment", async () => {
    const res = await request(app).get("/predict/quick?home=England&away=Germany");
    expect(res.status).toBe(402);
  });
});
