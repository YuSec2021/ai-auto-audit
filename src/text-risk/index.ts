/**
 * Sprint 6 — Barrel re-export for the new `text-risk/` module.
 *
 * Mirrors the existing top-level module structure
 * (agents/, orchestrator/, preprocess/, specialized/, fusion/,
 * pipeline-stages/). Consumers (Sprint 8's TextRiskAgent replacement
 * and the Sprint 7 OCR stage) import from this single barrel.
 *
 * Excluded from coverage (barrel re-exports only).
 */
export {
  buildAutomaton,
  type AhoCorasick,
  type Match,
} from "./automaton.js";
export { normalize, type NormalizeOptions } from "./dfa.js";
export {
  RegexMatcher,
  matchRegex,
  type RegexEntry,
  type RegexMatchResult,
} from "./regex-matcher.js";
export {
  loadWordlist,
  loadWordlistFromDefault,
  parseWordlist,
  PROHIBITED_WORDS,
  type WordlistEntry,
} from "./wordlist.js";
export {
  matchWordlist,
  type MatchResult,
  type MatchWordlistOptions,
  type WordlistMatch,
} from "./matcher.js";
