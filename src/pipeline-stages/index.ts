/**
 * Sprint 5 — Barrel re-export for the new `pipeline-stages/` module.
 *
 * Consumers (the orchestrator) import the four extracted helpers from
 * this single barrel rather than reaching into individual files.
 * This mirrors the existing top-level module structure
 * (agents/, orchestrator/, preprocess/, specialized/, fusion/) and
 * signals that the new module is a top-level pipeline concept.
 */
export { clampToFusionUnit } from "./clamp.js";
export { runFanOut } from "./fan-out.js";
export { buildFusionInput, buildBlocklistFusionInput } from "./fusion-input.js";
export { placeholderFusionOutput } from "./placeholder.js";
