
## v0.1.0 — Sprint 1 [MINOR bump]
- The Agent type is implemented as a TypeScript `interface` (declaration-merging friendly, per contract open-question #1 default). All four open-question defaults are applied correctly.
- The bus is transport-agnostic. `EventEmitter` listener cap bumped to 50 to handle realistic Sprint 4 fan-out. JSDoc documents the synchronous dispatch limitation.
- One and only one new line written per stub run. The parallel TS writer targets the same `./logs/audit_*.log` sink as the pre-existing CJS `audit_logger.js` with identical JSON-per-line format. The pre-existing CJS logger was NOT replaced or modified (confirmed by reading `audit_logger.js` header).
