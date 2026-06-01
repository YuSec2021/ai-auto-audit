
## v0.1.0 — Sprint 1 [MINOR bump]
- The Agent type is implemented as a TypeScript `interface` (declaration-merging friendly, per contract open-question #1 default). All four open-question defaults are applied correctly.
- The bus is transport-agnostic. `EventEmitter` listener cap bumped to 50 to handle realistic Sprint 4 fan-out. JSDoc documents the synchronous dispatch limitation.
- One and only one new line written per stub run. The parallel TS writer targets the same `./logs/audit_*.log` sink as the pre-existing CJS `audit_logger.js` with identical JSON-per-line format. The pre-existing CJS logger was NOT replaced or modified (confirmed by reading `audit_logger.js` header).

## v0.2.0 — Sprint 2 [MINOR bump]
- `PipelineOrchestrator` with explicit state machine (`init → preprocess → parallel-fan-out → fan-in → fusion → done`, plus terminal `cancelled`/`failed`) encoded as a string-literal union with a typed adjacency table. Cancel sets a flag (no in-flight interruption); resume replays from the last checkpoint, skipping already-completed states.
- Three no-op stub agents (TextRisk, Vision, Metadata) declare the Sprint 2 input/output contracts. Each is a load-bearing type-level contract that later epics (epic-2/3/4) will replace the body of; the input shape and `AgentOutput.details` shape are enforced at the TypeScript type level via declaration merging on `Agent`.
- `vitest.config.ts` was extended additively to include `src/orchestrator/**` paths (documented deviation, required to satisfy 50% line coverage on the new orchestrator code).
- 31 vitest tests pass across 4 new test files (orchestrator-state, text-risk, vision, metadata); line coverage 94.23% on `src/agents/`, 71.16% on `src/orchestrator/`. Pre-existing 010-era eslint errors and 11 npm-audit high vulns (xlsx Prototype Pollution + ReDoS) remain out of scope per quality-gate.md §5.
- Non-blocking craft note: 1 unused import (`PIPELINE_STATE_ORDER` at orchestrator.ts:44) and 1 type-level defect (`preprocessOutput` typed as `AgentOutput` but assigned a `{ width, height, hash }` object at orchestrator.ts:490) — both type-only, no runtime impact; can be cleaned up in a future sprint if the orchestrator evolves.
