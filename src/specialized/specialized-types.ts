/**
 * Sprint 4 — Specialized sub-agent type definitions.
 *
 * Defines the `target` discriminator (one of `porn | ad | political | logo`)
 * and the richer input / output shapes the four Sprint 4 stubs share.
 * Real classifiers for these targets land in epic-5; Sprint 4 only
 * ships stubs that return the documented `STUB_SCORE` value.
 */

import type { AgentInput, AgentOutput } from "../agents/types.js";

/** The four specialized sub-targets a single image is evaluated against. */
export type SpecializedTarget = "porn" | "ad" | "political" | "logo";

/**
 * The richer input shape for any specialized sub-agent. The orchestrator
 * passes the image_id and a `target` discriminator; the per-layer
 * inputs (text, vision, metadata) flow through the `context` field.
 */
export type SpecializedInput = AgentInput & {
  /** Which specialized target this invocation is scoring. */
  target: SpecializedTarget;
};

/**
 * The richer output shape for any specialized sub-agent. The
 * `details.target` discriminator mirrors the input and lets downstream
 * callers (e.g. the risk-fusion agent) attribute the score to a
 * specific axis without needing the agent `id` lookup.
 */
export type SpecializedOutput = AgentOutput & {
  details: {
    target: SpecializedTarget;
    /** Index signature for assignability to `Record<string, unknown>`. */
    [key: string]: unknown;
  };
};

/**
 * The deterministic stub score all four Sprint 4 specialized
 * sub-agents return. epic-5 will replace the body of each agent with
 * a real classifier that emits a value in `[0, 1]`.
 */
export const STUB_SCORE = 0.5;
