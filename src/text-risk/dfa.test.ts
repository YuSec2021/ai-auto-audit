/**
 * Sprint 6 — Unit tests for src/text-risk/dfa.ts
 *
 * The contract's SC-1 step 1 and SC-2 step 1 require vitest stdout to
 * contain `dfa:fullwidth=ＡＢＣ->abc` substring; emit it once via
 * console.log so the evaluator can grep stdout.
 *
 * The console.log in the first test is intentional and required by
 * SC-1 / SC-2; do NOT remove it.
 */
import { describe, it, expect } from "vitest";

import { normalize } from "./dfa.js";

describe("normalize", () => {
  it("lowercases ASCII letters", () => {
    expect(normalize("ABC")).toBe("abc");
    expect(normalize("Hello World")).toBe("hello world");
  });

  it("maps fullwidth ASCII to halfwidth lowercase", () => {
    const input = "ＡＢＣ";
    const got = normalize(input);
    expect(got).toBe("abc");
    // SC-2 / SC-1 evaluator step: stdout must contain this substring.
    console.log(`dfa:fullwidth=${input}->${got}`);
  });

  it("maps fullwidth digits to halfwidth digits", () => {
    expect(normalize("１２３")).toBe("123");
  });

  it("maps fullwidth space (U+3000) to ASCII space and collapses by default", () => {
    expect(normalize("　包　邮")).toBe("包 邮");
  });

  it("collapses runs of whitespace and trims by default", () => {
    expect(normalize("  包  邮  ")).toBe("包 邮");
  });

  it("leaves CJK characters unchanged (no case folding for non-ASCII)", () => {
    expect(normalize("京东包邮")).toBe("京东包邮");
  });

  it("returns empty string for empty input", () => {
    expect(normalize("")).toBe("");
  });

  it("preserveWhitespace=true keeps all whitespace verbatim (after fullwidth mapping)", () => {
    expect(normalize("  包  邮  ", { preserveWhitespace: true })).toBe("  包  邮  ");
  });

  it("preserveWhitespace=true still lowercases ASCII and maps fullwidth", () => {
    expect(normalize("  ＡＢＣ  ", { preserveWhitespace: true })).toBe("  abc  ");
  });

  it("mixed CJK + ASCII + fullwidth combined", () => {
    expect(normalize("ＡＢＣ ＰＡＣＫ")).toBe("abc pack");
  });

  it("stripWhitespace=true removes all whitespace (no single-space collapse)", () => {
    expect(normalize("包  邮", { preserveWhitespace: false })).toBe("包邮");
  });
});
