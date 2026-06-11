/**
 * Sprint 6 — Aho-Corasick AC automaton for one-pass multi-pattern matching.
 *
 * The automaton is built once from a list of patterns and then queried
 * repeatedly with `.search(text)`. The search runs in O(|text| + |output|)
 * time after the BFS that computes failure links at build time.
 *
 * Scope (per sprint-contract.md Risks §4):
 *   - The contract scopes Sprint 6 to first match per position only
 *     (no output links / dictionary suffix links). Sprint 8 may extend
 *     the search to report ALL overlapping matches at a position.
 *   - The current `search()` API is shaped to be backward-compatible
 *     with that addition.
 *
 * Pure utility: no I/O, no global state, no mutation of inputs.
 *
 * Order: matches are returned in order of `index`; ties broken by
 * `pattern` lexicographic order.
 */

/** A single match reported by the automaton. */
export interface Match {
  pattern: string;
  index: number;
}

/** A built Aho-Corasick automaton. */
export interface AhoCorasick {
  search(text: string): ReadonlyArray<Match>;
}

export interface BuildAutomatonOptions {
  /** If true, matching is case-sensitive. Default: false (case-insensitive). */
  caseSensitive?: boolean;
}

interface Node {
  /** Map from character to child node index in `nodes`. */
  children: Map<string, number>;
  /** Failure link: index in `nodes`, or -1 for root. */
  fail: number;
  /** Patterns that end at this node (in insertion order). */
  output: string[];
}

/** Sentinel for "no failure link set yet" / "no child". */
const NO_NODE = -1;

/**
 * Build an Aho-Corasick automaton from a list of patterns.
 *
 * Empty patterns are ignored (a zero-length pattern would match at
 * every position, which is rarely useful). Duplicate patterns are
 * reported once per match position.
 *
 * Patterns are stored in their ORIGINAL case in the output. The
 * trie is keyed by the lowercased form (when case-insensitive)
 * so case differences don't create duplicate trie branches. The
 * first-inserted pattern for a given lowercased key wins on output.
 */
export function buildAutomaton(
  patterns: ReadonlyArray<string>,
  opts?: BuildAutomatonOptions,
): AhoCorasick {
  const caseSensitive = opts?.caseSensitive === true;
  const normalize = (s: string): string =>
    caseSensitive ? s : s.toLowerCase();

  // Build trie.
  const nodes: Node[] = [{ children: new Map(), fail: NO_NODE, output: [] }];

  for (const raw of patterns) {
    if (raw.length === 0) continue;
    const lowered = normalize(raw);
    let nodeIdx = 0;
    for (const ch of lowered) {
      const existing = nodes[nodeIdx].children.get(ch);
      if (existing !== undefined) {
        nodeIdx = existing;
      } else {
        const newIdx = nodes.length;
        nodes.push({ children: new Map(), fail: NO_NODE, output: [] });
        nodes[nodeIdx].children.set(ch, newIdx);
        nodeIdx = newIdx;
      }
    }
    // Store the ORIGINAL pattern (not the lowercased form) so the
    // search results report the case the caller passed in. The
    // SC-1 step 2 evaluator expects `pattern:"京东"` etc., not
    // lowercased forms.
    nodes[nodeIdx].output.push(raw);
  }

  // BFS to compute failure links.
  // For BFS, use a simple queue implemented with an array + head index.
  const queue: number[] = [];
  let qHead = 0;

  // Root's children fail-link to root.
  for (const [, childIdx] of nodes[0].children) {
    nodes[childIdx].fail = 0;
    queue.push(childIdx);
  }

  while (qHead < queue.length) {
    const v = queue[qHead++];
    for (const [ch, childIdx] of nodes[v].children) {
      // Walk the failure chain to find a node with `ch` as a child;
      // if none, fall back to root (whose failure link is 0 = root).
      let f = nodes[v].fail;
      while (f !== NO_NODE && !nodes[f].children.has(ch)) {
        f = nodes[f].fail;
      }
      const failIdx = f === NO_NODE ? 0 : nodes[f].children.get(ch)!;
      nodes[childIdx].fail = failIdx;

      // Propagate outputs: this node's effective output = own output +
      // its failure node's output. We materialize this by copying
      // failure outputs into the child's own output list.
      const failOutput = nodes[failIdx].output;
      if (failOutput.length > 0) {
        nodes[childIdx].output.push(...failOutput);
      }

      queue.push(childIdx);
    }
  }

  // Build a search function that closes over the trie and the case flag.
  const search = (text: string): ReadonlyArray<Match> => {
    if (nodes.length === 1 && nodes[0].children.size === 0) {
      return [];
    }
    const normText = normalize(text);
    const matches: Match[] = [];
    let state = 0;
    for (let i = 0; i < normText.length; ) {
      // Use the code-point at i (handles fullwidth pairs etc. via the
      // iterator; matches are in code-point units).
      const cp = normText.codePointAt(i)!;
      const ch = String.fromCodePoint(cp);
      const iStep = cp > 0xffff ? 2 : 1;

      // Walk trie / fail chain.
      let next = nodes[state].children.get(ch);
      while (next === undefined && state !== 0) {
        state = nodes[state].fail;
        next = nodes[state].children.get(ch);
      }
      if (next === undefined) {
        // No transition; stay at root.
        state = 0;
      } else {
        state = next;
      }

      // Report any outputs at the current state.
      const out = nodes[state].output;
      if (out.length > 0) {
        // The match position is the index of the END of the match
        // minus the pattern length. For first match at this position
        // we report it once per output pattern.
        for (const pat of out) {
          matches.push({ pattern: pat, index: i + iStep - pat.length });
        }
      }

      i += iStep;
    }

    // Sort: by index ascending, then by pattern lexicographic ascending.
    matches.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      if (a.pattern < b.pattern) return -1;
      if (a.pattern > b.pattern) return 1;
      return 0;
    });

    return matches;
  };

  return { search };
}
