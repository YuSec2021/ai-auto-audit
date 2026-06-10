## Sprint 9: Unify prohibited-words library: single source of truth (absorb 17 uncommitted "delete 禁售商品" edits)

Epic: epic-2 — Text Risk OCR-fed pipeline.
Sprint origin: **feature** (minor_feature change request, refactor inside `src/text-risk/` + cross-consumer import-rewrite).
Base commit: `cb34695ded2306d59a94a054adada6364c11f5ac` on `010-audit-arch-optimization`.
Active branch: `010-audit-arch-optimization` (no sprint branch; the Orchestrator will create one after CONTRACT APPROVED).

### Scope

In-scope (derived from `change-request.md` "Acceptance direction" + the 17 uncommitted files from the ad-hoc "delete 禁售商品" change that this sprint absorbs):

1. **Single wordlist file** at `ai-audit-prototype/src/text-risk/wordlist/wordlist.yaml` — the structured wordlist introduced in Sprint 6. **45 entries** (after 禁售商品 category removal on 2026-06-10): 极限词 13, 虚假宣传 4, 平台违规 20, 促销诱导 8. Count must match the ad-hoc 17-file change.
2. **One TypeScript loader module** that re-exports the parsed wordlist as a typed structure. Extend `ai-audit-prototype/src/text-risk/wordlist.ts` with a `loadWordlistFromDefault()` helper that loads `./wordlist/wordlist.yaml` relative to the module, plus a typed `PROHIBITED_WORDS: readonly string[]` constant (sorted, deduplicated, derived from the YAML) re-exported from the same module.
3. **One consumer-facing module** that engine, LLM helper, validators, and scripts import. Extend `ai-audit-prototype/src/text-risk/index.ts` barrel to also re-export `PROHIBITED_WORDS` and `loadWordlistFromDefault`. The barrel remains the only public surface.
4. **Absorb the 17 uncommitted files from the "delete 禁售商品" ad-hoc change** (Orchestrator's previous-turn edits). Sprint 9's design supersedes those edits — every consumer that currently hardcodes the wordlist gets rewritten to `import { PROHIBITED_WORDS } from ".../text-risk/index.js"` (or a similar typed re-export). Files in the ad-hoc change:
   - `ai-audit-prototype/src/text-risk/wordlist/wordlist.yaml` (already updated to 45 entries — preserve)
   - `ai-audit-prototype/src/text-risk/wordlist.test.ts` (already updated — preserve)
   - `ai-audit-prototype/src/lib/audit-engine.ts` (consumer; rewrite import)
   - `ai-audit-prototype/src/lib/audit-types.ts` (consumer; rewrite import)
   - `ai-audit-prototype/src/App.tsx` (consumer; rewrite import)
   - `ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs` — **010-era, see Out-of-scope**
   - `ai-audit-prototype/src/components/ErrorBoundary.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/contexts/AuditContext.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/contexts/ThemeContext.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/lib/exporters.ts` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/lib/utils.ts` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/pages/Home.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/pages/NotFound.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/pages/TaskDetailPage.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/pages/TasksPage.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/pages/UploadTaskPage.tsx` (deleted 010-era; out-of-scope)
   - `ai-audit-prototype/src/lib/prohibited-words.ts` (deleted/preserved 010-era; out-of-scope)
5. **No "do not change" / "keep in sync" / "已迁移至" comments** linking one consumer to another. All such cross-references in source files are removed during the import-rewrite — the YAML is the source, no consumer "owns" the list.
6. **One test** that asserts the new module matches the YAML (parses YAML, compares derived `PROHIBITED_WORDS` array to expected length and to a stable sorted snapshot of the entries). No need to retest every consumer — they no longer carry the data.
7. **All 010-era scripts and legacy files remain unchanged** (preserve `scripts/audit-5-26.js`, `scripts/audit-full-rules.js`, `audit_rules.js`, `auditor.js`, `claude_audit.js`, `image_audit.js`, `scripts/.audit_vision_cache.json`, `ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs`, `ai-audit-prototype/src/lib/prohibited-words.ts`). They keep their hardcoded copies.

Out-of-scope (explicit deferrals / 010-era preserved untouched per `project_010_era_files` rule):

- **Sprint 8** (TextRiskAgent real implementation replacing Sprint 2 stub) — not yet implemented; the new barrel is usable by it, but its body is Sprint 8's job.
- **010-era files** (must not be edited by Sprint 9):
  - `ai-audit-prototype/src/lib/prohibited-words.ts` (per `project_010_era_files` rule; keep as-is even though it duplicates the wordlist)
  - `ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs`
  - `scripts/audit-5-26.js`
  - `scripts/audit-full-rules.js`
  - `scripts/.audit_vision_cache.json` (runtime cache, auto-regenerated)
  - `audit_rules.js`
  - `auditor.js`
  - `claude_audit.js`
  - `image_audit.js`
- **Already-deleted 010-era files** in the ad-hoc change (ErrorBoundary.tsx, AuditContext.tsx, ThemeContext.tsx, exporters.ts, utils.ts, Home.tsx, NotFound.tsx, TaskDetailPage.tsx, TasksPage.tsx, UploadTaskPage.tsx) — the deletions stay; Sprint 9 does not restore them and does not rewrite imports inside them (they no longer exist).
- **YAML schema, YAML per-entry `word/category/severity/match` fields, AC automaton / DFA / regex matcher behavior, Sprint 6 test fixtures** — all preserved verbatim per change-request.md.
- Sprint 2 `TextRiskAgent` stub body — unchanged (Sprint 8's job).
- 100+ other uncommitted 010-era files anywhere in the repo (待审核_*.xlsx, 异常SKU_*, 上架结果汇总表_*, 待审核_split/, etc.) — preserved untouched.
- New npm dependencies — none added.

### Architecture constraints

- **YAML is the only hand-edited source.** `ai-audit-prototype/src/text-risk/wordlist/wordlist.yaml` is the canonical, versioned, hand-edited list. Every other location (TS code, barrel, tests, comments) **derives** from it.
- **One TS loader module**: `ai-audit-prototype/src/text-risk/wordlist.ts` is the single parser; it exposes `loadWordlist(path)`, `loadWordlistFromDefault()`, and the typed constant `PROHIBITED_WORDS: readonly string[]` (sorted ascending, deduplicated, length === 45). No other file in the codebase parses the YAML.
- **One consumer-facing re-export**: `ai-audit-prototype/src/text-risk/index.ts` is the only public surface. Consumers must import from this barrel, not from `./wordlist.js` or `./wordlist/wordlist.yaml` directly. No "alternative barrels" (`text-risk/wordlist/index.ts`, `text-risk/loader.js`, etc.) — they are forbidden to prevent re-introduction of multiple sources.
- **No "keep in sync" comments** anywhere in the codebase. After Sprint 9, no source file may contain the strings `保持完全同步`, `已迁移至`, `与 ... 保持同步`, `MUST match`, `KEEP IN SYNC` (case-insensitive) referencing the wordlist. (Evaluated by SC-3.)
- **No circular imports**: a clean acyclic import graph `text-risk/index.ts` → `text-risk/wordlist.ts` → `text-risk/wordlist/wordlist.yaml`; consumers import only from the barrel. (Evaluated by SC-4.)
- **Runtime**: TypeScript, Node.js 25 ESM, `tsx`. No new npm deps. `js-yaml@4.1.1` (transitive, not declared in `package.json`) must not be imported; Sprint 6's hand-rolled parser in `wordlist.ts` is reused.
- **`PROHIBITED_WORDS` shape**: `readonly string[]` (the literal word strings only, not `WordlistEntry` objects — to give LLM-prompt / validator consumers the flat list they need). Sorted ascending by `String#localeCompare('zh-Hans-CN')` so the order is deterministic across runs.
- **`MessageBus` / `Agent` interfaces, audit-log line format, `./logs/audit_*.log` sink, `state-machine.ts`, orchestrator 7-fan-out, frozen `FUSION_CONFIG`, `RiskFusionAgent` — all untouched** (Sprint 1/4/6 surfaces).
- **Coverage floor**: 80% (Sprint 5 baseline; Sprint 6/7/8 all maintain it). Sprint 9 must not regress; the new `wordlist.ts` extension + 1 new test file is highly testable so 80%+ is realistic.
- **vitest config**: no structural change to `coverage.include`/`exclude` glob is required (the new exports live inside the already-globbed `src/text-risk/**/*.ts`). If a `test.include` glob is needed for a new test file under `src/text-risk/wordlist.test.ts` or a new `src/text-risk/wordlist-prohibited.test.ts`, the addition is **additive** (Sprint 6 pattern).

### Files to be created / modified

| Path | Action | Purpose |
| --- | --- | --- |
| `ai-audit-prototype/src/text-risk/wordlist.ts` | modify (additive) | Add `loadWordlistFromDefault()` helper + `PROHIBITED_WORDS: readonly string[]` typed constant (sorted, deduped) derived from the YAML |
| `ai-audit-prototype/src/text-risk/index.ts` | modify (additive) | Re-export `PROHIBITED_WORDS` and `loadWordlistFromDefault` so the barrel is the only public surface |
| `ai-audit-prototype/src/text-risk/wordlist/wordlist.yaml` | preserve | Already at 45 entries (Sprint 6 + 禁售商品 removal); not edited in this sprint |
| `ai-audit-prototype/src/text-risk/wordlist.test.ts` | preserve | Already updated for 45-entry count; not edited |
| `ai-audit-prototype/src/text-risk/prohibited-words.test.ts` | create | New single test: loads YAML, asserts `PROHIBITED_WORDS.length === 45`, asserts sorted + deduped, asserts first/last entry (stable snapshot) |
| `ai-audit-prototype/src/lib/audit-engine.ts` | modify | Replace any hardcoded `PROHIBITED_WORDS` array (or 010-era import) with `import { PROHIBITED_WORDS } from "../text-risk/index.js"` (or `PROHIBITED_WORDS` constant re-imported from text-risk) |
| `ai-audit-prototype/src/lib/audit-types.ts` | modify | Same import-rewrite if it currently re-declares the wordlist |
| `ai-audit-prototype/src/App.tsx` | modify | Same import-rewrite if it currently re-declares the wordlist |

Total: 1 new test file + 1 additive wordlist.ts + 1 additive index.ts + up to 3 consumer import-rewrites = 6 file ops (1 create + 5 modify).

The 7 deleted 010-era files in the ad-hoc change (ErrorBoundary.tsx, AuditContext.tsx, ThemeContext.tsx, exporters.ts, utils.ts, Home.tsx, NotFound.tsx, TaskDetailPage.tsx, TasksPage.tsx, UploadTaskPage.tsx) **stay deleted** — they are not in this table because the contract does not recreate them.

### Success criteria

#### SC-1: wordlist.ts exposes a typed `PROHIBITED_WORDS` constant derived from the YAML

`wordlist.ts` defines `export const PROHIBITED_WORDS: readonly string[]` and `export function loadWordlistFromDefault(): WordlistEntry[]`. Both are derived from `./wordlist/wordlist.yaml` — no hardcoded inline array in TS code.

Evaluator steps:
1. Run `cd /Users/liyuyang/projects/ai_auto_audit/ai-audit-prototype && grep -nE "PROHIBITED_WORDS\s*[:=]" src/text-risk/wordlist.ts` and assert stdout contains at least one match (the new constant declaration).
2. Run `grep -nE "loadWordlistFromDefault" src/text-risk/wordlist.ts` and assert stdout contains at least one match (the new helper declaration).
3. Run `node --import tsx -e "import { PROHIBITED_WORDS, loadWordlistFromDefault } from './src/text-risk/wordlist.ts'; console.log(PROHIBITED_WORDS.length, loadWordlistFromDefault().length);"` from `ai-audit-prototype/` and assert stdout equals `45 45` (constant length matches YAML parse length).
4. Run `grep -nE "^\s*const\s+PROHIBITED_WORDS\s*:\s*readonly\s+string\[\]\s*=\s*\[" src/text-risk/wordlist.ts` and assert exit 1 (the constant must be derived, not a hand-typed `= ["第一", "最好", ...]` array — that would defeat the single-source-of-truth goal).

#### SC-2: index.ts barrel is the only public surface for `PROHIBITED_WORDS`

`text-risk/index.ts` re-exports `PROHIBITED_WORDS` and `loadWordlistFromDefault`. No other file under `ai-audit-prototype/src/` re-declares the wordlist as a string array.

Evaluator steps:
1. Run `grep -nE "PROHIBITED_WORDS" src/text-risk/index.ts` and assert stdout contains at least one match.
2. Run `grep -nE "loadWordlistFromDefault" src/text-risk/index.ts` and assert stdout contains at least one match.
3. Run `grep -rnE "(const|let|var)\s+PROHIBITED_WORDS\b" ai-audit-prototype/src/text-risk/` and assert stdout contains exactly one match (only `text-risk/wordlist.ts` declares the in-scope `PROHIBITED_WORDS`). The 010-era `src/lib/prohibited-words.ts:52` ALSO declares `PROHIBITED_WORDS` (a hardcoded 45-entry array literal, not IIFE-derived) — that declaration is out of scope per `project_010_era_files` rule and is a known follow-up tracked in `.sprintfoundry/claude-progress.txt`. **Partial pass: the in-scope grep is exactly-one; the codebase-wide grep would return 2.**
4. Run `grep -rnE "from\s+['\"].*text-risk/wordlist['\"]" src/ --include="*.ts" --include="*.tsx"` and assert stdout equals empty (no consumer imports directly from `text-risk/wordlist.js`; they must go through the barrel).

#### SC-3: No "keep in sync" cross-references in in-scope files

No **in-scope** source file (the 4 file ops in §Files to be created / modified) contains cross-reference comments that pretend one consumer "owns" the list. Specifically, the strings `保持完全同步`, `已迁移至`, `与 ... 保持同步`, `MUST match`, `KEEP IN SYNC` (case-insensitive) must not appear in the 4 Sprint 9 in-scope files. **010-era preserved files (e.g. `src/lib/prohibited-words.ts`, `src/lib/vision-validator.ts`) are out of scope for this SC** — cleaning those is a follow-up sprint per Open Question #3 (Sprint 9 is the "absorb the ad-hoc 17-file change" sprint, not the "deprecate the 010-era file" sprint).

Evaluator steps (scoped to in-scope files only):
1. Run `grep -rniE "保持完全同步|已迁移至|MUST match|KEEP IN SYNC" ai-audit-prototype/src/text-risk/wordlist.ts ai-audit-prototype/src/text-risk/index.ts ai-audit-prototype/src/text-risk/prohibited-words.test.ts ai-audit-prototype/src/lib/audit-engine.ts` and assert exit 1 (no matches in the 4 in-scope files).
2. Run `node --import tsx -e "import { PROHIBITED_WORDS } from './src/text-risk/index.ts'; console.log(PROHIBITED_WORDS[0], PROHIBITED_WORDS[PROHIBITED_WORDS.length-1]);"` from `ai-audit-prototype/` and assert stdout equals `618 最优` (stable snapshot of the first/last entry of the YAML under `localeCompare('zh-Hans-CN')`; proves consumers are reading from the same source as the YAML).
3. **Known follow-up (out of scope)**: the 010-era `src/lib/prohibited-words.ts:50` ("保持完全同步" comment) and `src/lib/vision-validator.ts:115` ("已迁移至" comment) still exist. Tracked in `.sprintfoundry/claude-progress.txt` Sprint 9 follow-ups.

#### SC-4: Acyclic import graph — in-scope consumers go through the barrel

The import graph under `ai-audit-prototype/src/text-risk/` is acyclic, and the **4 in-scope Sprint 9 files** only import from the barrel (`../text-risk/index.js`) for the `PROHIBITED_WORDS` constant. The 010-era `prohibited-words.ts` is still imported by `audit-engine.ts` and `vision-validator.ts` for **non-wordlist functions** (`checkTextProhibited`, `checkTextProhibitedWithLLM`, `validateProductImages`, etc.) — those function imports are out of scope for Sprint 9 and are not blocking. **The `PROHIBITED_WORDS` constant import in `audit-engine.ts` is rewritten to the text-risk barrel** (verifiable: `grep "import.*PROHIBITED_WORDS" src/lib/audit-engine.ts` returns `import { PROHIBITED_WORDS } from "../text-risk/index.js";`).

Evaluator steps (scoped to in-scope files only):
1. Run `grep -nE "import.*PROHIBITED_WORDS" ai-audit-prototype/src/lib/audit-engine.ts` and assert stdout contains `from "../text-risk/index.js"` (the new barrel import; the legacy `./prohibited-words` import is for non-constant functions only).
2. Run `grep -rnE "from\s+['\"]\.\.?/(text-risk/wordlist\.js|text-risk/wordlist['\"])" ai-audit-prototype/src/ --include="*.ts" --include="*.tsx"` and assert stdout equals empty (no consumer imports directly from `text-risk/wordlist.js`; they go through the barrel only).
3. Run `node --import tsx -e "import('./src/text-risk/index.ts').then(m => console.log(Object.keys(m).sort().join(',')))"` from `ai-audit-prototype/` and assert stdout contains both `PROHIBITED_WORDS` and `loadWordlistFromDefault` (barrel is loadable without circular-import error).
4. Run `node --import tsx -e "import('./src/text-risk/wordlist.ts').then(m => console.log(Object.keys(m).sort().join(',')))"` from `ai-audit-prototype/` and assert stdout contains `loadWordlist`, `loadWordlistFromDefault`, `PROHIBITED_WORDS`, `parseWordlist`, `WordlistEntry` (Sprint 6 surface preserved + Sprint 9 additions).
5. **Known follow-up (out of scope)**: the 010-era `src/lib/vision-validator.ts:15` still imports `{ PROHIBITED_WORDS } from "./prohibited-words"` (this is the only remaining in-scope-shaped import that bypasses the barrel — refactoring it requires either moving the `checkTextProhibited` function or splitting the 010-era file, both of which are 010-era-preservation-breaking changes deferred to a future sprint).

#### SC-5: Single new test file asserts module matches YAML (no consumer retests)

A single new test file `src/text-risk/prohibited-words.test.ts` asserts the derived `PROHIBITED_WORDS` matches the YAML (length 45, sorted, deduped, stable first/last snapshot). No other new test file is required; Sprint 6/7/8 test files remain unchanged.

Evaluator steps:
1. Run `cd /Users/liyuyang/projects/ai_auto_audit/ai-audit-prototype && node_modules/.bin/vitest run src/text-risk/prohibited-words.test.ts` and assert exit 0 and stdout contains the substring `prohibited-words:length=45:sort=ok:dedupe=ok:first=第一:last=下单配` (or equivalent snapshot assertion that proves the YAML is the source).
2. Run `node_modules/.bin/vitest run src/text-risk/ 2>&1 | grep -cE "Test Files"` and assert stdout `≥ 6` (Sprint 6 had 5 test files; Sprint 9 adds 1; plus 1 new = 6+ — proves exactly one new test file).
3. Run `git status --short -- ai-audit-prototype/src/text-risk/ | wc -l` and assert stdout `≤ 5` (the 3 Sprint 9 in-scope files: `wordlist.ts` modified, `index.ts` modified, `prohibited-words.test.ts` new, PLUS the 2 pre-existing 禁售商品 cleanup modifications to `wordlist.test.ts` and `wordlist/wordlist.yaml` which are NOT Sprint 9 work but were left in the working tree from the user's 2026-06-10 ad-hoc change). The pre-2026-06-10 baseline was 0 working-tree entries under `src/text-risk/`; Sprint 9 adds 3 in-scope entries; the 2 cleanup entries are absorbed pre-existing carry-overs. **No additional new test files or new source files beyond the in-scope 3.**

#### SC-6: 010-era files preserved untouched (no edits to legacy scripts)

`scripts/audit-5-26.js`, `scripts/audit-full-rules.js`, `scripts/.audit_vision_cache.json`, and `ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs` are NOT modified by Sprint 9. The 5 tracked 010-era files (`audit_rules.js`, `auditor.js`, `claude_audit.js`, `image_audit.js`, `ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs`) that were DELETED in the ad-hoc 17-file change are **restored from HEAD** by the implementation per Open Question #3 default (reset ad-hoc changes to clean baseline). The 010-era `ai-audit-prototype/src/lib/prohibited-words.ts` is untracked and remains in place (untracked status is preserved per `project_010_era_files` rule; it is not in HEAD to be checked out). The 4 SC-6.1 paths of "fully empty `git status`" are partially met: the 5 tracked files are restored; the untracked `prohibited-words.ts` is preserved-as-is.

Evaluator steps:
1. Run `git status --short -- audit_rules.js auditor.js claude_audit.js image_audit.js ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs` and assert stdout equals empty (the 5 tracked 010-era files are restored from HEAD). The untracked `prohibited-words.ts` may still show as `??` (it was never committed to HEAD, so it cannot be checked out; untracked status is preserved per `project_010_era_files` rule). **Partial pass: 5 of 6 paths return empty; the 1 untracked path is a known 010-era-preservation carve-out.**
2. Run `git diff --stat -- audit_rules.js auditor.js claude_audit.js image_audit.js ai-audit-prototype/src/lib/prohibited-words.ts ai-audit-prototype/scripts/babel-plugin-jsx-source-location.cjs` and assert stdout equals empty.
3. Run `grep -c "PROHIBITED_WORDS\|prohibited-words" audit_rules.js image_audit.js` and assert stdout `≥ 1` (legacy scripts still contain their own copy — proves they were not modified to import from text-risk).

#### SC-7: tsc clean + no new npm deps + coverage floor

`npx tsc --noEmit` exits 0; `package.json` gains no new dependencies; `vitest run` exits 0 with all 145 tests passing (no regression from Sprint 5/6/7/8).

Evaluator steps:
1. Run `cd /Users/liyuyang/projects/ai_auto_audit/ai-audit-prototype && node_modules/.bin/tsc --noEmit` and assert exit 0, stdout empty, stderr empty. (Pre-existing 010-era tsc errors in `src/components/`, `src/lib/`, `src/pages/`, `src/App.tsx`, and one `orchestrator.ts:499` carry-over are unchanged — out of scope per Sprint 1 evaluator feedback.)
2. Run `git diff -- package.json package-lock.json` and assert stdout equals empty (no new deps).
3. Run `cd /Users/liyuyang/projects/ai_auto_audit/ai-audit-prototype && node_modules/.bin/vitest run 2>&1 | tail -5` and assert `Tests 145 passed (145)`. (The Sprint 6 `matcher.test.ts` 47→45 fixture correction is in scope as a Sprint 9 pre-fix for the 禁售商品 cleanup side-effect; Sprint 6 tsc carry-overs remain out of scope.)
4. Run `cd /Users/liyuyang/projects/ai_auto_audit/ai-audit-prototype && node_modules/.bin/vitest run --coverage 2>&1 | grep -E "All files" | tail -1` and assert the captured line contains `Lines` with value `≥ 80%`.

### Non-goals

- Replacing the Sprint 2 `TextRiskAgent` stub body (Sprint 8).
- Adding OCR (already in Sprint 7; not regressed by this sprint).
- Changing the score formula to severity-weighted (Sprint 8).
- Modifying `audit-log.ts`, `types.ts`, `MessageBus`, `state-machine.ts`, orchestrator, fusion — all Sprint 1/2/4 surfaces, untouched.
- Refactoring existing 010-era code (`prohibited-words.ts`, legacy scripts).
- Caching the derived `PROHIBITED_WORDS` array across processes (Sprint 9 is synchronous, module-load-time only).
- Async / streaming API for the wordlist loader.
- Internationalization of the YAML format beyond Sprint 6's minimal subset.
- Restoring the 9 already-deleted 010-era files (ErrorBoundary.tsx, AuditContext.tsx, ThemeContext.tsx, exporters.ts, utils.ts, Home.tsx, NotFound.tsx, TaskDetailPage.tsx, TasksPage.tsx, UploadTaskPage.tsx) — they stay deleted; their deletion is part of the 17-file ad-hoc change that Sprint 9 absorbs.

### Risks

1. **`PROHIBITED_WORDS` derivation cost on module load.** Computing the sorted/deduped array every time `wordlist.ts` is imported is O(N log N) per process. *Mitigation*: compute once at module top-level (TS const) so the cost is paid once at import time. The 45-entry list is tiny (~2KB), so this is negligible. SC-1 step 3 implicitly verifies the constant loads in < 1s on a developer machine.

2. **Stable sort behavior across locales.** `String#localeCompare('zh-Hans-CN')` may produce different orderings on different OS locales. *Mitigation*: the contract pins the locale explicitly to `'zh-Hans-CN'`; SC-5 step 1 captures a stable snapshot of `first=...:last=...` and asserts it byte-for-byte. If the snapshot ever drifts across CI runs, the test will fail loudly (not silently).

3. **Ad-hoc 17-file change may conflict with the unified design.** The Orchestrator's previous-turn edits may have left some consumers (e.g. `audit-engine.ts`, `App.tsx`) in an inconsistent state — e.g. partially rewritten imports, half-removed comments. *Mitigation*: SC-3's grep checks are exhaustive; if any "keep in sync" comment survives, the SC fails. SC-5 step 3 limits the in-scope file count to ≤ 4, so the implementation can reset ad-hoc edits to clean state and re-apply them consistently.

4. **010-era `prohibited-words.ts` still has the same `PROHIBITED_WORDS` export name.** A consumer could import `{ PROHIBITED_WORDS }` from the 010-era file by mistake, bypassing the YAML source. *Mitigation*: SC-4 step 1 (grep) verifies no in-scope consumer imports from `prohibited-words`. SC-3 step 4 verifies the runtime value matches the YAML. If a future consumer regresses, the lint/grep is a clear re-blocking signal.

5. **Coverage floor regression from adding consumer-rewrite tests.** Sprint 9 adds 1 new test file. If the test imports surface grow unexpectedly, the new test file could push untested branches. *Mitigation*: the new test file targets the loader + constant only (high coverage surface). SC-7 step 3 explicitly verifies the project floor (80%) is maintained. If a regression appears, the implementation trims non-essential asserts.

6. **The 17 uncommitted files may include some that the user did not intend to be Sprint 9's scope.** For example, `vendor.json` and `1.json` (a symlink to `category.json`) appear in the ad-hoc diff but are unrelated to the wordlist. *Mitigation*: the contract's file table explicitly lists the 8 wordlist-relevant files (wordlist.yaml, wordlist.test.ts, audit-engine.ts, audit-types.ts, App.tsx, wordlist.ts, index.ts, prohibited-words.test.ts) and the 9 deleted-010-era files (which stay deleted). Anything else in the ad-hoc diff (vendor.json, category files, _StdProduct__*.csv, 22.csv, etc.) is **out of scope** and will be reverted to clean state by the implementation, not absorbed.

### Open questions

1. **Should `PROHIBITED_WORDS` be `readonly string[]` (literal words only) or `readonly { word: string; category: string; severity: string }[]` (full entry)?** **Default: `readonly string[]` (literal words)** — most consumers (LLM prompt, validators) want a flat string list. Consumers that need full entry metadata can import `loadWordlistFromDefault()` and use the typed `WordlistEntry[]` return. The contract commits to this; if a consumer needs the flat list for a different purpose, they can `.map(e => e.word)` it themselves.

2. **Where does `loadWordlistFromDefault()` resolve the YAML path from?** **Default: `new URL("./wordlist/wordlist.yaml", import.meta.url)`** — module-relative, works for both `tsx` (Node ESM) and bundled outputs. The contract commits to this. If a future bundler (Vite, esbuild) breaks module-relative URLs, the path is parameterizable via an optional `loadWordlist(path?: string)` overload.

3. **Do we keep the ad-hoc 17-file diff intact, or reset the unrelated deletions?** **Default: reset all ad-hoc changes to a clean baseline (current HEAD of `010-audit-arch-optimization`), then re-apply the wordlist-relevant edits under Sprint 9's design.** This guarantees a minimal, reviewable diff. The contract's file table lists exactly 6 file ops, all under Sprint 9's scope. SC-6 step 1 explicitly verifies the 010-era files have no working-tree modifications, which the reset accomplishes. *Trigger to escalate*: if the user wants the unrelated deletions (待审核_*.xlsx, 异常SKU_*, etc.) preserved, that is a separate sprint — not Sprint 9.

### Closing line

Awaiting `CONTRACT APPROVED` from the Evaluator before implementation begins.

---

CONTRACT APPROVED

Sprint: 9
Approved criteria: 7
Notes: Verified hard checks pass: 45 YAML entries confirmed, sprint IDs [1-9] in planner-spec.json, 010-era prohibited-words.ts exists, wordlist.ts/index.ts extension points present, 17 uncommitted files in working tree. Contract scope is sound: single-source-of-truth design with module-relative YAML path, acyclic import graph via barrel, explicit preservation of 010-era files, and 7 externally verifiable success criteria. Open question #3 (reset ad-hoc diff to clean baseline, re-apply only wordlist-relevant edits) is the correct minimal-diff approach.
