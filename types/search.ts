export type Confidence = "strong" | "probable" | "lead";
export type ContentLocale = "zh" | "en" | "ja" | "ko";

export interface SearchInput {
  competition: string;
  year?: string;
  organizer?: string;
  aliases?: string[];
}

export interface Evidence {
  source: "名稱" | "描述" | "README" | "Topics" | "專案訊號";
  text: string;
}

export interface CompetitionResult {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  createdAt: string;
  topics: string[];
  license: string | null;
  archived: boolean;
  contentLocale: ContentLocale;
  score: number;
  confidence: Confidence;
  evidence: Evidence[];
  readmeUrl: string;
  matchedQuery: string;
}

export interface SearchResponse {
  query: SearchInput;
  expandedQueries: string[];
  results: CompetitionResult[];
  totalCandidates: number;
  searchedAt: string;
  durationMs: number;
  rateLimit: {
    remaining: number | null;
    limit: number | null;
    resetAt: string | null;
    authenticated: boolean;
  };
  warnings: string[];
}
