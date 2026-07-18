import { describe, it, expect } from "vitest";
import { RateLimiter } from "../football/client.js";

describe("RateLimiter", () => {
  it("first call completes immediately (no wait)", async () => {
    const rl = new RateLimiter(200);
    const start = Date.now();
    await rl.throttle();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("serialises concurrent calls with correct spacing", async () => {
    const interval = 60;
    const rl = new RateLimiter(interval);
    const completions: number[] = [];

    await Promise.all([
      rl.throttle().then(() => completions.push(Date.now())),
      rl.throttle().then(() => completions.push(Date.now())),
      rl.throttle().then(() => completions.push(Date.now())),
    ]);

    expect(completions).toHaveLength(3);
    const sorted = [...completions].sort((a, b) => a - b);

    // Each consecutive completion should be at least (interval - tolerance) ms apart
    const tolerance = 20;
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(interval - tolerance);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(interval - tolerance);
  }, 2000); // generous timeout for timing test

  it("total elapsed time for N serial calls is at least (N-1)*interval", async () => {
    const interval = 50;
    const rl = new RateLimiter(interval);
    const n = 3;
    const start = Date.now();
    for (let i = 0; i < n; i++) await rl.throttle();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual((n - 1) * interval - 20);
  }, 1000);

  it("allows a fresh call after the interval has passed", async () => {
    const interval = 60;
    const rl = new RateLimiter(interval);
    await rl.throttle();
    await new Promise((r) => setTimeout(r, interval + 20));
    const start = Date.now();
    await rl.throttle();
    expect(Date.now() - start).toBeLessThan(30); // should be near-instant
  }, 2000);
});
