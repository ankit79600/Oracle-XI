import { describe, it, expect } from "vitest";
import { MockFootballClient } from "../football/mock.js";

const client = new MockFootballClient();

describe("MockFootballClient", () => {
  describe("getFixtures", () => {
    it("returns a non-empty array", async () => {
      const fixtures = await client.getFixtures("WC");
      expect(fixtures.length).toBeGreaterThan(0);
    });

    it("each fixture has required fields", async () => {
      const [f] = await client.getFixtures("WC");
      expect(f).toMatchObject({
        id: expect.any(Number),
        utcDate: expect.any(String),
        status: expect.stringMatching(/^(SCHEDULED|IN_PLAY|FINISHED|POSTPONED|CANCELLED)$/),
        homeTeam: { id: expect.any(Number), name: expect.any(String) },
        awayTeam: { id: expect.any(Number), name: expect.any(String) },
        competition: { id: expect.any(Number), name: expect.any(String) },
      });
    });
  });

  describe("getStandings", () => {
    it("returns standings array", async () => {
      const standings = await client.getStandings("WC");
      expect(standings.length).toBeGreaterThan(0);
    });

    it("positions are sequential starting at 1", async () => {
      const standings = await client.getStandings("WC");
      standings.forEach((s, i) => expect(s.position).toBe(i + 1));
    });

    it("all points are non-negative", async () => {
      const standings = await client.getStandings("WC");
      standings.forEach((s) => expect(s.points).toBeGreaterThanOrEqual(0));
    });

    it("wins + draws + losses equals playedGames", async () => {
      const standings = await client.getStandings("WC");
      standings.forEach((s) =>
        expect(s.won + s.draw + s.lost).toBe(s.playedGames)
      );
    });
  });

  describe("getHeadToHead", () => {
    it("returns h2h data for a known match", async () => {
      const fixtures = await client.getFixtures("WC");
      const match = fixtures[0];
      const h2h = await client.getHeadToHead(match.id);
      expect(h2h.aggregates).toBeDefined();
      expect(h2h.matches).toBeInstanceOf(Array);
    });

    it("aggregate home wins + draws + away wins equals numberOfMatches", async () => {
      const fixtures = await client.getFixtures("WC");
      const h2h = await client.getHeadToHead(fixtures[0].id);
      const { aggregates } = h2h;
      expect(
        aggregates.homeTeam.wins + aggregates.homeTeam.draws + aggregates.awayTeam.wins
      ).toBe(aggregates.numberOfMatches);
    });
  });

  describe("getTopScorers", () => {
    it("returns scorers in position order", async () => {
      const scorers = await client.getTopScorers("WC");
      expect(scorers.length).toBeGreaterThan(0);
      scorers.forEach((s, i) => expect(s.position).toBe(i + 1));
    });

    it("every scorer has goals > 0", async () => {
      const scorers = await client.getTopScorers("WC");
      scorers.forEach((s) => expect(s.goals).toBeGreaterThan(0));
    });

    it("scorer has player and team info", async () => {
      const [s] = await client.getTopScorers("WC");
      expect(s.player.name).toBeTruthy();
      expect(s.team.name).toBeTruthy();
    });
  });

  describe("getLiveScores", () => {
    it("returns an array", async () => {
      const live = await client.getLiveScores();
      expect(live).toBeInstanceOf(Array);
    });

    it("all returned fixtures are IN_PLAY", async () => {
      const live = await client.getLiveScores();
      live.forEach((f) => expect(f.status).toBe("IN_PLAY"));
    });

    it("accepts an optional competition filter", async () => {
      const live = await client.getLiveScores("WC");
      expect(live).toBeInstanceOf(Array);
    });
  });

  describe("getTeamForm", () => {
    it("returns only FINISHED matches", async () => {
      const form = await client.getTeamForm("England");
      form.forEach((f) => expect(f.status).toBe("FINISHED"));
    });

    it("every result involves the requested team", async () => {
      const form = await client.getTeamForm("England");
      form.forEach((f) => {
        const involved =
          f.homeTeam.name.toLowerCase().includes("england") ||
          f.awayTeam.name.toLowerCase().includes("england");
        expect(involved).toBe(true);
      });
    });

    it("respects the limit parameter", async () => {
      const form = await client.getTeamForm("England", 2);
      expect(form.length).toBeLessThanOrEqual(2);
    });

    it("returns empty array for unknown team", async () => {
      const form = await client.getTeamForm("Atlantis");
      expect(form).toHaveLength(0);
    });
  });

  describe("findMatch", () => {
    it("finds an existing scheduled match", async () => {
      const match = await client.findMatch("England", "Germany");
      expect(match).not.toBeNull();
      expect(match?.homeTeam.name).toContain("England");
      expect(match?.awayTeam.name).toContain("Germany");
    });

    it("returns null for a non-existent match", async () => {
      const match = await client.findMatch("Atlantis", "Narnia");
      expect(match).toBeNull();
    });

    it("matching is case-insensitive", async () => {
      const match = await client.findMatch("england", "germany");
      expect(match).not.toBeNull();
    });
  });

  describe("listCompetitions", () => {
    it("returns at least one competition", async () => {
      const comps = await client.listCompetitions();
      expect(comps.length).toBeGreaterThan(0);
    });

    it("each competition has id, name, and code", async () => {
      const [c] = await client.listCompetitions();
      expect(c).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        code: expect.any(String),
      });
    });
  });
});
