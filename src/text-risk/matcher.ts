/**
 * Sprint 6 — Top-level wordlist matcher.
 *
 * Orchestrates the AC automaton (exact matches) and the regex matcher
 * (variable-shape patterns) over a normalized text. Returns the
 * documented `{ matched, total, score }` shape.
 *
 * Per sprint-contract.md Open Questions §2:
 *   - `total = wordlist.length` (the actual entry count).
 *   - `score = clamp01(matched.length / total)`.
 *   - Sprint 8 will renegotiate the score formula; the field lives on
 *     a declaration-merge-friendly `MatchResult` interface.
 *
 * Per sprint-contract.md non-blocking observation #2:
 *   - `matched` is deduped per wordlist entry: a single wordlist entry
 *     appears AT MOST ONCE in `matched` even if the input contains
 *     the pattern many times.
 */
import { buildAutomaton } from "./automaton.js";
import { normalize } from "./dfa.js";
import { RegexMatcher } from "./regex-matcher.js";
import type { WordlistEntry } from "./wordlist.js";

export interface WordlistMatch {
  word: string;
  category: string;
  severity: string;
  span: { start: number; end: number };
  match: "exact" | "regex";
}

export interface MatchResult {
  matched: ReadonlyArray<WordlistMatch>;
  total: number;
  score: number;
}

export interface MatchWordlistOptions {
  /** If true, matching is case-sensitive. Default: false. */
  caseSensitive?: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Run the wordlist against the input text and return the documented
 * match result shape.
 */
export function matchWordlist(
  text: string,
  wordlist: ReadonlyArray<WordlistEntry>,
  opts?: MatchWordlistOptions,
): MatchResult {
  const total = wordlist.length;
  if (total === 0) {
    return { matched: [], total: 0, score: 0 };
  }

  const caseSensitive = opts?.caseSensitive === true;
  // Strip whitespace entirely so entries like "包邮" can match a text
  // containing " 包邮 ". The default `normalize` collapses whitespace
  // to a single space (for human-readable display); the matcher needs
  // the stricter "strip all" behavior.
  const normText = normalize(text, { preserveWhitespace: false });
  const normTextCase = caseSensitive ? normText : normText.toLowerCase();

  // Partition wordlist into exact and regex entries. Default match
  // mode is "exact" (per the YAML convention; absent `match:` field
  // means exact).
  const exactEntries: WordlistEntry[] = [];
  const regexEntries: WordlistEntry[] = [];
  for (const e of wordlist) {
    if (e.match === "regex") {
      regexEntries.push(e);
    } else {
      exactEntries.push(e);
    }
  }

  // Build a quick lookup from normalized pattern to original entries
  // (so we can recover category/severity for each match).
  const exactByPattern: Map<string, WordlistEntry> = new Map();
  for (const e of exactEntries) {
    const key = caseSensitive ? e.word : e.word.toLowerCase();
    if (!exactByPattern.has(key)) {
      exactByPattern.set(key, e);
    }
  }

  // Dedup set keyed by wordlist entry identity (a single entry
  // appears at most once in `matched` regardless of repetition).
  const seen: Set<WordlistEntry> = new Set();
  const matched: WordlistMatch[] = [];

  // --- exact matches via AC automaton ---
  if (exactEntries.length > 0) {
    const patterns = exactEntries.map((e) =>
      caseSensitive ? e.word : e.word.toLowerCase(),
    );
    const ac = buildAutomaton(patterns, { caseSensitive });
    const hits = ac.search(normTextCase);
    for (const h of hits) {
      const entry = exactByPattern.get(h.pattern);
      if (entry === undefined) continue;
      if (seen.has(entry)) continue;
      seen.add(entry);
      matched.push({
        word: entry.word,
        category: entry.category,
        severity: entry.severity,
        span: { start: h.index, end: h.index + h.pattern.length },
        match: "exact",
      });
    }
  }

  // --- regex matches via RegexMatcher ---
  if (regexEntries.length > 0) {
    // Pass a `case-insensitive` flag when requested.
    const re = new RegexMatcher(
      regexEntries.map((e) => ({
        pattern: caseSensitive ? e.word : e.word.toLowerCase(),
        category: e.category,
        severity: e.severity,
      })),
    );
    const results = re.match(normTextCase);
    for (const r of results) {
      // Find the original entry (un-lowercased pattern) by pattern match.
      const originalEntry = regexEntries.find((e) => {
        const k = caseSensitive ? e.word : e.word.toLowerCase();
        return k === r.entry.pattern;
      });
      if (originalEntry === undefined) continue;
      if (seen.has(originalEntry)) continue;
      seen.add(originalEntry);
      // For dedup-by-entry, use the first match's span.
      const first = r.matches[0];
      const start = first.index ?? 0;
      const end = start + first[0].length;
      matched.push({
        word: originalEntry.word,
        category: originalEntry.category,
        severity: originalEntry.severity,
        span: { start, end },
        match: "regex",
      });
    }
  }

  // Sort matched by start position for stable output.
  matched.sort((a, b) => {
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    if (a.span.end !== b.span.end) return a.span.end - b.span.end;
    if (a.word < b.word) return -1;
    if (a.word > b.word) return 1;
    return 0;
  });

  const score = clamp01(matched.length / total);
  return { matched, total, score };
}
