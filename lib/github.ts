import type {
  CompetitionResult,
  ContentLocale,
  Evidence,
  SearchInput,
  SearchResponse,
} from "@/types/search";

const GITHUB_API = "https://api.github.com";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CANDIDATES = 60;

type GithubRepository = {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  created_at: string;
  topics?: string[];
  license: { spdx_id?: string; name?: string } | null;
  archived: boolean;
  default_branch: string;
  owner: { login: string };
};

type GithubSearchResponse = {
  total_count: number;
  incomplete_results: boolean;
  items: GithubRepository[];
};

type CacheEntry = { expiresAt: number; value: SearchResponse };
const responseCache = new Map<string, CacheEntry>();

const GENERIC_TERMS = [
  "創新創意競賽",
  "創新競賽",
  "創意競賽",
  "競賽",
  "比賽",
  "大賽",
  "competition",
  "contest",
  "challenge",
  "hackathon",
];

const COMPETITION_MARKERS = [
  "參賽",
  "競賽",
  "比賽",
  "決賽",
  "獲獎",
  "得獎",
  "作品",
  "competition",
  "contest",
  "hackathon",
  "challenge",
  "award",
  "finalist",
];

const DIRECT_PARTICIPATION_MARKERS = [
  "參賽作品",
  "參加競賽",
  "參加比賽",
  "決賽作品",
  "競賽專案",
  "比賽作品",
  "submission for",
  "submitted to",
  "built for",
  "created for",
  "developed for",
  "project for",
  "team project",
  "finalist",
  "winner",
  "團隊",
  "team",
];

const REFERENCE_REPOSITORY_MARKERS = ["awesome", "resources", "resource", "list", "links", "portfolio", "profile"];
const SELF_REPOSITORIES = new Set(["lxuaneneliko/saiji-competition-search"]);
const UNAUTHENTICATED_QUERY_BUDGET = 2;
const AUTHENTICATED_QUERY_BUDGET = 4;

const KNOWN_COMPETITION_ALIASES: Record<string, string[]> = {
  "新竹青春點子": ["新竹縣青春靚點子全國學生創業挑戰賽", "青春靚點子"],
  "新竹縣青春點子": ["新竹縣青春靚點子全國學生創業挑戰賽", "青春靚點子"],
  "青春點子": ["青春靚點子", "新竹縣青春靚點子全國學生創業挑戰賽"],
  "青春靚點子": ["新竹縣青春靚點子全國學生創業挑戰賽"],
};

function clean(value: string | undefined, maxLength: number) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function quote(value: string) {
  return `"${value.replaceAll('"', "")}"`;
}

function compactCore(value: string) {
  let core = value;
  for (const term of GENERIC_TERMS) {
    core = core.replace(new RegExp(term, "giu"), " ");
  }
  return core.replace(/\s+/g, " ").trim();
}

function segmentWords(value: string) {
  const segmenter = new Intl.Segmenter("zh-TW", { granularity: "word" });
  return [...segmenter.segment(value)]
    .filter((item) => item.isWordLike)
    .map((item) => item.segment.trim())
    .filter(Boolean);
}

function buildNearNameVariants(value: string) {
  const words = segmentWords(value);
  if (words.length < 3 || words.length > 8 || !/\p{Script=Han}/u.test(value)) return [];

  const interior = words.slice(1, -1).map((_, index) => index + 1);
  const omissionOrder = [...interior, 0, words.length - 1];
  return omissionOrder
    .map((omitIndex) => words.filter((_, index) => index !== omitIndex).join(""))
    .filter((item) => normalize(item).length >= 4)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 3);
}

function buildOrganizerlessVariants(value: string) {
  const withoutPrefix = value.replace(
    /^.{2,16}?(?:科技大學|技術學院|專科學校|大學|學院|高中|高職|國中|縣政府|市政府|教育局)(?=.{4,})/u,
    "",
  ).trim();

  return withoutPrefix && normalize(withoutPrefix) !== normalize(value) ? [withoutPrefix] : [];
}

function competitionNames(input: SearchInput) {
  const knownAliases = KNOWN_COMPETITION_ALIASES[normalize(input.competition)] ?? [];
  return [input.competition, ...(input.aliases ?? []), ...knownAliases]
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((candidate) => normalize(candidate) === normalize(item)) === index);
}

function competitionPhrases(input: SearchInput) {
  const names = competitionNames(input);
  return [...names, ...names.flatMap(buildOrganizerlessVariants)]
    .filter((item, index, array) => array.findIndex((candidate) => normalize(candidate) === normalize(item)) === index);
}

export function isExcludedRepositoryName(fullName: string) {
  return SELF_REPOSITORIES.has(fullName.trim().toLocaleLowerCase());
}

