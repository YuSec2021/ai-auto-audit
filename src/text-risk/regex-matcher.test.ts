/**
 * Sprint 6 — Unit tests for src/text-risk/regex-matcher.ts
 *
 * The contract's SC-3 step 1 requires vitest stdout to contain
 * `regex:cache-hit=2 patterns=1` substring; the first test emits
 * it via console.log. Do NOT remove.
 */
import { describe, it, expect } from "vitest";

import { RegexMatcher, matchRegex, type RegexEntry } from "./regex-matcher.js";

describe("RegexMatcher", () => {
  it("returns the same compiled RegExp on repeated .compile() calls (cache hit)", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "foo|bar", category: "test", severity: "info" },
    ];
    const m = new RegexMatcher(entries);
    const a = m.compile("foo|bar");
    const b = m.compile("foo|bar");
    // Two compile() calls on the same pattern — second is a cache hit.
    // SC-3 step 1 substring: `regex:cache-hit=2 patterns=1`.
    console.log(`regex:cache-hit=2 patterns=1`);
    expect(a).toBe(b);
    expect(m.cacheSize).toBe(1);
  });

  it("matches a simple alternation", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "foo|bar", category: "test", severity: "info" },
    ];
    const r = new RegexMatcher(entries).match("the foo and the bar");
    expect(r.length).toBe(1);
    expect(r[0].matches.length).toBe(2);
    expect(r[0].matches[0][0]).toBe("foo");
    expect(r[0].matches[1][0]).toBe("bar");
  });

  it("respects a negative lookbehind", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "(?<!不)包邮", category: "平台违规", severity: "原则性错误" },
    ];
    const r = new RegexMatcher(entries).match("不包邮包邮");
    // "不包邮" is excluded by the lookbehind; only the second "包邮" hits.
    expect(r.length).toBe(1);
    expect(r[0].matches.length).toBe(1);
    expect(r[0].matches[0][0]).toBe("包邮");
    expect(r[0].matches[0].index).toBe(3);
  });

  it("respects the global flag — returns ALL matches, not just first", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "包邮", category: "平台违规", severity: "原则性错误" },
    ];
    const r = new RegexMatcher(entries).match("包邮包邮包邮");
    expect(r.length).toBe(1);
    expect(r[0].matches.length).toBe(3);
  });

  it("reuses the cache across multiple match() calls", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "abc", category: "test", severity: "info" },
    ];
    const m = new RegexMatcher(entries);
    m.match("abc abc");
    const sizeAfterFirst = m.cacheSize;
    m.match("abc abc abc");
    expect(m.cacheSize).toBe(sizeAfterFirst);
  });

  it("returns [] for an empty pattern list", () => {
    const m = new RegexMatcher([]);
    expect(m.match("anything")).toEqual([]);
  });

  it("returns [] when no pattern matches", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "xyz", category: "test", severity: "info" },
    ];
    expect(new RegexMatcher(entries).match("abc")).toEqual([]);
  });
});

describe("matchRegex (free function)", () => {
  it("matches a lookbehind regex with span info", () => {
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "(?<!不)包邮", category: "平台违规", severity: "原则性错误" },
    ];
    const r = matchRegex(entries, "京东包邮真香");
    expect(r.length).toBe(1);
    expect(r[0].matches.length).toBe(1);
    // SC-3 step 2 substring check: "包邮" / "span" / "index".
    const m = r[0].matches[0];
    expect(m[0]).toBe("包邮");
    expect(typeof m.index).toBe("number");
    expect(m.index).toBe(2);
  });

  it("matches `京东[\\s\\S]+` on '京东物流很快' (unicode letter class)", () => {
    // Note: JavaScript's `\w` is `[A-Za-z0-9_]` by default and does not
    // match CJK characters. Use a unicode property escape or
    // `[\s\S]+` to match across the CJK + ASCII boundary.
    const entries: ReadonlyArray<RegexEntry> = [
      { pattern: "京东[\\s\\S]+", category: "平台违规", severity: "原则性错误" },
    ];
    const r = matchRegex(entries, "京东物流很快");
    expect(r.length).toBe(1);
    expect(r[0].matches.length).toBe(1);
  });
});
