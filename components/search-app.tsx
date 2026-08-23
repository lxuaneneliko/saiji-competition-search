"use client";

import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Filter,
  Github,
  Globe2,
  History,
  Languages,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PwaControls } from "@/components/pwa-controls";
import type { CompetitionResult, Confidence, SearchInput, SearchResponse } from "@/types/search";

type SortMode = "relevance" | "updated" | "stars";
type ViewMode = "search" | "saved";

const EXAMPLES = [
  { label: "新竹青春點子", competition: "新竹青春點子" },
  { label: "SDGs 創新創意競賽", competition: "SDGs 創新創意競賽" },
  { label: "NASA Space Apps", competition: "NASA Space Apps Challenge" },
  { label: "總統盃黑客松", competition: "總統盃黑客松", aliases: ["Presidential Hackathon"] },
];

const CONFIDENCE_COPY: Record<Confidence, { label: string; short: string }> = {
  strong: { label: "強證據", short: "STRONG" },
  probable: { label: "可能相關", short: "PROBABLE" },
  lead: { label: "探索線索", short: "LEAD" },
};

const LOCALE_COPY = { zh: "中文", en: "EN", ja: "日本語", ko: "한국어" } as const;

const EMPTY_FORM = { competition: "", year: "", organizer: "", aliases: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW", { notation: value > 999 ? "compact" : "standard" }).format(value);
}

function toInput(form: typeof EMPTY_FORM): SearchInput {
  return {
    competition: form.competition.trim(),
    ...(form.year.trim() ? { year: form.year.trim() } : {}),
    ...(form.organizer.trim() ? { organizer: form.organizer.trim() } : {}),
    aliases: form.aliases.split(/[|、,，\n]+/).map((item) => item.trim()).filter(Boolean),
  };
}

function buildApiUrl(input: SearchInput) {
  const params = new URLSearchParams({ competition: input.competition });
  if (input.year) params.set("year", input.year);
  if (input.organizer) params.set("organizer", input.organizer);
  for (const alias of input.aliases ?? []) params.append("alias", alias);
  return `/api/search?${params.toString()}`;
}

function buildPageUrl(input: SearchInput) {
  const params = new URLSearchParams({ q: input.competition });
  if (input.year) params.set("year", input.year);
  if (input.organizer) params.set("organizer", input.organizer);
  if (input.aliases?.length) params.set("aliases", input.aliases.join("|"));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function confidenceRank(value: Confidence) {
  return value === "strong" ? 3 : value === "probable" ? 2 : 1;
}

function ScoreGauge({ score }: { score: number }) {
  return (
    <div className="score-gauge" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties} aria-label={`可信度分數 ${score}`}>
      <span>{score}</span>
      <small>/100</small>
    </div>
  );
}

