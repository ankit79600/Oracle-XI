import axios, { AxiosInstance } from "axios";
import NodeCache from "node-cache";
import { config } from "../config.js";
import type {
  Fixture,
  FootballClient,
  HeadToHeadResult,
  Standing,
  CompetitionRef,
} from "./types.js";

// football-data.org free tier: 10 req/min across these competitions
const FREE_COMPETITIONS = [
  "WC", "CL", "BL1", "DED", "BSA", "PD", "FL1", "ELC", "PPL", "EC", "SA", "PL"
];

class RateLimiter {
  private queue: Array<() => void> = [];
  private lastCallMs = 0;

  async throttle(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.lastCallMs + config.football.rateLimitMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallMs = Date.now();
  }
}

export class LiveFootballClient implements FootballClient {
  private http: AxiosInstance;
  private cache: NodeCache;
  private rl = new RateLimiter();

  constructor() {
    this.http = axios.create({
      baseURL: "https://api.football-data.org/v4",
      headers: { "X-Auth-Token": config.football.apiKey },
      timeout: 10_000,
    });
    this.cache = new NodeCache({ stdTTL: config.football.cacheTtlSeconds });
  }

  private async get<T>(path: string): Promise<T> {
    const cached = this.cache.get<T>(path);
    if (cached !== undefined) return cached;

    await this.rl.throttle();
    const { data } = await this.http.get<T>(path);
    this.cache.set(path, data);
    return data;
  }

  async getFixtures(competitionCode: string, matchday?: number): Promise<Fixture[]> {
    const md = matchday ? `&matchday=${matchday}` : "";
    const raw = await this.get<{ matches: Fixture[] }>(
      `/competitions/${competitionCode}/matches?status=SCHEDULED,IN_PLAY,FINISHED${md}`
    );
    return raw.matches;
  }

  async getStandings(competitionCode: string): Promise<Standing[]> {
    const raw = await this.get<{ standings: Array<{ table: Standing[] }> }>(
      `/competitions/${competitionCode}/standings`
    );
    return raw.standings[0]?.table ?? [];
  }

  async getHeadToHead(matchId: number, limit = 10): Promise<HeadToHeadResult> {
    return this.get<HeadToHeadResult>(
      `/matches/${matchId}/head2head?limit=${limit}`
    );
  }

  async findMatch(homeTeam: string, awayTeam: string): Promise<Fixture | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hn = normalize(homeTeam);
    const an = normalize(awayTeam);

    for (const code of FREE_COMPETITIONS) {
      try {
        const fixtures = await this.getFixtures(code);
        const match = fixtures.find(
          (f) =>
            (normalize(f.homeTeam.name).includes(hn) ||
              normalize(f.homeTeam.shortName).includes(hn) ||
              normalize(f.homeTeam.tla).includes(hn)) &&
            (normalize(f.awayTeam.name).includes(an) ||
              normalize(f.awayTeam.shortName).includes(an) ||
              normalize(f.awayTeam.tla).includes(an))
        );
        if (match) return match;
      } catch {
        // competition not available on free tier — skip
      }
    }
    return null;
  }

  async listCompetitions(): Promise<CompetitionRef[]> {
    const raw = await this.get<{ competitions: CompetitionRef[] }>("/competitions");
    return raw.competitions;
  }
}
