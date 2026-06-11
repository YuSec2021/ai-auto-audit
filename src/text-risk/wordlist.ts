/**
 * Sprint 6 — Hand-rolled YAML loader for the text-risk wordlist.
 *
 * Per sprint-contract.md Risks §1 and Open Questions §1: this loader
 * uses a hand-rolled minimal parser (~80 lines) instead of pulling in
 * `js-yaml` as a direct dependency. The supported YAML subset is:
 *
 *   - Top-level `entries:` key followed by a list of mappings.
 *   - Each mapping has 3-4 scalar fields: `word:`, `category:`,
 *     `severity:`, optional `match: "exact" | "regex"`.
 *   - String values may be unquoted (no special chars), single-quoted,
 *     or double-quoted.
 *   - `#` comments run to end of line.
 *   - Blank lines and comment-only lines are ignored.
 *
 * Out of scope: anchors, flow style, multi-line scalars, nested
 * structures. If the loader ever grows past ~80 lines, escalate to
 * adding `js-yaml@4.1.1` as a direct dep per the contract's
 * Open Questions §1 trigger.
 *
 * NO imports of `js-yaml`, `yaml`, or any other YAML library.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface WordlistEntry {
  word: string;
  category: string;
  severity: string;
  /** Optional: "exact" (default) or "regex". */
  match?: "exact" | "regex";
}

/**
 * Unquote a YAML string scalar. Supports single, double, and unquoted
 * (bare) forms. Escaped characters inside double-quoted strings are
 * not supported in this minimal subset.
 *
 * Throws a descriptive error if the value starts with a quote that
 * is not closed (e.g. `'unclosed string`).
 */
function unquote(raw: string, lineNo: number): string {
  const s = raw.trim();
  if (s.length === 0) return s;
  const first = s[0];
  if (first === "'" || first === '"') {
    if (s.length < 2 || s[s.length - 1] !== first) {
      throw new Error(
        `wordlist: unclosed ${first === "'" ? "single" : "double"} quote on line ${lineNo}: ${s}`,
      );
    }
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Strip an inline `# comment` from a line, respecting quoted strings.
 * Returns the (possibly trimmed) value before the comment.
 */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Parse a YAML wordlist text into a list of WordlistEntry objects.
 * Throws an Error with a line number on malformed input.
 */
export function parseWordlist(yamlText: string): ReadonlyArray<WordlistEntry> {
  if (yamlText.length === 0) {
    throw new Error("wordlist: empty input");
  }

  const rawLines = yamlText.split(/\r?\n/);
  const entries: WordlistEntry[] = [];
  let i = 0;

  // Skip header comments and blank lines until we find `entries:`.
  while (i < rawLines.length) {
    const stripped = stripComment(rawLines[i]).trim();
    if (stripped.length === 0) {
      i++;
      continue;
    }
    if (stripped.startsWith("entries:")) {
      i++;
      break;
    }
    // Allow leading non-`entries:` lines (e.g. comments) to be skipped.
    if (stripped.startsWith("#")) {
      i++;
      continue;
    }
    // Anything else before `entries:` is unexpected.
    throw new Error(
      `wordlist: unexpected line ${i + 1}: expected 'entries:' key, got: ${stripped}`,
    );
  }

  // Parse the list of mappings.
  let current: Partial<WordlistEntry> | null = null;

  while (i < rawLines.length) {
    const lineNo = i + 1;
    const line = stripComment(rawLines[i]);
    const trimmed = line.trim();
    i++;

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) continue;

    // Detect a new list item: `  - word: ...`.
    if (trimmed.startsWith("-")) {
      // Flush the previous entry.
      if (current !== null) {
        entries.push(finalizeEntry(current, lineNo));
      }
      current = {};
      // The first field may be on the same line after the `-`.
      const afterDash = trimmed.slice(1).trim();
      if (afterDash.length > 0) {
        const m = afterDash.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
        if (m === null) {
          throw new Error(
            `wordlist: malformed mapping on line ${lineNo}: ${trimmed}`,
          );
        }
        const key = m[1];
        const value = unquote(m[2], lineNo);
        assignField(current, key, value, lineNo);
      }
      continue;
    }

    // Continuation field: `  word: ...` (indented under the current item).
    if (current === null) {
      throw new Error(
        `wordlist: unexpected field on line ${lineNo} (no active entry): ${trimmed}`,
      );
    }
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m === null) {
      throw new Error(
        `wordlist: malformed field on line ${lineNo}: ${trimmed}`,
      );
    }
    const key = m[1];
    const value = unquote(m[2], lineNo);
    assignField(current, key, value, lineNo);
  }

  // Flush the trailing entry.
  if (current !== null) {
    entries.push(finalizeEntry(current, rawLines.length));
  }

  return entries;
}

