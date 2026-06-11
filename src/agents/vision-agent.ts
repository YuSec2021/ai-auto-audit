/**
 * Sprint 2 — Vision Agent no-op stub.
 *
 * Input contract (declared via declaration-merging on `Agent.run`):
 *   `AgentInput & { ocr_text?: string; exif_summary?: Readonly<Record<string, unknown>> }`
 *
 * The stub returns the documented multi-axis output shape:
 *   - porn_score, violence_score, ad_score, political_score (all 0.5)
 *   - exif_keys: the keys of the input `exif_summary` (or empty)
 *
 * epic-3 will replace the body with the DashScope Qwen3-VL call.
 */

import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  HealthStatus,
} from "./types.js";

/** Richer input shape for the vision agent. */
export type VisionInput = AgentInput & {
  /** Upstream OCR text context (optional). */
  ocr_text?: string;
  /** Upstream EXIF summary (optional). */
  exif_summary?: Readonly<Record<string, unknown>>;
};

/** Output details shape for the vision stub. */
export interface VisionOutputDetails {
  porn_score: number;
  violence_score: number;
  ad_score: number;
  political_score: number;
  exif_keys: ReadonlyArray<string>;
  /** Index signature so the shape is assignable to `Record<string, unknown>`. */
  [key: string]: unknown;
}

/**
 * Sprint 2 stub. `run()` returns score 0.5, reason "stub-vision", and
 * the four-axis multi-modal output. epic-3 replaces the body.
 */
export class VisionAgent implements Agent {
  readonly id: string = "vision-stub-002";
  readonly version: string = "0.2.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: VisionInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error(`VisionAgent ${this.id} not initialized`);
    }
    const exif_keys: ReadonlyArray<string> = input.exif_summary
      ? Object.keys(input.exif_summary)
      : [];
    const details: VisionOutputDetails = {
      porn_score: 0.5,
      violence_score: 0.5,
      ad_score: 0.5,
      political_score: 0.5,
      exif_keys,
    };
    return {
      image_id: input.image_id,
      score: 0.5,
      reason: "stub-vision",
      details,
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}
