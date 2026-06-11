/**
 * Sprint 4 — Risk Fusion Agent.
 *
 * Replaces the Sprint 2/3 1-line fusion stub. Implements the Sprint
 * 1 `Agent` interface and consumes an `AgentInput` whose `context`
 * carries 7 per-layer scores (`text_risk`, `vision`, `metadata`,
 * `porn`, `ad`, `political`, `logo`).
 *
 * The weighted formula is the only path to the action:
 *
 *   score = clamp01( sum( weights[k] * per_layer[k] ) )
 *   action = (score >= rejectAt) ? "REJECT"
 *          : (score >= reviewAt) ? "REVIEW"
 *          : "PASS"
 *
 * Missing per-layer scores default to 0.0. Out-of-range scores are
 * clamped to [0, 1] before weighting.
 *
 * The `details` payload is `{ action, per_layer: { ...7 floats },
 * weights: { ...7 floats } }` — the only observable signal of which
 * weights were applied.
 *
 * This agent is the canonical fusion implementation; the orchestrator
 * defaults its `fusion` slot to a `RiskFusionAgent` instance when no
 * slot is provided.
 */

import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  HealthStatus,
} from "../agents/types.js";
import {
  FUSION_CONFIG,
  clamp01,
  configureFusion,
  scoreToAction,
} from "./fusion-config.js";
import type { FusionAction, FusionThresholds, FusionWeights } from "../agents/types.js";

/** The 7 per-layer score keys. */
const LAYER_KEYS: ReadonlyArray<keyof FusionWeights> = [
  "text_risk",
  "vision",
  "metadata",
  "porn",
  "ad",
  "political",
  "logo",
];

/**
 * Build a `per_layer` record with all 7 keys populated, defaulting
 * to 0.0 for any missing input keys.
 */
function buildPerLayer(input: AgentInput): FusionWeights {
  const ctx = (input.context ?? {}) as {
    per_layer?: Partial<Record<keyof FusionWeights, unknown>>;
  };
  const raw = ctx.per_layer ?? {};
  const out: Record<keyof FusionWeights, number> = {
    text_risk: 0,
    vision: 0,
    metadata: 0,
    porn: 0,
    ad: 0,
    political: 0,
    logo: 0,
  };
  for (const k of LAYER_KEYS) {
    const v = raw[k];
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[k] = clamp01(v);
    }
  }
  return out as FusionWeights;
}

/**
 * Risk Fusion Agent — the canonical Sprint 4 fusion implementation.
 *
 * The agent is constructed with a frozen config (default or override);
 * the config is captured at construction time and used for every
 * `run()` invocation. To change the config at runtime, instantiate a
 * new agent (e.g. via `configureFusion(...)` + `new RiskFusionAgent(cfg)`).
 */
export class RiskFusionAgent implements Agent {
  readonly id: string = "risk-fusion-agent";
  readonly version: string = "0.4.0";

  private readonly config: Readonly<{
    weights: Readonly<FusionWeights>;
    thresholds: Readonly<FusionThresholds>;
  }>;
  private initialized = false;

  constructor(
    config: Readonly<{
      weights: Readonly<FusionWeights>;
      thresholds: Readonly<FusionThresholds>;
    }> = FUSION_CONFIG,
  ) {
    this.config = config;
  }

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error(`RiskFusionAgent ${this.id} not initialized`);
    }
    const perLayer = buildPerLayer(input);
    const weights = this.config.weights;
    const thresholds = this.config.thresholds;

    let sum = 0;
    for (const k of LAYER_KEYS) {
      sum += weights[k] * perLayer[k];
    }
    const score = clamp01(sum);
    const action: FusionAction = scoreToAction(score, thresholds);

    return {
      image_id: input.image_id,
      score,
      reason: "fusion-decision",
      details: {
        action,
        per_layer: perLayer as unknown as Readonly<Record<string, unknown>>,
        weights: weights as unknown as Readonly<Record<string, unknown>>,
      },
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }

  /**
   * The active config (default or override). Read-only accessor for
   * observability and tests.
   */
  get activeConfig(): Readonly<{
    weights: Readonly<FusionWeights>;
    thresholds: Readonly<FusionThresholds>;
  }> {
    return this.config;
  }
}

/**
 * Convenience factory: build a `RiskFusionAgent` with the default
 * `FUSION_CONFIG` plus optional overrides applied via `configureFusion`.
 *
 * Equivalent to:
 *   new RiskFusionAgent(configureFusion(opts))
 */
export function buildDefaultRiskFusionAgent(opts?: {
  weights?: Partial<FusionWeights>;
  thresholds?: Partial<FusionThresholds>;
}): RiskFusionAgent {
  if (opts === undefined) return new RiskFusionAgent(FUSION_CONFIG);
  return new RiskFusionAgent(configureFusion(opts));
}

// Re-export the config helpers from the fusion module so consumers can
// import everything from one place.
export {
  FUSION_CONFIG,
  FUSION_THRESHOLDS,
  FUSION_WEIGHTS,
  clamp01,
  configureFusion,
  scoreToAction,
} from "./fusion-config.js";
