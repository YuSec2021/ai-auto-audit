/**
 * Sprint 6 — Unit tests for src/text-risk/wordlist.ts
 *
 * The contract's SC-4 step 1 requires vitest stdout to contain
 * `wordlist:loaded=45:极限词=13:虚假宣传=4:平台违规=20:促销诱导=8`;
 * the first test emits it via console.log after loading the real
 * fixture file. Do NOT remove.
 *
 * 禁售商品 category removed on 2026-06-10 per user request (was 47 → 45 entries).
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import { loadWordlist, parseWordlist, type WordlistEntry } from "./wordlist.js";

const FIXTURE = resolve(__dirname, "wordlist/wordlist.yaml");

function groupCounts(entries: ReadonlyArray<WordlistEntry>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }
  return counts;
}

describe("parseWordlist (hand-rolled YAML parser)", () => {
  it("parses an in-memory minimal YAML string", () => {
    const yaml = [
      "entries:",
      "  - word: \"第一\"",
      "    category: 极限词",
      "    severity: 原则性错误",
      "  - word: '(?<!不)包邮'",
      "    category: 平台违规",
      "    severity: 原则性错误",
      "    match: regex",
      "",
    ].join("\n");
    const out = parseWordlist(yaml);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      word: "第一",
      category: "极限词",
      severity: "原则性错误",
    });
    expect(out[1]).toEqual({
      word: "(?<!不)包邮",
      category: "平台违规",
      severity: "原则性错误",
      match: "regex",
    });
  });

  it("throws on empty input", () => {
    expect(() => parseWordlist("")).toThrow(/empty input/);
  });

  it("throws on a malformed (unclosed) string with a line number", () => {
    const yaml = "entries:\n  - word: 'unclosed string\n    category: x\n    severity: y\n";
    expect(() => parseWordlist(yaml)).toThrow(/line 2/);
  });

  it("ignores comment lines and inline # comments", () => {
    const yaml = [
      "# top-level comment",
      "entries:",
      "  # entry comment",
      "  - word: \"第一\"  # inline comment",
      "    category: 极限词",
      "    severity: 原则性错误",
      "",
    ].join("\n");
    const out = parseWordlist(yaml);
    expect(out.length).toBe(1);
    expect(out[0].word).toBe("第一");
  });

  it("parses unquoted, single-quoted, and double-quoted strings", () => {
    const yaml = [
      "entries:",
      "  - word: \"第一\"",
      "    category: '极限词'",
      "    severity: 原则性错误",
      "  - word: '第二'",
      "    category: 极限词",
      "    severity: 原则性错误",
      "  - word: 第三",
      "    category: 极限词",
      "    severity: 原则性错误",
      "",
    ].join("\n");
    const out = parseWordlist(yaml);
    expect(out.map((e) => e.word)).toEqual(["第一", "第二", "第三"]);
  });

  it("captures the optional match: regex field; absent leaves it undefined", () => {
    const yaml = [
      "entries:",
      "  - word: \"第一\"",
      "    category: 极限词",
      "    severity: 原则性错误",
      "  - word: \"第二\"",
      "    category: 极限词",
      "    severity: 原则性错误",
      "    match: regex",
      "",
    ].join("\n");
    const out = parseWordlist(yaml);
    expect(out[0].match).toBeUndefined();
    expect(out[1].match).toBe("regex");
  });

  it("rejects an unknown 'match' value", () => {
    const yaml = [
      "entries:",
      "  - word: \"第一\"",
      "    category: 极限词",
      "    severity: 原则性错误",
      "    match: glob",
      "",
    ].join("\n");
    expect(() => parseWordlist(yaml)).toThrow(/match/);
  });
});

describe("loadWordlist (file path)", () => {
  it("loads the 45-entry fixture file", () => {
    const w = loadWordlist(FIXTURE);
    const counts = groupCounts(w);
    const summary = `wordlist:loaded=${w.length}:极限词=${counts["极限词"]}:虚假宣传=${counts["虚假宣传"]}:平台违规=${counts["平台违规"]}:促销诱导=${counts["促销诱导"]}`;
    // SC-4 step 1 evaluator substring.
    console.log(summary);
    expect(w.length).toBe(45);
    expect(counts).toEqual({
      极限词: 13,
      虚假宣传: 4,
      平台违规: 20,
      促销诱导: 8,
    });
  });

  it("the first entry is '第一' (极限词 / 原则性错误)", () => {
    const w = loadWordlist(FIXTURE);
    expect(w[0]).toEqual({
      word: "第一",
      category: "极限词",
      severity: "原则性错误",
    });
  });

  it("the last entry is '下单配' (促销诱导 / 原则性错误)", () => {
    const w = loadWordlist(FIXTURE);
    const last = w[w.length - 1];
    expect(last).toEqual({
      word: "下单配",
      category: "促销诱导",
      severity: "原则性错误",
    });
  });

  it("throws a descriptive error when the file does not exist", () => {
    expect(() => loadWordlist("/nonexistent/path/wordlist.yaml")).toThrow(
      /failed to read/,
    );
  });
});
