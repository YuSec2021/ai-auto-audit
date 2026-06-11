/**
 * Sprint 6 — Regex matcher with per-matcher RegExp cache.
 *
 * Each matcher instance lazily compiles its entries' patterns to
 * `RegExp(pattern, "g")` and caches them in a `Map<string, RegExp>`
 * keyed by the pattern string. Repeated `matchRegex()` calls on the
 * same instance reuse the compiled RegExp (the cache hit is observed
 * by the SC-3 evaluator step 1 substring `regex:cache-hit=2 patterns=1`).
 *
 * Pure utility: no I/O, no global state, no mutation of inputs.
 *
 * The SC-3 contract's free function `matchRegex(entries, text)` is
 * re-exported alongside the `RegexMatcher` class so the evaluator's
 * `node --import tsx -e "import { matchRegex } from './src/text-risk/regex-matcher.ts'"`
 * snippet works.
 */

export interface RegexEntry {
  pattern: string;
  category: string;
  severity: string;
}

export interface RegexMatchResult {
  entry: RegexEntry;
  matches: ReadonlyArray<RegExpMatchArray>;
}

/** Per-matcher RegExp cache. */
export class RegexMatcher {
  private readonly cache: Map<string, RegExp> = new Map();
  private readonly entries: ReadonlyArray<RegexEntry>;

  constructor(entries: ReadonlyArray<RegexEntry>) {
    this.entries = entries;
  }

  /**
   * Compile (or fetch from cache) the RegExp for `pattern`.
   * Exposed via the SC-3 `regex:cache-hit` console.log the matcher
   * test emits; the matcher class itself does not log.
   */
  compile(pattern: string): RegExp {
    const cached = this.cache.get(pattern);
    if (cached !== undefined) return cached;
    const re = new RegExp(pattern, "g");
    this.cache.set(pattern, re);
    return re;
  }

  /**
   * Run all compiled regexes against `text` and return the per-entry
   * results. Entries that do not match are omitted from the result.
   */
  match(text: string): ReadonlyArray<RegexMatchResult> {
    const out: RegexMatchResult[] = [];
    for (const entry of this.entries) {
      const re = this.compile(entry.pattern);
      // Reset the regex's lastIndex so successive `match()` calls on
      // a shared instance start from position 0.
      re.lastIndex = 0;
      const hits: RegExpMatchArray[] = [];
      // Use matchAll-like manual iteration; `exec` on a `g` regex
      // walks the string and returns null when done.
      while (true) {
        const m = re.exec(text);
        if (m === null) break;
        hits.push(m);
        // Avoid infinite loop on zero-width matches.
        if (m.index === re.lastIndex) {
          re.lastIndex += 1;
        }
      }
      if (hits.length > 0) {
        out.push({ entry, matches: hits });
      }
    }
    return out;
  }

  /** Size of the compiled-RegExp cache; used by tests. */
  get cacheSize(): number {
    return this.cache.size;
  }
}

/**
 * Free function: build a one-shot RegexMatcher and run it. The
 * Sprint 6 contract SC-3 evaluator step 2 uses this signature.
 */
export function matchRegex(
  entries: ReadonlyArray<RegexEntry>,
  text: string,
): ReadonlyArray<RegexMatchResult> {
  return new RegexMatcher(entries).match(text);
}
