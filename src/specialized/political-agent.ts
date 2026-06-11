/**
 * Sprint 4 — Political-Agent stub.
 *
 * Returns the documented `STUB_SCORE` (0.5) with `target: "political"`
 * on `details`. epic-5 will replace the body with the real classifier.
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
 * Political-Agent stub. Same shape as `PornAgent`; the discriminator
 * on `details.target` is the only thing that distinguishes them.
 */
export class PoliticalAgent implements Agent {
  readonly id: string = "political-stub-004";
  readonly version: string = "0.4.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: SpecializedInput): Promise<SpecializedOutput> {
    if (!this.initialized) {
      throw new Error(`PoliticalAgent ${this.id} not initialized`);
    }
    return {
      image_id: input.image_id,
      score: STUB_SCORE,
      reason: "stub-political",
      details: { target: "political", score: STUB_SCORE },
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}