export function sanitizeInput(raw: SearchInput): SearchInput {
  const competition = clean(raw.competition, 100);
  const year = clean(raw.year, 12);
  const organizer = clean(raw.organizer, 80);
  const aliases = (raw.aliases ?? [])
    .map((item) => clean(item, 80))
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 5);

  if (competition.length < 2) {
    throw new Error("請輸入至少 2 個字的競賽名稱。");
  }

  return {
    competition,
    ...(year ? { year } : {}),
    ...(organizer ? { organizer } : {}),
    ...(aliases.length ? { aliases } : {}),
  };
}

export function buildSearchQueries(input: SearchInput) {
  const suffix = "in:name,description,readme";
  const contextual = [input.year, input.organizer].filter(Boolean).join(" ");
  const core = compactCore(input.competition);
  const aliases = competitionNames(input).slice(1);
  const queries = [`${quote(input.competition)} ${contextual} ${suffix}`];

  for (const alias of aliases.slice(0, 2)) {
    queries.push(`${quote(alias)} ${contextual} ${suffix}`);
  }

  for (const organizerless of buildOrganizerlessVariants(input.competition)) {
    queries.push(`${quote(organizerless)} ${input.year ?? ""} ${suffix}`);
  }

  for (const nearName of buildNearNameVariants(input.competition)) {
    queries.push(`${quote(nearName)} ${contextual} ${suffix}`);
  }

  queries.push(`${input.competition} ${contextual} ${suffix}`);

  if (core && normalize(core) !== normalize(input.competition)) {
    queries.push(`${quote(core)} ${input.year ?? ""} ${suffix}`);
  }

  for (const alias of aliases.slice(2)) {
    queries.push(`${quote(alias)} ${contextual} ${suffix}`);
  }

  if (input.organizer && core) {
    queries.push(`${quote(input.organizer)} ${quote(core)} ${suffix}`);
  }

  return queries
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 6);
}

export function selectSearchQueries(queries: string[], authenticated: boolean) {
  return queries.slice(0, authenticated ? AUTHENTICATED_QUERY_BUDGET : UNAUTHENTICATED_QUERY_BUDGET);
}

function getHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Saiji-Competition-Search",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function searchRepositories(query: string) {
  const url = new URL("/search/repositories", GITHUB_API);
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "50");

  const response = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: 900 },
  });

  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const limit = Number(response.headers.get("x-ratelimit-limit"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.status === 403 || response.status === 429) {
      throw new Error("GitHub 搜尋暫時達到使用上限，請稍後再試。");
    }
    throw new Error(body?.message || `GitHub 搜尋失敗（${response.status}）`);
  }

  return {
    data: (await response.json()) as GithubSearchResponse,
    rate: {
      remaining: Number.isFinite(remaining) ? remaining : null,
      limit: Number.isFinite(limit) ? limit : null,
      resetAt: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null,
    },
  };
}

