/**
 * Sprint 5 — 7-agent fan-out helper extracted from orchestrator.ts.
 *
 * Replaces the inline `Promise.all` block in `executeMainPath` (the
 * original orchestrator.ts:459-474) with a single call to `runFanOut`.
 * The 7 agents are invoked in the contractually-mandated order:
 *
 *   [textRisk, vision, metadata, porn, ad, political, logo]
 *
 * Each leg is wrapped with the existing per-leg audit-log emission
 * (Sprint 1 `emitAgentAuditLog`) and the `error -> failed` handling
 * (the caller passes an `onAgentError` callback that performs the
 * orchestrator's `transitionToFailed` step). The Promise.all array
 * order is preserved byte-identical to the Sprint 4 baseline.
 *
 * The internal `runLeg` helper is private to this module. The
 * orchestrator keeps its own in-file `runAgent` closure for the 2
 * fusion call sites (blocklist fast-path at line 402 and main-path
 * fusion at line 519) — both use the same audit-log emission
 * pattern but the orchestrator's own closure has direct access to
 * the private `transitionToFailed` method.
 */
import { emitAgentAuditLog } from "../agents/audit-log.js";
import type {
  Agent,
  AgentInput,
  AgentOutput,
  OrchestratorInput,
  SpecializedOrchestratorSlots,
  SpecializedTarget,
} from "../agents/index.js";
import type { OrchestratorSlots } from "../agents/types.js";

/** Local slot type — widens the public `OrchestratorSlots` with the
 *  optional Sprint 4 specialized slots. Mirrors the orchestrator's
 *  local `LocalOrchestratorSlots` definition. */
type LocalOrchestratorSlots = OrchestratorSlots & Partial<SpecializedOrchestratorSlots>;

/** Callback signature for the `transitionToFailed` step on agent error. */
type OnAgentError = (agentName: string, error: Error) => Promise<void>;

/**
 * Run the 7-agent parallel fan-out. Each `agent.run()` call is
 * wrapped with the canonical audit-log emission and an optional
 * `onAgentError` callback (the orchestrator passes a function that
 * calls `this.transitionToFailed` to preserve Sprint 4 behavior).
 *
 * The 7-tuple order is:
 *   [textRisk, vision, metadata, porn, ad, political, logo]
 *
 * On any agent error: the audit line is emitted (with `score: -1` and
 * `reason: "error: <message>"`), the `onAgentError` callback is
 * invoked, and the error is re-thrown. The orchestrator's outer
 * `executeMainPath` try/catch sets `_lastRunAuditLines` and re-throws.
 */
export async function runFanOut(
  slots: LocalOrchestratorSlots,
  input: OrchestratorInput,
  imageId: string,
  onAgentError?: OnAgentError,
): Promise<[
  AgentOutput,
  AgentOutput,
  AgentOutput,
  AgentOutput,
  AgentOutput,
  AgentOutput,
  AgentOutput,
]> {
  void imageId;
  const runLeg = async (
    agent: Agent,
    agentInput: AgentInput,
    agentName: string,
  ): Promise<AgentOutput> => {
    const t0 = performance.now();
    try {
      const out = await agent.run(agentInput);
      const elapsed = performance.now() - t0;
      await emitAgentAuditLog({
        image_id: out.image_id,
        agent: agentName,
        score: out.score,
        reason: out.reason,
        elapsed_ms: Math.round(elapsed * 100) / 100,
      });
      return out;
    } catch (err) {
      const elapsed = performance.now() - t0;
      await emitAgentAuditLog({
        image_id: agentInput.image_id,
        agent: agentName,
        score: -1,
        reason: `error: ${(err as Error).message}`,
        elapsed_ms: Math.round(elapsed * 100) / 100,
      });
      if (onAgentError) {
        await onAgentError(agentName, err as Error);
      }
      throw err;
    }
  };

  // Helper: build a standard AgentInput (just the image_id, plus the
  // layer-specific context the stub agents may consult). Mirrors the
  // orchestrator's private `buildAgentInput(input, layer)` helper.
  const buildInput = (layer: string): AgentInput => {
    const base: AgentInput = { image_id: input.image_id };
    if (layer === "text-risk") {
      const enriched = base as AgentInput & {
        ocr_text?: string;
        bboxes?: ReadonlyArray<unknown>;
      };
      enriched.ocr_text = input.ocr_text ?? "";
      enriched.bboxes = input.bboxes ?? [];
      return enriched;
    }
    if (layer === "vision") {
      const enriched = base as AgentInput & {
        ocr_text?: string;
        exif_summary?: Readonly<Record<string, unknown>>;
      };
      if (input.ocr_text !== undefined) enriched.ocr_text = input.ocr_text;
      if (input.exif_summary !== undefined) enriched.exif_summary = input.exif_summary;
      return enriched;
    }
    if (layer === "metadata") {
      const enriched = base as AgentInput & { image_bytes?: Buffer };
      enriched.image_bytes = input.image_bytes ?? Buffer.alloc(0);
      return enriched;
    }
    return base;
  };

  // Helper: build a Sprint 4 specialized sub-agent input. The
  // `target` discriminator is set on the input's `context` field.
  const buildSpecializedInput = (target: SpecializedTarget): AgentInput => ({
    image_id: input.image_id,
    context: { target },
  });

  return Promise.all([
    runLeg(slots.textRisk, buildInput("text-risk"), slots.textRisk.id),
    runLeg(slots.vision, buildInput("vision"), slots.vision.id),
    runLeg(slots.metadata, buildInput("metadata"), slots.metadata.id),
    runLeg(slots.porn!, buildSpecializedInput("porn"), slots.porn!.id),
    runLeg(slots.ad!, buildSpecializedInput("ad"), slots.ad!.id),
    runLeg(slots.political!, buildSpecializedInput("political"), slots.political!.id),
    runLeg(slots.logo!, buildSpecializedInput("logo"), slots.logo!.id),
  ]);
}
