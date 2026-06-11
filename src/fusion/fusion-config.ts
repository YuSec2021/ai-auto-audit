/**
 * Sprint 4 — Fusion configuration.
 *
 * The Risk Fusion Agent consumes a 7-layer weighted formula over the
 * per-layer scores (text_risk, vision, metadata, porn, ad, political,
 * logo) and maps the resulting score to one of three actions
 * (PASS / REVIEW / REJECT) via two thresholds.
 *
 * Both weights and thresholds are tunable at module init via
 * `configureFusion({ weights?, thresholds? })`. The default config is
 * always available via `FUSION_CONFIG`; `configureFusion` does NOT
 * mutate it (it returns a NEW frozen struct).
 *
 * Tunability: this is the documented Sprint 4 deviation — a real-
 * world tuning pass is deferred to epic-6.
 */

import type { FusionAction, FusionThresholds, FusionWeights } from "../agents/types.js";

/**
 * Default weights for the 7-layer weighted sum. All weights are in
 * [0, 1] and sum to 1.00. The default weighting reflects a rough
 * heuristic: vision + porn are the heaviest signals (0.20 each),
 * ad + political are next (0.15 each), text_risk + logo (0.10 each)
 * are mid, and metadata (0.10) is the lightest because the existing
 * Sprint 2 stub is a no-op.
 */
export const FUSION_WEIGHTS: Readonly<FusionWeights> = Object.freeze({
  text_risk: 0.10,
  vision: 0.20,
  metadata: 0.10,
  porn: 0.20,
  ad: 0.15,
  political: 0.15,
  logo: 0.10,
});

/**
 * Default thresholds. `REJECT >= rejectAt`, `REVIEW >= reviewAt`
 * (and < rejectAt), `PASS < reviewAt`. The defaults are conservative
 * — borderline cases are routed to REVIEW.
 */
export const FUSION_THRESHOLDS: Readonly<FusionThresholds> = Object.freeze({
  rejectAt: 0.85,
  reviewAt: 0.40,
});

/**
 * The full default fusion config. Consumers that do not need to
 * override should use this directly.
 */
export const FUSION_CONFIG: Readonly<{
  weights: Readonly<FusionWeights>;
  thresholds: Readonly<FusionThresholds>;
}> = Object.freeze({
  weights: FUSION_WEIGHTS,
  thresholds: FUSION_THRESHOLDS,
});

/**
 * Build a new `FUSION_CONFIG` with overridden weights and/or
 * thresholds. The default `FUSION_CONFIG` is NOT mutated.
 *
 * If the override weights do not sum to 1.00, the resulting config
 * is still returned (the formula applies whatever weights the caller
 * supplied), but the dev should be aware that the contract's
 * documented invariant is `sum(weights) == 1.00`. We do not throw
 * here so the dev can experiment with non-normalized weights
 * intentionally.
 */
export function configureFusion(opts: {
  weights?: Partial<FusionWeights>;
  thresholds?: Partial<FusionThresholds>;
}): Readonly<{
  weights: Readonly<FusionWeights>;
  thresholds: Readonly<FusionThresholds>;
}> {
  const weights: FusionWeights = { ...FUSION_WEIGHTS, ...(opts.weights ?? {}) };
  const thresholds: FusionThresholds = {
    ...FUSION_THRESHOLDS,
    ...(opts.thresholds ?? {}),
  };
  return Object.freeze({
    weights: Object.freeze(weights),
    thresholds: Object.freeze(thresholds),
  });
}

/**
 * Pure helper: map a score in [0, 1] to an action via the thresholds.
 * Exported so tests and other agents can call it directly without
 * instantiating the Risk Fusion Agent.
 */
export function scoreToAction(
  score: number,
  thresholds: Readonly<FusionThresholds> = FUSION_THRESHOLDS,
): FusionAction {
  if (score >= thresholds.rejectAt) return "REJECT";
  if (score >= thresholds.reviewAt) return "REVIEW";
  return "PASS";
}

/**
 * Pure helper: clamp a number to the [0, 1] interval.
 */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
