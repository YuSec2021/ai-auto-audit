/**
 * Sprint 2 — Metadata Agent no-op stub.
 *
 * Input contract (declared via declaration-merging on `Agent.run`):
 *   `AgentInput & { image_bytes: Buffer }`
 *
 * The stub returns the documented three-flag output shape:
 *   - has_exif: false
 *   - has_gps: false
 *   - ai_gen_suspected: false
 *
 * epic-4 will replace the body with the real EXIF/GPS/AI-gen detector.
 */

import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  HealthStatus,
} from "./types.js";

/** Richer input shape for the metadata agent. */
export type MetadataInput = AgentInput & {
  /** Raw image bytes for EXIF/GPS/AI-gen detection. */
  image_bytes: Buffer;
};

/** Output details shape for the metadata stub. */
export interface MetadataOutputDetails {
  has_exif: boolean;
  has_gps: boolean;
  ai_gen_suspected: boolean;
  /** Index signature so the shape is assignable to `Record<string, unknown>`. */
  [key: string]: unknown;
}

/**
 * Sprint 2 stub. `run()` returns score 0.5, reason "stub-metadata",
 * and the three documented flags. epic-4 replaces the body.
 */
export class MetadataAgent implements Agent {
  readonly id: string = "metadata-stub-002";
  readonly version: string = "0.2.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: MetadataInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error(`MetadataAgent ${this.id} not initialized`);
    }
    const details: MetadataOutputDetails = {
      has_exif: false,
      has_gps: false,
      ai_gen_suspected: false,
    };
    return {
      image_id: input.image_id,
      score: 0.5,
      reason: "stub-metadata",
      details,
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}
