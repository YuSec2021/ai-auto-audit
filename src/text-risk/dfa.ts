/**
 * Sprint 6 — DFA normalizer for text-risk matching.
 *
 * Pure utility: normalizes an input string for the AC automaton
 * and regex matchers. Lowercases ASCII letters, maps fullwidth
 * characters to their halfwidth counterparts, and (optionally)
 * collapses whitespace.
 *
 * Pure function: no I/O, no global state, no mutation of inputs.
 *
 * The Sprint 7 OCR stage will rely on this contract. PaddleOCR may
 * produce fullwidth characters and irregular whitespace; the normalizer
 * is the single chokepoint that turns raw OCR text into a canonical
 * form suitable for exact and regex matching.
 */

export interface NormalizeOptions {
  /**
   * Whitespace handling:
   *   - `undefined` (default) → collapse runs of whitespace to a single
   *     ASCII space and trim leading/trailing.
   *   - `true` → preserve whitespace verbatim (after fullwidth→halfwidth
   *     mapping of the U+3000 ideographic space).
   *   - `false` → strip ALL whitespace (no single-space collapse).
   *
   * The "strip all" behavior (`false`) is used by the wordlist matcher
   * so that entries like "包邮" can match a text containing " 包邮 ".
   */
  preserveWhitespace?: boolean;
}

/**
 * Map a fullwidth character to its halfwidth counterpart.
 * Returns the input character unchanged if it has no fullwidth form.
 */
function fullwidthToHalfwidth(ch: string): string {
  const code = ch.codePointAt(0);
  if (code === undefined) return ch;
  // U+FF01..U+FF5E fullwidth ASCII (offset -0xFEE0 → U+0021..U+007E).
  if (code >= 0xff01 && code <= 0xff5e) {
    return String.fromCodePoint(code - 0xfee0);
  }
  // U+FF10..U+FF19 fullwidth digits (offset -0xFEE0 → U+0030..U+0039).
  if (code >= 0xff10 && code <= 0xff19) {
    return String.fromCodePoint(code - 0xfee0);
  }
  // U+3000 fullwidth space → U+0020.
  if (code === 0x3000) {
    return " ";
  }
  return ch;
}

/**
 * Lowercase an ASCII letter; pass through everything else.
 */
function asciiLower(ch: string): string {
  const code = ch.codePointAt(0);
  if (code === undefined) return ch;
  if (code >= 0x41 && code <= 0x5a) {
    return String.fromCodePoint(code + 0x20);
  }
  return ch;
}

/**
 * Normalize an input string.
 *
 * Steps:
 *   1. Map fullwidth chars to halfwidth.
 *   2. Lowercase ASCII letters.
 *   3. If preserveWhitespace !== true, collapse whitespace runs to a
 *      single ASCII space and trim; otherwise keep whitespace runs.
 */
export function normalize(input: string, opts?: NormalizeOptions): string {
  const preserve = opts?.preserveWhitespace;
  // Step 1+2: fullwidth + ASCII lowercase.
  let mapped = "";
  for (const ch of input) {
    const halfwidth = fullwidthToHalfwidth(ch);
    mapped += asciiLower(halfwidth);
  }

  if (preserve === true) {
    return mapped;
  }
  if (preserve === false) {
    // Explicit `false` → strip ALL whitespace (SC-2 step 4).
    return mapped.replace(/\s+/g, "");
  }

  // Default → collapse runs of whitespace to a single space and trim.
  // The contract SC-2 step 2 asserts 'ＡＢＣ ＰＡＣＫ' → 'abc pack'.
  return mapped.replace(/\s+/g, " ").trim();
}