function ResultCard({ result, saved, onToggleSave }: { result: CompetitionResult; saved: boolean; onToggleSave: () => void }) {
  const confidence = CONFIDENCE_COPY[result.confidence];
  return (
    <article className={`result-card confidence-${result.confidence}`}>
      <div className="card-index" aria-hidden="true">{String(result.id).slice(-4).padStart(4, "0")}</div>
      <div className="result-main">
        <div className="result-kicker">
          <span className={`confidence-pill ${result.confidence}`}><i />{confidence.label}</span>
          <span>{confidence.short}</span>
          {result.archived && <span className="archive-pill">已封存</span>}
        </div>
        <div className="result-title-row">
          <div>
            <p className="repo-owner">{result.owner} /</p>
            <h3><a href={result.url} target="_blank" rel="noreferrer">{result.name}<ArrowUpRight size={19} /></a></h3>
          </div>
          <button className={`save-button ${saved ? "is-saved" : ""}`} onClick={onToggleSave} aria-label={saved ? "取消收藏" : "收藏專案"}>
            {saved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
          </button>
        </div>
        <p className="result-description">{result.description}</p>

        <div className="evidence-stack">
          {result.evidence.length ? result.evidence.map((evidence, index) => (
            <div className="evidence-row" key={`${evidence.source}-${index}`}>
              <span>{evidence.source}</span>
              <p>{evidence.text}</p>
            </div>
          )) : (
            <div className="evidence-row muted-evidence">
              <span>搜尋命中</span><p>GitHub 搜尋索引判定相關，請進入 Repository 人工確認。</p>
            </div>
          )}
        </div>

        <div className="repo-meta">
          <span className={`locale-badge locale-${result.contentLocale}`}>{LOCALE_COPY[result.contentLocale]}</span>
          {result.language && <span><Languages size={14} />{result.language}</span>}
          <span><Star size={14} />{formatNumber(result.stars)}</span>
          <span><CalendarDays size={14} />更新 {formatDate(result.updatedAt)}</span>
          {result.license && <span>{result.license}</span>}
        </div>

        <div className="result-actions">
          <a href={result.url} target="_blank" rel="noreferrer"><Github size={16} />查看原始專案</a>
          <a href={result.readmeUrl} target="_blank" rel="noreferrer"><FileSearch size={16} />檢查 README</a>
          {result.homepage && <a href={result.homepage} target="_blank" rel="noreferrer"><Globe2 size={16} />開啟展示</a>}
        </div>
      </div>
      <aside className="result-score">
        <ScoreGauge score={result.score} />
        <p>關聯可信度</p>
        <span>仍需人工確認<br />是否正式參賽</span>
      </aside>
    </article>
  );
}

export function SearchApp() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [sort, setSort] = useState<SortMode>("relevance");
  const [confidence, setConfidence] = useState<"all" | Confidence>("all");
  const [language, setLanguage] = useState("all");
  const [withDemo, setWithDemo] = useState(false);
  const [view, setView] = useState<ViewMode>("search");
  const [saved, setSaved] = useState<CompetitionResult[]>([]);
  const [recent, setRecent] = useState<SearchInput[]>([]);
  const [copied, setCopied] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const activeRequest = useRef<AbortController | null>(null);

  const executeSearch = useCallback(async (input: SearchInput, updateUrl = true) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    setView("search");
    setVisibleCount(12);
    try {
      const apiResponse = await fetch(buildApiUrl(input), { signal: controller.signal });
      const payload = await apiResponse.json() as SearchResponse & { error?: string };
      if (!apiResponse.ok) throw new Error(payload.error || "搜尋服務沒有正常回應。");
      setResponse(payload);
      if (updateUrl) window.history.replaceState({}, "", buildPageUrl(input));
      setRecent((current) => {
        const next = [input, ...current.filter((item) => JSON.stringify(item) !== JSON.stringify(input))].slice(0, 6);
        localStorage.setItem("saiji:recent", JSON.stringify(next));
        return next;
      });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "搜尋時發生未預期錯誤。");
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      try {
        setSaved(JSON.parse(localStorage.getItem("saiji:saved") || "[]") as CompetitionResult[]);
        setRecent(JSON.parse(localStorage.getItem("saiji:recent") || "[]") as SearchInput[]);
      } catch {
        localStorage.removeItem("saiji:saved");
        localStorage.removeItem("saiji:recent");
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") === "saved") setView("saved");
      const competition = params.get("q")?.trim();
      if (competition) {
        const initial = {
          competition,
          year: params.get("year") || "",
          organizer: params.get("organizer") || "",
          aliases: params.get("aliases") || "",
        };
        setForm(initial);
        if (initial.year || initial.organizer || initial.aliases) setAdvanced(true);
        void executeSearch(toInput(initial), false);
      }
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, [executeSearch]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = toInput(form);
    if (input.competition.length < 2) {
      setError("請輸入至少 2 個字的競賽名稱。");
      return;
    }
    void executeSearch(input);
  };

  const applyInput = (input: SearchInput) => {
    const next = {
      competition: input.competition,
      year: input.year ?? "",
      organizer: input.organizer ?? "",
      aliases: input.aliases?.join("、") ?? "",
    };
    setForm(next);
    if (next.year || next.organizer || next.aliases) setAdvanced(true);
    void executeSearch(input);
  };

  const toggleSaved = (result: CompetitionResult) => {
    setSaved((current) => {
      const exists = current.some((item) => item.id === result.id);
      const next = exists ? current.filter((item) => item.id !== result.id) : [result, ...current];
      localStorage.setItem("saiji:saved", JSON.stringify(next));
      return next;
    });
  };

  const sourceResults = useMemo(
    () => view === "saved" ? saved : response?.results ?? [],
    [view, saved, response?.results],
  );
  const languages = useMemo(() => [...new Set(sourceResults.map((item) => item.language).filter(Boolean) as string[])].sort(), [sourceResults]);
  const filtered = useMemo(() => {
    const next = sourceResults.filter((item) => {
      if (confidence !== "all" && item.confidence !== confidence) return false;
      if (language !== "all" && item.language !== language) return false;
      if (withDemo && !item.homepage) return false;
      return true;
    });
    return next.sort((a, b) => {
      if (sort === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sort === "stars") return b.stars - a.stars;
      return b.score - a.score || confidenceRank(b.confidence) - confidenceRank(a.confidence);
    });
  }, [sourceResults, confidence, language, withDemo, sort]);

  const exportCsv = () => {
    const headers = ["專案", "GitHub", "可信度", "分數", "描述", "語言", "Stars", "更新日期", "Demo", "命中證據"];
    const rows = filtered.map((item) => [
      item.fullName, item.url, CONFIDENCE_COPY[item.confidence].label, item.score, item.description,
      item.language ?? "", item.stars, item.updatedAt, item.homepage ?? "", item.evidence.map((e) => `${e.source}: ${e.text}`).join(" | "),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `賽跡_${response?.query.competition ?? "收藏庫"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copySearch = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(buildPageUrl(response.query));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const clearFilters = () => {
    setConfidence("all");
    setLanguage("all");
    setWithDemo(false);
  };

  return (
    <main>
      <div className="ambient-grid" aria-hidden="true" />
      <header className="site-header">
        <Link className="brand" href="/" aria-label="賽跡首頁">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>賽跡</strong><small>SAIJI / COMPETITION INDEX</small></span>
        </Link>
        <nav aria-label="主要導覽">
          <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}><Search size={16} />搜尋台</button>
          <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><Bookmark size={16} />收藏庫 <b>{saved.length}</b></button>
        </nav>
        <div className="header-tools">
          <PwaControls />
          <a className="source-link" href="https://github.com/lxuaneneliko/saiji-competition-search" target="_blank" rel="noreferrer"><span>開放原始碼</span>GitHub <ExternalLink size={14} /></a>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>PUBLIC REPOSITORY INTELLIGENCE</span><i />PWA 2.0</div>
          <h1>把散落的<br /><em>參賽作品</em>找回來。</h1>
          <p>輸入任何競賽名稱，從 GitHub 專案名稱、描述、README 與 Topics 交叉搜尋。中文內容優先、英文為輔，每一筆結果都告訴你「為什麼被找到」。</p>
        </div>
        <div className="hero-graphic" aria-hidden="true">
          <div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" />
          <div className="radar-sweep" /><div className="radar-core"><Search size={34} /><span>SCAN<br />PUBLIC<br />REPOS</span></div>
          <i className="signal-dot dot-a" /><i className="signal-dot dot-b" /><i className="signal-dot dot-c" />
        </div>
      </section>

      <section className="search-station" id="search">
        <form onSubmit={handleSubmit}>
          <label htmlFor="competition"><span>01</span>競賽名稱</label>
          <div className="primary-search">
            <Search size={24} />
            <input id="competition" value={form.competition} onChange={(event) => setForm({ ...form, competition: event.target.value })} placeholder="例如：SDGs 創新創意競賽" autoComplete="off" />
            {form.competition && <button type="button" className="clear-input" onClick={() => setForm({ ...form, competition: "" })} aria-label="清除"><X size={17} /></button>}
            <button type="submit" className="submit-search" disabled={loading}>{loading ? <LoaderCircle className="spin" size={20} /> : <Sparkles size={19} />}啟動搜尋</button>
          </div>

          <button className={`advanced-toggle ${advanced ? "open" : ""}`} type="button" onClick={() => setAdvanced(!advanced)}>
            <SlidersHorizontal size={16} />進階條件 <span>提高精準度，所有欄位皆可留白</span><ChevronDown size={16} />
          </button>
          <div className={`advanced-fields ${advanced ? "open" : ""}`}>
            <div><label htmlFor="year">年份／屆次</label><input id="year" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} placeholder="2025 或 第 8 屆" /></div>
            <div><label htmlFor="organizer">主辦單位</label><input id="organizer" value={form.organizer} onChange={(event) => setForm({ ...form, organizer: event.target.value })} placeholder="例如：教育部" /></div>
            <div><label htmlFor="aliases">別名／英文名稱</label><input id="aliases" value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} placeholder="以逗號分隔多個名稱" /></div>
          </div>
        </form>

        <div className="quick-row">
          <span>試查熱門關鍵字</span>
          {EXAMPLES.map((example) => <button key={example.label} onClick={() => applyInput(example)}>{example.label}<ArrowUpRight size={14} /></button>)}
        </div>

        {recent.length > 0 && (
          <div className="recent-row"><History size={15} /><span>最近搜尋</span>{recent.slice(0, 4).map((item) => <button key={JSON.stringify(item)} onClick={() => applyInput(item)}>{item.competition}</button>)}</div>
        )}
      </section>

      {error && <div className="notice error-notice"><CircleAlert size={19} /><div><strong>搜尋沒有完成</strong><p>{error}</p></div><button onClick={() => setError("")}><X size={17} /></button></div>}

      {loading && (
        <section className="loading-panel">
          <div className="scanner-line" />
          <span>INDEXING PUBLIC REPOSITORIES</span>
          <h2>正在交叉比對競賽痕跡…</h2>
          <p>查詢名稱、別名、README 與專案描述，接著建立可信度證據。</p>
          <div className="loading-steps"><i className="done"><Check size={14} /></i><b /><i /><b /><i /></div>
        </section>
      )}

      {!loading && (response || view === "saved") && (
        <section className="results-section">
          <div className="results-heading">
            <div>
              <span>{view === "saved" ? "PERSONAL EVIDENCE LIBRARY" : "SEARCH REPORT / LIVE INDEX"}</span>
              <h2>{view === "saved" ? "你的收藏庫" : <>「{response?.query.competition}」搜尋報告</>}</h2>
              <p>{view === "saved" ? `已保留 ${saved.length} 筆專案，可隨時匯出。` : `掃描 ${response?.totalCandidates ?? 0} 個候選索引，整理出 ${response?.results.length ?? 0} 筆可檢查線索。`}</p>
            </div>
            <div className="report-actions">
              {response && view === "search" && <button onClick={copySearch}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "已複製" : "分享搜尋"}</button>}
              <button onClick={exportCsv} disabled={!filtered.length}><Download size={16} />匯出 CSV</button>
            </div>
          </div>

          {response && view === "search" && (
            <div className="metrics-grid">
              <div><span>RESULTS</span><strong>{response.results.length}</strong><p>可檢查專案</p></div>
              <div><span>STRONG SIGNAL</span><strong>{response.results.filter((item) => item.confidence === "strong").length}</strong><p>強證據</p></div>
              <div><span>LIVE DEMO</span><strong>{response.results.filter((item) => item.homepage).length}</strong><p>附展示網址</p></div>
              <div><span>RESPONSE</span><strong>{(response.durationMs / 1000).toFixed(1)}<small>s</small></strong><p>搜尋耗時</p></div>
            </div>
          )}

          {response?.warnings.map((warning) => <div className="notice warning-notice" key={warning}><CircleAlert size={17} /><p>{warning} 其餘可用結果仍已列出。</p></div>)}

          <div className="result-workspace">
            <aside className="filter-panel">
              <div className="filter-title"><Filter size={16} /><strong>篩選條件</strong><button onClick={clearFilters}>全部清除</button></div>
              <fieldset><legend>證據等級</legend>{(["all", "strong", "probable", "lead"] as const).map((item) => <label key={item}><input type="radio" name="confidence" checked={confidence === item} onChange={() => setConfidence(item)} /><span />{item === "all" ? "全部結果" : CONFIDENCE_COPY[item].label}<b>{item === "all" ? sourceResults.length : sourceResults.filter((result) => result.confidence === item).length}</b></label>)}</fieldset>
              <fieldset><legend>程式語言</legend><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">所有語言</option>{languages.map((item) => <option key={item}>{item}</option>)}</select></fieldset>
              <fieldset><legend>專案狀態</legend><label className="check-label"><input type="checkbox" checked={withDemo} onChange={(event) => setWithDemo(event.target.checked)} /><span><Check size={12} /></span>只看有 Demo</label></fieldset>
              {response && view === "search" && <div className="source-status"><span className="status-dot" /><div><strong>GitHub API 已連線</strong><p>{response.rateLimit.authenticated ? "授權搜尋模式" : "公開搜尋模式"}</p></div></div>}
            </aside>

            <div className="result-feed">
              <div className="feed-toolbar"><p>顯示 <strong>{filtered.length}</strong> 筆結果</p><label>排序<select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="relevance">關聯度優先</option><option value="updated">最近更新</option><option value="stars">Stars 最高</option></select></label></div>
              {filtered.length ? filtered.slice(0, visibleCount).map((result) => (
                <ResultCard key={result.id} result={result} saved={saved.some((item) => item.id === result.id)} onToggleSave={() => toggleSaved(result)} />
              )) : (
                <div className="empty-results"><FileSearch size={42} /><h3>{view === "saved" && !saved.length ? "收藏庫還是空的" : "目前條件沒有結果"}</h3><p>{view === "saved" && !saved.length ? "搜尋競賽後，把值得追蹤的專案收進收藏庫。" : "清除部分篩選，或加入英文名稱、年份與主辦單位重新搜尋。"}</p>{view === "saved" && <button onClick={() => setView("search")}>回到搜尋台</button>}</div>
              )}
              {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 12)}>載入更多結果 <ChevronDown size={17} /></button>}
            </div>
          </div>

          {response && view === "search" && (
            <details className="query-trace"><summary><span>QUERY TRACE</span>查看系統實際使用的 {response.expandedQueries.length} 組查詢式<ChevronDown size={16} /></summary><div>{response.expandedQueries.map((query, index) => <code key={query}><b>Q{String(index + 1).padStart(2, "0")}</b>{query}</code>)}</div></details>
          )}
        </section>
      )}

      {!loading && !response && view === "search" && (
        <section className="method-section">
          <div className="section-number">02 / METHOD</div>
          <h2>不是只比關鍵字，<br />而是留下可追查的證據鏈。</h2>
          <div className="method-grid">
            <article><span>01</span><Search /><h3>多路徑擴搜</h3><p>名稱、英文別名、年份與主辦單位會組合成多組 GitHub 搜尋式。</p></article>
            <article><span>02</span><FileSearch /><h3>README 取證</h3><p>抓出最接近競賽名稱的文字片段，不讓你只能憑專案名稱猜測。</p></article>
            <article><span>03</span><SlidersHorizontal /><h3>可信度排序</h3><p>依完整名稱、競賽語意、年份、主辦單位與展示成果共同計分。</p></article>
          </div>
        </section>
      )}

      <footer>
        <div><span className="brand-mark"><i /><i /><i /></span><strong>賽跡 SAIJI</strong><p>GitHub Competition Evidence Index</p></div>
        <p>賽跡只搜尋 GitHub 公開內容。搜尋結果代表「相關線索」，不等同主辦單位正式參賽名單；請以命中證據與官方資料交叉確認。</p>
        <a href="#search">回到搜尋台 <ArrowUpRight size={15} /></a>
      </footer>
    </main>
  );
}
