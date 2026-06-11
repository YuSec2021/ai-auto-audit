/**
 * Sprint 5 — Placeholder fusion output helper extracted from orchestrator.ts.
 *
 * Used to populate the 4 specialized output slots (and the fusion slot in
 * the cancel branch) when the corresponding agent did not run. The score
 * is the neutral 0.5 and the action is `REVIEW` (the orchestrator's
 * documented default for skipped agents).
 *
 * Byte-identical to the original orchestrator.ts:722-724 implementation.
 */
import type { AgentOutput } from "../agents/index.js";

export function placeholderFusionOutput(image_id: string, reason: string): AgentOutput {
  return { image_id, score: 0.5, reason, details: { action: "REVIEW" } };
}
