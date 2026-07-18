export interface Team {
  id: number;
  name: string;
  shortName: string;
  tla: string;
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
  minute?: number; // current match minute for IN_PLAY fixtures
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
  form?: string;
}

export interface TopScorer {
  position: number;
  player: { id: number; name: string; nationality: string };
  team: Team;
  goals: number;
  assists?: number;
  penalties?: number;
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

export interface FootballClient {
  getFixtures(competitionCode: string, matchday?: number): Promise<Fixture[]>;
  getStandings(competitionCode: string): Promise<Standing[]>;
  getHeadToHead(matchId: number, limit?: number): Promise<HeadToHeadResult>;
  getTopScorers(competitionCode: string): Promise<TopScorer[]>;
  getLiveScores(competitionCode?: string): Promise<Fixture[]>;
  getTeamForm(teamName: string, limit?: number): Promise<Fixture[]>;
  findMatch(homeTeam: string, awayTeam: string): Promise<Fixture | null>;
  listCompetitions(): Promise<CompetitionRef[]>;
}