function assignField(
  target: Partial<WordlistEntry>,
  key: string,
  value: string,
  lineNo: number,
): void {
  switch (key) {
    case "word":
      target.word = value;
      return;
    case "category":
      target.category = value;
      return;
    case "severity":
      target.severity = value;
      return;
    case "match":
      if (value !== "exact" && value !== "regex") {
        throw new Error(
          `wordlist: invalid 'match' value on line ${lineNo}: ${value} (expected exact|regex)`,
        );
      }
      target.match = value;
      return;
    default:
      throw new Error(
        `wordlist: unknown field '${key}' on line ${lineNo}`,
      );
  }
}

function finalizeEntry(
  partial: Partial<WordlistEntry>,
  lineNo: number,
): WordlistEntry {
  if (typeof partial.word !== "string" || partial.word.length === 0) {
    throw new Error(
      `wordlist: entry ending on line ${lineNo} is missing 'word'`,
    );
  }
  if (typeof partial.category !== "string" || partial.category.length === 0) {
    throw new Error(
      `wordlist: entry ending on line ${lineNo} is missing 'category'`,
    );
  }
  if (typeof partial.severity !== "string" || partial.severity.length === 0) {
    throw new Error(
      `wordlist: entry ending on line ${lineNo} is missing 'severity'`,
    );
  }
  return {
    word: partial.word,
    category: partial.category,
    severity: partial.severity,
    match: partial.match,
  };
}

/**
 * Load a wordlist from a YAML file path. Reads the file with
 * `fs.readFileSync` and delegates parsing to `parseWordlist`.
 *
 * SC-4 step 2 evaluator uses:
 *   `loadWordlist('./src/text-risk/wordlist/wordlist.yaml')`.
 */
export function loadWordlist(path: string): ReadonlyArray<WordlistEntry> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`wordlist: failed to read ${path}: ${msg}`);
  }
  return parseWordlist(text);
}

/**
 * Default YAML path resolved relative to this module via
 * `import.meta.url`. Works under `tsx` (Node ESM) and bundled outputs.
 */
const DEFAULT_WORDLIST_PATH = new URL("./wordlist/wordlist.yaml", import.meta.url);

/**
 * Load the default wordlist shipped at `./wordlist/wordlist.yaml`.
 *
 * This is the single canonical loader consumers should use — the
 * YAML file is the only hand-edited source of truth.
 */
export function loadWordlistFromDefault(): ReadonlyArray<WordlistEntry> {
  return loadWordlist(fileURLToPath(DEFAULT_WORDLIST_PATH));
}

/**
 * Derived flat string list of all prohibited words, sorted ascending
 * by `String#localeCompare('zh-Hans-CN')` for stable, locale-pinned
 * ordering across runs, and deduplicated. Computed once at module
 * load time from the YAML — no hand-typed array.
 *
 * Consumers that need the literal strings (LLM prompt, validators,
 * `Array#includes` checks) import this constant. Consumers that
 * need full entry metadata (word + category + severity + match)
 * import `loadWordlistFromDefault()` and use the typed
 * `WordlistEntry[]` return.
 */
export const PROHIBITED_WORDS: readonly string[] = (() => {
  const seen = new Set<string>();
  for (const entry of loadWordlistFromDefault()) {
    seen.add(entry.word);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
})();
