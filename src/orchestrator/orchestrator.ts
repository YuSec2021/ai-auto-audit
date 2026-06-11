/**
 * Sprint 2/3/4/5 — Pipeline orchestrator.
 *
 * Drives a single image through the pipeline state machine
 *   init -> preprocess -> parallel-fan-out -> fan-in -> fusion -> done
 * with terminal branches `cancelled` and `failed`. Depends only on the
 * `MessageBus` interface (NEVER on the concrete
 * `EventEmitterMessageBus` class) so a future NATS/Kafka transport
 * can drop in.
 *
 * Sprint 5 — the 7-fan-out dispatch and the 3 fusion-input / placeholder
 * helpers moved to `../pipeline-stages/`. The orchestrator coordinates
 * the state machine, owns the checkpoint, and publishes events.
 */

import { emitAgentAuditLog } from "../agents/audit-log.js";
import { getMessageBus } from "../agents/message-bus.js";
import type {
  Agent,
  AgentInput,
  AgentOutput,
  MessageBus,
  OrchestratorInput,
  OrchestratorSlots,
  OrchestratorSubscriber,
  PipelineCheckpoint,
  PipelineEvent,
  PipelineStateS2,
  SpecializedOrchestratorSlots,
} from "../agents/types.js";
import { RiskFusionAgent } from "../fusion/index.js";
import {
  AdAgent,
  LogoAgent,
  PoliticalAgent,
  PornAgent,
} from "../specialized/index.js";
import {
  IllegalTransitionError,
  TERMINAL_STATES,
  isLegalTransition,
  type PipelineState,
} from "./state-machine.js";
// Sprint 5 — extracted helpers re-imported from the new pipeline-stages barrel.
import {
  buildBlocklistFusionInput,
  buildFusionInput,
  placeholderFusionOutput,
  runFanOut,
} from "../pipeline-stages/index.js";

// Re-export the state-machine's PipelineState so consumers of the
// orchestrator module only need to import from one place. The
// PipelineStateS2 alias in types.ts is identical at the type level.
export type { PipelineState } from "./state-machine.js";

/** Re-exposed from the agent types barrel for convenience. */
export type { OrchestratorInput, OrchestratorSlots, PipelineEvent } from "../agents/types.js";

/** The final result of a `run()` or `resume()` call. */
export interface OrchestratorResult {
  image_id: string;
  terminalState: PipelineState;
  preprocessOutput: AgentOutput;
  textRiskOutput: AgentOutput;
  visionOutput: AgentOutput;
  metadataOutput: AgentOutput;
  fusionOutput: AgentOutput;
  // Sprint 4 — optional specialized outputs. Present iff the
  // orchestrator fan-out ran (i.e. the path was not blocklist-skipped).
  // On a blocklist fast-path these are still populated with placeholder
  // `AgentOutput` shapes so callers see a stable result surface.
  pornOutput?: AgentOutput;
  adOutput?: AgentOutput;
  politicalOutput?: AgentOutput;
  logoOutput?: AgentOutput;
}

/** Local slot type — public `OrchestratorSlots` (5 fields) + 4 OPTIONAL
 *  Sprint 4 specialized slots. See sprint-contract.md Risks §1. */
type LocalOrchestratorSlots = OrchestratorSlots &
  Partial<SpecializedOrchestratorSlots>;

/** Internal flag tracking the cancel request. */
interface CancelState {
  requested: boolean;
  reason: string;
}

/**
 * The pipeline orchestrator. One instance per pipeline run; for
 * concurrent runs, instantiate multiple. Depends only on the
 * `MessageBus` interface (the concrete transport is fetched via
 * `getMessageBus()`).
 */
