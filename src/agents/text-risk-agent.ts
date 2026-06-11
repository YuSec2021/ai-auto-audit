/**
 * Sprint 2 — Text Risk Agent no-op stub.
 *
 * Input contract (declared via declaration-merging on `Agent.run`):
 *   `AgentInput & { ocr_text: string; bboxes: ReadonlyArray<unknown> }`
 *
 * The stub returns the documented output shape so the orchestrator
 * can wire it up end-to-end. epic-2 will replace the body with the
 * real AC-automaton + DFA + regex matcher; the input/output contract
 * is the load-bearing surface for that swap.
 */

import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  HealthStatus,
} from "./types.js";

/**
 * The richer input shape for the text-risk agent. Declared as a
 * local extension type so the stub is self-documenting; epic-2 will
 * inherit the same shape.
 */
export type TextRiskInput = AgentInput & {
  /** OCR text from the upstream OCR stage. */
  ocr_text: string;
  /** Bounding boxes for the OCR text spans (shape TBD in epic-2). */
  bboxes: ReadonlyArray<unknown>;
};

/** Output details shape for the text-risk stub. */
export interface TextRiskOutputDetails {
  matched_words: ReadonlyArray<unknown>;
  /** Index signature so the shape is assignable to `Record<string, unknown>`. */
  [key: string]: unknown;
}

/**
 * Sprint 2 stub. `run()` returns score 0.5, reason "stub-text-risk",
 * and an empty `matched_words` array. epic-2 replaces the body.
 */
export class TextRiskAgent implements Agent {
  readonly id: string = "text-risk-stub-002";
  readonly version: string = "0.2.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: TextRiskInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error(`TextRiskAgent ${this.id} not initialized`);
    }
    const details: TextRiskOutputDetails = { matched_words: [] };
    return {
      image_id: input.image_id,
      score: 0.5,
      reason: "stub-text-risk",
      details,
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}
