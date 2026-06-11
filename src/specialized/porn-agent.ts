/**
 * Sprint 4 — Porn-Agent stub.
 *
 * Returns the documented `STUB_SCORE` (0.5) with `target: "porn"` on
 * `details`. epic-5 will replace the body with the real classifier
 * (ONNX model or external API call). The stub implements the full
 * Sprint 1 `Agent` interface so the orchestrator can wire it in
 * without any conditional path.
 */

import type {
  Agent,
  AgentContext,
  HealthStatus,
} from "../agents/types.js";

import {
  STUB_SCORE,
  type SpecializedInput,
  type SpecializedOutput,
} from "./specialized-types.js";

/**
 * Porn-Agent stub. `id` / `version` are stable strings; `run()` is
 * deterministic and side-effect-free.
 */
export class PornAgent implements Agent {
  readonly id: string = "porn-stub-004";
  readonly version: string = "0.4.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: SpecializedInput): Promise<SpecializedOutput> {
    if (!this.initialized) {
      throw new Error(`PornAgent ${this.id} not initialized`);
    }
    return {
      image_id: input.image_id,
      score: STUB_SCORE,
      reason: "stub-porn",
      details: { target: "porn", score: STUB_SCORE },
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}
