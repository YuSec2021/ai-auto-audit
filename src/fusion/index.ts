/**
 * Sprint 4 — Fusion module barrel.
 *
 * Re-exports the `RiskFusionAgent`, the `buildDefaultRiskFusionAgent`
 * factory, the default config (`FUSION_CONFIG`, `FUSION_WEIGHTS`,
 * `FUSION_THRESHOLDS`), and the config helper (`configureFusion`).
 */

export {
  RiskFusionAgent,
  buildDefaultRiskFusionAgent,
} from "./risk-fusion-agent.js";
export {
  FUSION_CONFIG,
  FUSION_THRESHOLDS,
  FUSION_WEIGHTS,
  clamp01,
  configureFusion,
  scoreToAction,
} from "./fusion-config.js";
export type { FusionAction, FusionThresholds, FusionWeights } from "../agents/types.js";