function rawReadmeUrl(repo: GithubRepository, filename = "README.md") {
  const branch = repo.default_branch.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo.full_name}/${branch}/${filename}`;
}

async function fetchReadme(repo: GithubRepository) {
  for (const filename of ["README.md", "readme.md", "README.MD"]) {
    const response = await fetch(rawReadmeUrl(repo, filename), {
      cache: "no-store",
      headers: { Range: "bytes=0-219999" },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (response?.ok) {
      const text = await response.text();
      return text.slice(0, 220_000);
    }
  }
  return "";
}

function findSnippet(text: string, needles: string[]) {
  const cleaned = text
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const units = cleaned.split(/\n|→|=>|｜|\||(?<=[。！？.!?])\s+/u).map((item) => item.trim()).filter(Boolean);
  const normalizedNeedles = [...needles].sort((a, b) => b.length - a.length).map(normalize);
  for (const unit of units) {
    const normalizedUnit = normalize(unit);
    if (normalizedNeedles.some((needle) => needle.length >= 2 && normalizedUnit.includes(needle))) {
      return unit.length > 240 ? `${unit.slice(0, 240)}…` : unit;
    }
  }
  return units.join(" ").slice(0, 180);
}

function containsPhraseWithinUnit(text: string, needles: string[]) {
  const normalizedNeedles = needles.map(normalize).filter((item) => item.length >= 2);
  return text
    .split(/\r?\n|[。！？.!?]|→|=>|｜|\|/u)
    .some((unit) => {
      const normalizedUnit = normalize(unit);
      return normalizedNeedles.some((needle) => normalizedUnit.includes(needle));
    });
}

function detectContentLocale(repo: GithubRepository, readme: string): ContentLocale {
  const sample = `${repo.name}\n${repo.description ?? ""}\n${readme.slice(0, 20_000)}`;
  const hangulCount = sample.match(/\p{Script=Hangul}/gu)?.length ?? 0;
  const kanaCount = sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  const hanCount = sample.match(/\p{Script=Han}/gu)?.length ?? 0;

  if (hangulCount >= 4) return "ko";
  if (kanaCount >= 4) return "ja";
  if (hanCount >= 4) return "zh";
  return "en";
}

function distinctiveTokens(input: SearchInput) {
  const source = [...competitionPhrases(input), input.organizer ?? ""];
  const tokens = source.flatMap((value) => {
    const spaced = value.normalize("NFKC").split(/[\s/|、,，:：()（）\-_]+/u);
    const segmented = segmentWords(value);
    const core = compactCore(value);
    return [...spaced, ...segmented, core];
  });
  return tokens
    .map((item) => normalize(item))
    .filter((item) => item.length >= 2)
    .filter((item) => !GENERIC_TERMS.map(normalize).includes(item))
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 12);
}

function scoreRepository(repo: GithubRepository, readme: string, input: SearchInput, matchedQuery: string) {
  const names = competitionPhrases(input);
  const nearNames = names.flatMap(buildNearNameVariants);
  const normalizedNames = names.map(normalize);
  const nameText = repo.name;
  const descriptionText = repo.description ?? "";
  const topicText = (repo.topics ?? []).join(" ");
  const combined = [nameText, descriptionText, topicText, readme].join("\n");
  const normalizedFields = {
    name: normalize(nameText),
    description: normalize(descriptionText),
    topics: normalize(topicText),
    readme: normalize(readme),
    combined: normalize(combined),
  };
  const evidence: Evidence[] = [];
  const contentLocale = detectContentLocale(repo, readme);
  let score = 0;

  const exactName = normalizedNames.some((needle) => needle.length >= 2 && normalizedFields.name.includes(needle));
  const exactDescription = normalizedNames.some((needle) => needle.length >= 2 && normalizedFields.description.includes(needle));
  const exactReadme = containsPhraseWithinUnit(readme, names);
  const exactTopic = normalizedNames.some((needle) => needle.length >= 2 && normalizedFields.topics.includes(needle));
  const fuzzyReadme = !exactReadme && containsPhraseWithinUnit(readme, nearNames);

  if (exactName) {
    score += 42;
    evidence.push({ source: "名稱", text: repo.name });
  }
  if (exactDescription) {
    score += 35;
    evidence.push({ source: "描述", text: descriptionText.slice(0, 220) });
  }
  if (exactReadme) {
    score += 36;
    evidence.push({ source: "README", text: findSnippet(readme, names) });
  }
  if (fuzzyReadme) {
    score += 32;
    evidence.push({ source: "README", text: findSnippet(readme, nearNames) });
  }
  if (exactTopic) {
    score += 24;
    evidence.push({ source: "Topics", text: (repo.topics ?? []).join(" · ") });
  }

  const tokens = distinctiveTokens(input);
  const tokenHits = tokens.filter((token) => normalizedFields.combined.includes(token));
  if (tokens.length) score += Math.round((tokenHits.length / tokens.length) * (exactName || exactDescription || exactReadme ? 9 : 24));

  const organizer = normalize(input.organizer ?? "");
  if (organizer && normalizedFields.combined.includes(organizer)) score += 12;
  if (input.year && combined.includes(input.year)) score += 9;

  const markerHits = COMPETITION_MARKERS.filter((marker) => normalizedFields.combined.includes(normalize(marker)));
  if (markerHits.length) {
    score += Math.min(8, 3 + markerHits.length);
    if (!evidence.some((item) => item.source === "README") && readme) {
      evidence.push({ source: "README", text: findSnippet(readme, markerHits) });
    }
  }

  const matchContext = findSnippet(readme, [...names, ...nearNames]);
  const normalizedContext = normalize(matchContext);
  const directMarkers = DIRECT_PARTICIPATION_MARKERS.filter((marker) => normalizedContext.includes(normalize(marker)));
  const directParticipation = (exactReadme || fuzzyReadme) && directMarkers.length > 0;
  if (directParticipation) {
    score += 20;
    evidence.push({ source: "專案訊號", text: `競賽名稱附近出現直接參賽語句：${directMarkers.slice(0, 2).join("、")}` });
  }

  const artifactSignals = [repo.homepage, /demo|prototype|簡報|成果|展示|deploy|pages/iu.test(readme) ? "artifact" : ""]
    .filter(Boolean);
  if (artifactSignals.length) {
    score += Math.min(6, artifactSignals.length * 3);
    evidence.push({
      source: "專案訊號",
      text: repo.homepage ? `附有展示網址：${repo.homepage}` : "README 含有 Demo、成果或展示資訊",
    });
  }


  const normalizedRepoName = normalize(repo.name);
  const profileRepository = normalizedRepoName === normalize(repo.owner.login);
  const referenceRepository = REFERENCE_REPOSITORY_MARKERS.some((marker) => normalizedRepoName.includes(marker));
  if (profileRepository && !exactName && !exactDescription) score -= 30;
  if (referenceRepository && !exactName && !exactDescription) score -= 24;

  if (repo.archived) score -= 6;
  if (contentLocale === "zh") score += 10;
  if (contentLocale === "en") score += 2;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    confidence: score >= 72 ? "strong" as const : score >= 47 ? "probable" as const : "lead" as const,
    evidence: evidence.slice(0, 4),
    matchedQuery,
    contentLocale,
    phraseMatched: exactName || exactDescription || exactReadme || exactTopic || fuzzyReadme,
  };
}

export async function searchCompetitions(rawInput: SearchInput): Promise<SearchResponse> {
  const input = sanitizeInput(rawInput);
  const cacheKey = JSON.stringify(input);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const startedAt = Date.now();
  const authenticated = Boolean(process.env.GITHUB_TOKEN?.trim());
  const queries = selectSearchQueries(buildSearchQueries(input), authenticated);
  const settled = await Promise.allSettled(queries.map(searchRepositories));
  const warnings: string[] = [];
  const deduped = new Map<number, { repo: GithubRepository; matchedQuery: string }>();
  let totalCandidates = 0;
  let remaining: number | null = null;
  let limit: number | null = null;
  let resetAt: string | null = null;

  const successfulSearches: Array<{ index: number; value: Awaited<ReturnType<typeof searchRepositories>> }> = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      warnings.push(outcome.reason instanceof Error ? outcome.reason.message : "部分搜尋來源暫時無法使用。");
      return;
    }
    successfulSearches.push({ index, value: outcome.value });
    totalCandidates = Math.max(totalCandidates, outcome.value.data.total_count);
    const rate = outcome.value.rate;
    if (rate.remaining !== null) remaining = remaining === null ? rate.remaining : Math.min(remaining, rate.remaining);
    if (rate.limit !== null) limit = rate.limit;
    if (rate.resetAt) resetAt = rate.resetAt;
  });

  const longestResult = Math.max(0, ...successfulSearches.map((item) => item.value.data.items.length));
  for (let rank = 0; rank < longestResult && deduped.size < MAX_CANDIDATES * 2; rank += 1) {
    for (const search of successfulSearches) {
      const repo = search.value.data.items[rank];
      if (repo && !deduped.has(repo.id)) {
        deduped.set(repo.id, { repo, matchedQuery: queries[search.index] });
      }
    }
  }

  const rateLimited = warnings.some((warning) => warning.includes("使用上限"));
  if (!deduped.size && (warnings.length === settled.length || rateLimited)) {
    throw new Error(warnings[0] || "目前無法連線至 GitHub 搜尋服務。");
  }

  const candidates = [...deduped.values()]
    .filter(({ repo }) => !isExcludedRepositoryName(repo.full_name))
    .slice(0, MAX_CANDIDATES);
  const readmes = await Promise.all(candidates.map(({ repo }) => fetchReadme(repo)));
  const assessedResults = candidates
    .map(({ repo, matchedQuery }, index) => {
      const assessment = scoreRepository(repo, readmes[index], input, matchedQuery);
      return {
        id: repo.id,
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        url: repo.html_url,
        description: repo.description ?? "這個專案沒有提供描述。",
        homepage: repo.homepage || null,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updatedAt: repo.updated_at,
        createdAt: repo.created_at,
        topics: repo.topics ?? [],
        license: repo.license?.spdx_id || repo.license?.name || null,
        archived: repo.archived,
        contentLocale: assessment.contentLocale,
        score: assessment.score,
        confidence: assessment.confidence,
        evidence: assessment.evidence,
        readmeUrl: `${repo.html_url}#readme`,
        matchedQuery: assessment.matchedQuery,
        phraseMatched: assessment.phraseMatched,
      };
    })
    .filter((item) => item.phraseMatched && item.score >= 20 && item.contentLocale !== "ja" && item.contentLocale !== "ko")
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const results: CompetitionResult[] = assessedResults.map((item) => {
    const result: Partial<typeof item> = { ...item };
    delete result.phraseMatched;
    return result as CompetitionResult;
  });

  const value: SearchResponse = {
    query: input,
    expandedQueries: queries,
    results,
    totalCandidates: Math.max(totalCandidates, deduped.size),
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    rateLimit: {
      remaining,
      limit,
      resetAt,
      authenticated,
    },
    warnings: [...new Set(warnings)],
  };

  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
