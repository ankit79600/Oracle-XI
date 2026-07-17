export interface Team {
  id: number;
  name: string;
  shortName: string;
  tla: string; // three-letter abbreviation
  crest?: string;
}

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Fixture {
  id: number;
  utcDate: string;
  status: "SCHEDULED" | "IN_PLAY" | "FINISHED" | "POSTPONED" | "CANCELLED";
  homeTeam: Team;
  awayTeam: Team;
  score: {
    fullTime: Score;
    halfTime: Score;
  };
  competition: {
    id: number;
    name: string;
  };
  matchday?: number;
}

export interface Standing {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string; // e.g. "W,W,L,D,W"
}

export interface HeadToHeadResult {
  aggregates: {
    numberOfMatches: number;
    totalGoals: number;
    homeTeam: { wins: number; draws: number; losses: number };
    awayTeam: { wins: number; draws: number; losses: number };
  };
  matches: Fixture[];
}

export interface CompetitionRef {
  id: number;
  name: string;
  code: string;
}

// Interface that all football clients must satisfy
export interface FootballClient {
  getFixtures(competitionCode: string, matchday?: number): Promise<Fixture[]>;
  getStandings(competitionCode: string): Promise<Standing[]>;
  getHeadToHead(matchId: number, limit?: number): Promise<HeadToHeadResult>;
  // Find a scheduled match by team names (fuzzy)
  findMatch(homeTeam: string, awayTeam: string): Promise<Fixture | null>;
  // List supported competitions
  listCompetitions(): Promise<CompetitionRef[]>;
}