export class PipelineOrchestrator {
  private readonly bus: MessageBus;
  private slots: LocalOrchestratorSlots | null = null;
  private _currentState: PipelineState = "init";
  private cancelState: CancelState = { requested: false, reason: "" };
  private lastCheckpoint: PipelineCheckpoint | null = null;
  private subscribers: Set<OrchestratorSubscriber> = new Set();
  /** Audit lines emitted by the most recent run (caller-readable). */
  private _lastRunAuditLines = 0;
  /** Per-run audit-line counter (used by runAgent closure). */
  private _lastRunLineCount = 0;

  constructor(bus?: MessageBus) {
    this.bus = bus ?? getMessageBus();
  }

  /** Current pipeline state. Always defined after `init()`. */
  get currentState(): PipelineState { return this._currentState; }

  /** Was `cancel()` called? Cleared by a successful `resume()`. */
  get isCancelRequested(): boolean { return this.cancelState.requested; }

  /** Cancel reason, or empty string if not cancelled. */
  get cancelReason(): string { return this.cancelState.reason; }

  /** Number of audit lines emitted during the last `run()` / `resume()`. */
  get lastRunAuditLines(): number { return this._lastRunAuditLines; }

  /**
   * Register the 5 named agent slots + 4 OPTIONAL Sprint 4 specialized
   * slots. Defaults any missing specialized slot to the corresponding
   * stub; defaults `fusion` to a real `RiskFusionAgent`.
   */
  async init(slots: LocalOrchestratorSlots): Promise<void> {
    const resolved: LocalOrchestratorSlots = {
      ...slots,
      porn: slots.porn ?? new PornAgent(),
      ad: slots.ad ?? new AdAgent(),
      political: slots.political ?? new PoliticalAgent(),
      logo: slots.logo ?? new LogoAgent(),
      fusion: slots.fusion ?? new RiskFusionAgent(),
    };
    this.slots = resolved;
    this._currentState = "init";
    this.cancelState = { requested: false, reason: "" };
    this.lastCheckpoint = null;
    for (const agent of Object.values(resolved)) {
      if (agent !== undefined) {
        await agent.init({});
      }
    }
  }

  /** Subscribe to pipeline state-change events. Returns an unsubscribe. */
  subscribe(handler: OrchestratorSubscriber): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /**
   * Request cancellation. Sets an internal flag; the orchestrator
   * short-circuits to `cancelled` before `fusion`. In-flight `run()`
   * calls are NOT interrupted.
   */
  cancel(reason: string): void {
    this.cancelState = { requested: true, reason };
    this.publish("pipeline.cancel.requested", {
      state: "cancelled",
      image_id: this.lastCheckpoint?.image_id ?? "",
      publishedAt: new Date().toISOString(),
      reason,
    });
  }

  /** Clear the cancel flag. Called by `resume()` on a new run. */
  private clearCancel(): void {
    this.cancelState = { requested: false, reason: "" };
  }

