import { describe, expect, it } from "vitest";
import { buildSearchQueries, sanitizeInput } from "./github";

describe("competition query expansion", () => {
  it("creates a Chinese near-name query when one official-name word may be missing", () => {
    const queries = buildSearchQueries({ competition: "問題解決能力競賽" });

    expect(queries).toContain('"問題能力競賽" in:name,description,readme');
    expect(queries[0]).toBe('"問題解決能力競賽" in:name,description,readme');
    expect(queries.length).toBeLessThanOrEqual(6);
  });

  it("keeps explicit English aliases ahead of generated fuzzy queries", () => {
    const queries = buildSearchQueries({
      competition: "總統盃黑客松",
      aliases: ["Presidential Hackathon"],
    });

    expect(queries[1]).toBe('"Presidential Hackathon" in:name,description,readme');
  });

  it("corrects the common shortened name for Hsinchu Youth Bright Ideas", () => {
    const queries = buildSearchQueries({ competition: "新竹青春點子" });

    expect(queries).toContain('"新竹縣青春靚點子全國學生創業挑戰賽" in:name,description,readme');
    expect(queries).toContain('"青春靚點子" in:name,description,readme');
  });
});

describe("search input validation", () => {
  it("deduplicates and limits aliases", () => {
    const input = sanitizeInput({
      competition: "  問題解決能力競賽  ",
      aliases: ["A", "A", "B", "C", "D", "E", "F"],
    });

    expect(input.competition).toBe("問題解決能力競賽");
    expect(input.aliases).toEqual(["A", "B", "C", "D", "E"]);
  });
});
