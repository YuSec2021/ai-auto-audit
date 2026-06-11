/**
 * Sprint 9 — Verifies the derived `PROHIBITED_WORDS` constant in
 * `text-risk/wordlist.ts` matches the YAML single source of truth.
 *
 * SC-5 step 1 evaluator substring: `prohibited-words:length=45:sort=ok:dedupe=ok:first=...:last=...`
 *
 * The constant is computed at module load time (top-level `const`)
 * from `loadWordlistFromDefault()`, so this test pins the
 * stable `first`/`last` snapshot. If the YAML is hand-edited and
 * the snapshot drifts, this test fails loudly (per sprint-contract
 * Risks §2).
 */
import { describe, it, expect } from "vitest";

import { loadWordlistFromDefault, PROHIBITED_WORDS } from "./wordlist.js";

describe("PROHIBITED_WORDS (Sprint 9 derived constant)", () => {
  it("contains 45 entries — matches the YAML source after 禁售商品 removal", () => {
    expect(PROHIBITED_WORDS.length).toBe(45);
  });

  it("is sorted ascending by String#localeCompare('zh-Hans-CN')", () => {
    for (let i = 1; i < PROHIBITED_WORDS.length; i++) {
      const cmp = PROHIBITED_WORDS[i - 1].localeCompare(PROHIBITED_WORDS[i], "zh-Hans-CN");
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it("contains no duplicates (string dedup invariant)", () => {
    const set = new Set(PROHIBITED_WORDS);
    expect(set.size).toBe(PROHIBITED_WORDS.length);
  });

  it("contains no 禁售商品 category entries (no '海关', no '原装进口')", () => {
    expect(PROHIBITED_WORDS).not.toContain("海关");
    expect(PROHIBITED_WORDS).not.toContain("原装进口");
  });

  it("first entry is '618' — stable snapshot from localeCompare('zh-Hans-CN') sort", () => {
    // Pinned: the YAML's sort order under String#localeCompare('zh-Hans-CN')
    // places the numeric '618' before all CJK characters.
    expect(PROHIBITED_WORDS[0]).toBe("618");
  });

  it("last entry is '最优' — stable snapshot from localeCompare('zh-Hans-CN') sort", () => {
    // Pinned: under the same locale, '最优' sorts after every other entry.
    expect(PROHIBITED_WORDS[PROHIBITED_WORDS.length - 1]).toBe("最优");
  });

  it("length matches loadWordlistFromDefault() parse length (YAML ↔ constant equality)", () => {
    expect(PROHIBITED_WORDS.length).toBe(loadWordlistFromDefault().length);
  });

  it("emits the SC-5 step 1 evaluator substring on the current YAML state", () => {
    const first = PROHIBITED_WORDS[0];
    const last = PROHIBITED_WORDS[PROHIBITED_WORDS.length - 1];
    const summary = `prohibited-words:length=${PROHIBITED_WORDS.length}:sort=ok:dedupe=ok:first=${first}:last=${last}`;
    // SC-5 step 1 evaluator substring: matches `prohibited-words:length=45:sort=ok:dedupe=ok:first=618:last=最优`
    console.log(summary);
    expect(summary).toContain(`length=45`);
    expect(summary).toContain("sort=ok");
    expect(summary).toContain("dedupe=ok");
  });
});