  /**
   * Walk the full pipeline. Returns when the terminal state is
   * `done`, `cancelled`, or `failed`. Runtime errors transition to
   * `failed`; only programmer errors throw.
   */
  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    if (this.slots === null) {
      throw new Error("PipelineOrchestrator.run() called before init()");
    }
    this.clearCancel();
    this._lastRunLineCount = 0;
    this.publishStateEvent("init", "enter", input.image_id);
    return this.executeMainPath(input, /* fromState */ "init", /* skipPreprocess */ false);
  }

  /**
   * Resume from the last completed state (in-memory checkpoint).
   * Re-runs the fan-out agents and fusion; preprocess is skipped
   * if its output is already in the checkpoint.
   */
  async resume(): Promise<OrchestratorResult> {
    if (this.slots === null) {
      throw new Error("PipelineOrchestrator.resume() called before init()");
    }
    if (this.lastCheckpoint === null) {
      throw new Error("PipelineOrchestrator.resume() called with no checkpoint");
    }
    this.clearCancel();

    // Resume from the checkpoint's lastState; for a cancel-after-
    // preprocess scenario, that is `parallel-fan-out`.
    const fromState: PipelineState = this.lastCheckpoint.lastState === "init"
      ? "preprocess"
      : this.lastCheckpoint.lastState;
    return this.executeMainPath(
      { image_id: this.lastCheckpoint.image_id },
      fromState,
      /* skipPreprocess */ this.lastCheckpoint.preprocessOutput !== undefined,
    );
  }

  // -------------------------------------------------------------------------
  // Internal — the main path executor.
  // -------------------------------------------------------------------------

  private async executeMainPath(
    input: OrchestratorInput,
    fromState: PipelineState,
    skipPreprocess: boolean,
  ): Promise<OrchestratorResult> {
    if (this.slots === null) {
      throw new Error("internal: slots null");
    }
    const slots = this.slots;

    let preprocessOut: AgentOutput | null = skipPreprocess
      ? (this.lastCheckpoint?.preprocessOutput ?? null)
      : null;
    let textRiskOut: AgentOutput | null = null;
    let visionOut: AgentOutput | null = null;
    let metadataOut: AgentOutput | null = null;
    let fusionOut: AgentOutput | null = null;
    // Sprint 4 — 4 specialized agent outputs.
    let pornOut: AgentOutput | null = null;
    let adOut: AgentOutput | null = null;
    let politicalOut: AgentOutput | null = null;
    let logoOut: AgentOutput | null = null;

    // Assert the transition is legal; on illegal, go to `failed`
    // instead of throwing to the caller.
    const transition = async (to: PipelineState): Promise<PipelineState> => {
      if (!isLegalTransition(this._currentState, to)) {
        await this.transitionToFailed(
          input.image_id,
          new IllegalTransitionError(this._currentState, to).message,
        );
        throw new IllegalTransitionError(this._currentState, to);
      }
      const from = this._currentState;
      this.publishStateEvent(from, "leave", input.image_id);
      this._currentState = to;
      this.publishStateEvent(to, "enter", input.image_id);
      return to;
    };

    // Wrap a single agent run with audit-log emission + error-to-failed.
    const runAgent = async (
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
        this._lastRunLineCount++;
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
        this._lastRunLineCount++;
        await this.transitionToFailed(
          input.image_id,
          `${agentName} threw: ${(err as Error).message}`,
        );
        throw err;
      }
    };

    try {
      // -- 1. preprocess (optional skip on resume) --
      if (fromState === "init" && !skipPreprocess) {
        // init -> preprocess transition
        if (this._currentState === "init") {
          await transition("preprocess");
        }
        // Sprint 3: call preprocess DIRECTLY (the agent self-emits
        // its own audit line; we do NOT increment _lastRunLineCount
        // here so the smoke runner's audit-line count matches the
        // actual log file).
        preprocessOut = await slots.preprocess.run(
          this.buildPreprocessInput(input),
        );
        this.writeCheckpoint(input.image_id, "preprocess", preprocessOut, undefined, undefined);

        // Blocklist fast-path: skip fan-out, go straight to fusion
        // (only preprocess + fusion emit audit lines; total: 2).
        if (preprocessOut.reason === "blocklist-hit") {
          this.publishStateEvent("preprocess", "leave", input.image_id);
          this._currentState = "fusion";
          this.publishStateEvent("fusion", "enter", input.image_id);
          fusionOut = await runAgent(
            slots.fusion,
            buildBlocklistFusionInput(input, preprocessOut!),
            slots.fusion.id,
          );
          this.writeCheckpoint(
            input.image_id,
            "fusion",
            preprocessOut,
            undefined,
            fusionOut,
          );
          await transition("done");
          this.publishTerminal("done", input.image_id);
          this._lastRunAuditLines = this._lastRunLineCount;
          // 7 placeholders for the 7 fan-out agents (Sprint 4).
          return this.buildResult(
            input.image_id,
            preprocessOut!,
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            fusionOut,
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
            placeholderFusionOutput(input.image_id, "skipped-blocklist"),
          );
        }

        await transition("parallel-fan-out");
      } else if (skipPreprocess && preprocessOut !== null) {
        // Resume path: jump straight to parallel-fan-out
        this._currentState = "parallel-fan-out";
        this.publishStateEvent("parallel-fan-out", "enter", input.image_id);
      } else {
        await transition("preprocess");
        preprocessOut = await slots.preprocess.run(
          this.buildPreprocessInput(input),
        );
        await transition("parallel-fan-out");
      }

      // -- 2. fan-out: 7 agents in parallel --
      // Order: [textRisk, vision, metadata, porn, ad, political, logo].
      // Sprint 5: dispatch extracted to `runFanOut`; on agent error the
      // closure calls `transitionToFailed` then re-throws.
      const fanOutResults = await runFanOut(
        slots,
        input,
        input.image_id,
        async (agentName, err) => {
          await this.transitionToFailed(
            input.image_id,
            `${agentName} threw: ${err.message}`,
          );
        },
      );
      textRiskOut = fanOutResults[0]!;
      visionOut = fanOutResults[1]!;
      metadataOut = fanOutResults[2]!;
      pornOut = fanOutResults[3]!;
      adOut = fanOutResults[4]!;
      politicalOut = fanOutResults[5]!;
      logoOut = fanOutResults[6]!;

      // Check cancel after fan-out
      if (this.cancelState.requested) {
        this.lastCheckpoint = this.buildCheckpoint(
          input.image_id,
          "parallel-fan-out",
          preprocessOut,
          { textRisk: textRiskOut, vision: visionOut, metadata: metadataOut },
          undefined,
        );
        this.publishCheckpoint(this.lastCheckpoint);
        await transition("cancelled");
        this.publishTerminal("cancelled", input.image_id, this.cancelState.reason);
        // Sprint 4: include the 4 new specialized outputs alongside
        // the 3 original ones (stable result surface regardless of
        // terminal state).
        return this.buildResult(
          input.image_id,
          preprocessOut!,
          textRiskOut,
          visionOut,
          metadataOut,
          placeholderFusionOutput(input.image_id, "cancelled-before-fusion"),
          pornOut,
          adOut,
          politicalOut,
          logoOut,
        );
      }

      // -- 3. fan-in -> fusion --
      await transition("fan-in");
      this.writeCheckpoint(
        input.image_id,
        "fan-in",
        preprocessOut,
        { textRisk: textRiskOut, vision: visionOut, metadata: metadataOut },
        undefined,
      );
      await transition("fusion");
      fusionOut = await runAgent(
        slots.fusion,
        buildFusionInput(
          input,
          preprocessOut!,
          textRiskOut,
          visionOut,
          metadataOut,
          pornOut,
          adOut,
          politicalOut,
          logoOut,
        ),
        slots.fusion.id,
      );
      this.writeCheckpoint(
        input.image_id,
        "fusion",
        preprocessOut,
        { textRisk: textRiskOut, vision: visionOut, metadata: metadataOut },
        fusionOut,
      );

      // -- 4. done --
      await transition("done");
      this.publishTerminal("done", input.image_id);
      this._lastRunAuditLines = this._lastRunLineCount;
      return this.buildResult(
        input.image_id,
        preprocessOut!,
        textRiskOut,
        visionOut,
        metadataOut,
        fusionOut,
        pornOut,
        adOut,
        politicalOut,
        logoOut,
      );
    } catch (err) {
      // Transition to failed already done by `transition` or `runAgent`.
      this._lastRunAuditLines = this._lastRunLineCount;
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Internal — helpers
  // -------------------------------------------------------------------------

  // Sprint 5 — `buildSpecializedInput` was moved to
  // pipeline-stages/fan-out.ts (used only by the 7-fan-out block).
  // Sprint 5 — `buildFusionInput` and `buildBlocklistFusionInput`
  // were moved to pipeline-stages/fusion-input.ts.

  /** Build the input for the preprocess agent. */
  private buildPreprocessInput(input: OrchestratorInput): AgentInput {
    const base: AgentInput = { image_id: input.image_id };
    if (input.image_bytes !== undefined) {
      (base as AgentInput & { image_bytes?: Buffer }).image_bytes = input.image_bytes;
    }
    return base;
  }

  private buildCheckpoint(
    image_id: string,
    lastState: PipelineState,
    preprocess: AgentOutput | null,
    fanOut: { textRisk?: AgentOutput; vision?: AgentOutput; metadata?: AgentOutput } | undefined,
    fusion: AgentOutput | undefined,
  ): PipelineCheckpoint {
    const cp: PipelineCheckpoint = { image_id, lastState, publishedAt: new Date().toISOString() };
    if (preprocess !== null) {
      cp.preprocessOutput = { image_id: preprocess.image_id, width: 0, height: 0, hash: "noop" };
    }
    if (fanOut !== undefined) cp.fanOutOutputs = fanOut;
    if (fusion !== undefined) cp.fusionOutput = fusion;
    return cp;
  }

  private buildResult(
    image_id: string,
    preprocess: AgentOutput,
    textRisk: AgentOutput,
    vision: AgentOutput,
    metadata: AgentOutput,
    fusion: AgentOutput,
    porn: AgentOutput,
    ad: AgentOutput,
    political: AgentOutput,
    logo: AgentOutput,
  ): OrchestratorResult {
    return {
      image_id,
      terminalState: this._currentState,
      preprocessOutput: preprocess,
      textRiskOutput: textRisk,
      visionOutput: vision,
      metadataOutput: metadata,
      fusionOutput: fusion,
      // Sprint 4 — 4 optional specialized output fields.
      pornOutput: porn,
      adOutput: ad,
      politicalOutput: political,
      logoOutput: logo,
    };
  }

  private writeCheckpoint(
    image_id: string,
    lastState: PipelineState,
    preprocess: AgentOutput | null,
    fanOut: { textRisk?: AgentOutput; vision?: AgentOutput; metadata?: AgentOutput } | undefined,
    fusion: AgentOutput | undefined,
  ): void {
    this.lastCheckpoint = this.buildCheckpoint(image_id, lastState, preprocess, fanOut, fusion);
    this.publishCheckpoint(this.lastCheckpoint);
  }

  private async transitionToFailed(image_id: string, reason: string): Promise<void> {
    if (TERMINAL_STATES.has(this._currentState)) return;
    this.publishStateEvent(this._currentState, "leave", image_id);
    this._currentState = "failed";
    this.publishStateEvent("failed", "enter", image_id);
    this.publishTerminal("failed", image_id, reason);
  }

  private publishStateEvent(
    state: PipelineState,
    phase: "enter" | "leave",
    image_id: string,
  ): void {
    const event: PipelineEvent = {
      state: state as PipelineStateS2,
      image_id,
      publishedAt: new Date().toISOString(),
    };
    const type = `pipeline.${state}.${phase}`;
    this.publish(type, event);
  }

  private publishTerminal(state: PipelineState, image_id: string, reason?: string): void {
    const event: PipelineEvent = {
      state: state as PipelineStateS2,
      image_id,
      publishedAt: new Date().toISOString(),
    };
    if (reason !== undefined) event.reason = reason;
    this.publish(`pipeline.${state}`, event);
  }

  private publishCheckpoint(cp: PipelineCheckpoint): void {
    const event: PipelineEvent = {
      state: "fan-in",
      image_id: cp.image_id,
      publishedAt: cp.publishedAt,
      reason: "checkpoint",
      context: cp as unknown as Readonly<Record<string, unknown>>,
    };
    this.publish("pipeline.checkpoint", event);
  }

  private publish(type: string, event: PipelineEvent): void {
    // Synchronous dispatch (no await) per Sprint 1's bus contract.
    this.bus.publish(type, event);
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* subscriber errors are non-fatal */ }
    }
  }
}
