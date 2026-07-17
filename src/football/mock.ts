import type {
  Fixture,
  FootballClient,
  HeadToHeadResult,
  Standing,
  CompetitionRef,
  Team,
} from "./types.js";

const MOCK_TEAMS: Record<string, Team> = {
  ENG: { id: 66, name: "England", shortName: "England", tla: "ENG" },
  GER: { id: 4, name: "Germany", shortName: "Germany", tla: "GER" },
  BRA: { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" },
  ARG: { id: 1044, name: "Argentina", shortName: "Argentina", tla: "ARG" },
  FRA: { id: 773, name: "France", shortName: "France", tla: "FRA" },
  ESP: { id: 760, name: "Spain", shortName: "Spain", tla: "ESP" },
  POR: { id: 765, name: "Portugal", shortName: "Portugal", tla: "POR" },
  NED: { id: 1905, name: "Netherlands", shortName: "Netherlands", tla: "NED" },
};

function makeFixture(
  home: Team,
  away: Team,
  daysFromNow: number,
  homeGoals: number | null = null,
  awayGoals: number | null = null
): Fixture {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return {
    id: home.id * 1000 + away.id,
    utcDate: d.toISOString(),
    status: homeGoals !== null ? "FINISHED" : "SCHEDULED",
    homeTeam: home,
    awayTeam: away,
    score: {
      fullTime: { home: homeGoals, away: awayGoals },
      halfTime: { home: null, away: null },
    },
    competition: { id: 2000, name: "FIFA World Cup 2026" },
    matchday: 1,
  };
}

const MOCK_FIXTURES: Fixture[] = [
  makeFixture(MOCK_TEAMS.ENG, MOCK_TEAMS.GER, 3),
  makeFixture(MOCK_TEAMS.BRA, MOCK_TEAMS.ARG, 5),
  makeFixture(MOCK_TEAMS.FRA, MOCK_TEAMS.ESP, 7),
  makeFixture(MOCK_TEAMS.POR, MOCK_TEAMS.NED, 9),
  // recent results
  makeFixture(MOCK_TEAMS.ENG, MOCK_TEAMS.FRA, -14, 2, 1),
  makeFixture(MOCK_TEAMS.GER, MOCK_TEAMS.BRA, -10, 1, 1),
  makeFixture(MOCK_TEAMS.ARG, MOCK_TEAMS.ESP, -7, 3, 0),
  makeFixture(MOCK_TEAMS.NED, MOCK_TEAMS.POR, -3, 1, 2),
];

const MOCK_STANDINGS: Standing[] = [
  { position: 1, team: MOCK_TEAMS.ENG, playedGames: 3, won: 3, draw: 0, lost: 0, points: 9, goalsFor: 7, goalsAgainst: 2, goalDifference: 5, form: "W,W,W" },
  { position: 2, team: MOCK_TEAMS.GER, playedGames: 3, won: 2, draw: 1, lost: 0, points: 7, goalsFor: 5, goalsAgainst: 2, goalDifference: 3, form: "W,D,W" },
  { position: 3, team: MOCK_TEAMS.FRA, playedGames: 3, won: 2, draw: 0, lost: 1, points: 6, goalsFor: 4, goalsAgainst: 3, goalDifference: 1, form: "W,L,W" },
  { position: 4, team: MOCK_TEAMS.BRA, playedGames: 3, won: 1, draw: 1, lost: 1, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, form: "D,L,W" },
  { position: 5, team: MOCK_TEAMS.ARG, playedGames: 3, won: 1, draw: 0, lost: 2, points: 3, goalsFor: 5, goalsAgainst: 6, goalDifference: -1, form: "W,L,L" },
  { position: 6, team: MOCK_TEAMS.ESP, playedGames: 3, won: 1, draw: 0, lost: 2, points: 3, goalsFor: 2, goalsAgainst: 5, goalDifference: -3, form: "L,W,L" },
];

export class MockFootballClient implements FootballClient {
  async getFixtures(competitionCode: string, _matchday?: number): Promise<Fixture[]> {
    return MOCK_FIXTURES;
  }

  async getStandings(_competitionCode: string): Promise<Standing[]> {
    return MOCK_STANDINGS;
  }

  async getHeadToHead(matchId: number, limit = 10): Promise<HeadToHeadResult> {
    const fixture = MOCK_FIXTURES.find((f) => f.id === matchId);
    const past: Fixture[] = fixture
      ? [
          makeFixture(fixture.homeTeam, fixture.awayTeam, -365, 1, 0),
          makeFixture(fixture.awayTeam, fixture.homeTeam, -730, 2, 2),
          makeFixture(fixture.homeTeam, fixture.awayTeam, -1095, 0, 1),
        ].slice(0, limit)
      : [];
    const homeWins = past.filter(
      (m) =>
        m.homeTeam.id === fixture?.homeTeam.id &&
        (m.score.fullTime.home ?? 0) > (m.score.fullTime.away ?? 0)
    ).length;
    return {
      aggregates: {
        numberOfMatches: past.length,
        totalGoals: past.reduce(
          (s, m) => s + (m.score.fullTime.home ?? 0) + (m.score.fullTime.away ?? 0),
          0
        ),
        homeTeam: { wins: homeWins, draws: 1, losses: past.length - homeWins - 1 },
        awayTeam: {
          wins: past.length - homeWins - 1,
          draws: 1,
          losses: homeWins,
        },
      },
      matches: past,
    };
  }

  async findMatch(homeTeam: string, awayTeam: string): Promise<Fixture | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const hn = normalize(homeTeam);
    const an = normalize(awayTeam);
    return (
      MOCK_FIXTURES.find(
        (f) =>
          normalize(f.homeTeam.name).includes(hn) &&
          normalize(f.awayTeam.name).includes(an)
      ) ?? null
    );
  }

  async listCompetitions(): Promise<CompetitionRef[]> {
    return [{ id: 2000, name: "FIFA World Cup 2026", code: "WC" }];
  }
}
