/**
 * Sprint 5 — Fusion input builders extracted from orchestrator.ts.
 *
 * Two pure builders are exposed:
 *
 *   1. `buildFusionInput` (orchestrator.ts:632-657) — assembles a
 *      `FusionInput` (i.e. `AgentInput` with a `per_layer` context
 *      record) from the 7 per-layer `AgentOutput`s. Each score is
 *      clamped to [0, 1] via `clampToFusionUnit` so the fusion
 *      weighted sum stays bounded.
 *
 *   2. `buildBlocklistFusionInput` (orchestrator.ts:669-690) — used
 *      by the blocklist fast-path. The 7 fan-out agents were not
 *      invoked, so we use placeholder per-layer scores of 1.0
 *      (matching the contract's documented default). The 7-layer
 *      weighted sum is `0.10 + 0.20 + 0.10 + 0.20 + 0.15 + 0.15 + 0.10 = 1.00`,
 *      which falls in the REJECT band (>= 0.85). A
 *      `blocklist_fast_path: true` flag is added to the context so
 *      the fusion agent can short-circuit its work.
 *
 * Both implementations are byte-identical to the original orchestrator
 * code; the refactor is purely a code-organization move.
 */
import type {
  AgentInput,
  AgentOutput,
  FusionWeights,
  OrchestratorInput,
} from "../agents/index.js";
import { clampToFusionUnit } from "./clamp.js";

/**
 * Build the fusion input from the 7 per-layer `AgentOutput` results.
 * Each score is clamped to [0, 1] via `clampToFusionUnit`. The
 * `preprocess` output is unused (the orchestrator has already
 * consumed it).
 */
export function buildFusionInput(
  input: OrchestratorInput,
  preprocess: AgentOutput,
  textRisk: AgentOutput,
  vision: AgentOutput,
  metadata: AgentOutput,
  porn: AgentOutput,
  ad: AgentOutput,
  political: AgentOutput,
  logo: AgentOutput,
): AgentInput {
  void preprocess;
  const perLayer: FusionWeights = {
    text_risk: clampToFusionUnit(textRisk.score),
    vision: clampToFusionUnit(vision.score),
    metadata: clampToFusionUnit(metadata.score),
    porn: clampToFusionUnit(porn.score),
    ad: clampToFusionUnit(ad.score),
    political: clampToFusionUnit(political.score),
    logo: clampToFusionUnit(logo.score),
  };
  return {
    image_id: input.image_id,
    context: { per_layer: perLayer },
  };
}

/**
 * Build the fusion input for the blocklist fast-path. The seven
 * fan-out agents were not invoked, so we use placeholder per-layer
 * scores of 1.0 (matching the contract's documented default). The
 * legal-transition check is bypassed for preprocess -> fusion by
 * the caller (manual leave/enter events are emitted).
 */
export function buildBlocklistFusionInput(
  input: OrchestratorInput,
  preprocess: AgentOutput,
): AgentInput {
  void preprocess;
  const perLayer: FusionWeights = {
    text_risk: 1.0,
    vision: 1.0,
    metadata: 1.0,
    porn: 1.0,
    ad: 1.0,
    political: 1.0,
    logo: 1.0,
  };
  return {
    image_id: input.image_id,
    context: {
      per_layer: perLayer,
      blocklist_fast_path: true,
    },
  };
}
