/**
 * Unit tests for src/orchestrator/state-machine.ts and the
 * orchestrator's high-level state-machine surface.
 *
 * Covers:
 *   - PIPELINE_STATE_ORDER contains the six main-path states
 *   - isLegalTransition accepts legal main-path transitions
 *   - isLegalTransition rejects illegal transitions (e.g. init -> done)
 *   - TERMINAL_STATES contains done, cancelled, failed
 *   - nextMainPathState returns the right next state
 *   - IllegalTransitionError carries from/to
 *   - The orchestrator's currentState is typed as PipelineState (not
 *     string) and is never undefined after init().
 */
import { describe, it, expect } from "vitest";

import {
  IllegalTransitionError,
  PIPELINE_STATE_ORDER,
  PIPELINE_TRANSITIONS,
  TERMINAL_STATES,
  isLegalTransition,
  nextMainPathState,
  type PipelineState,
} from "../orchestrator/state-machine.js";
import {
  PipelineOrchestrator,
  type OrchestratorSlots,
} from "../orchestrator/orchestrator.js";
import { EventEmitterMessageBus } from "./message-bus.js";
import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  HealthStatus,
} from "./types.js";

class PassThroughAgent implements Agent {
  readonly id: string;
  readonly version: string = "0.0.1";
  constructor(id: string) {
    this.id = id;
  }
  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
  }
  async run(input: AgentInput): Promise<AgentOutput> {
    return { image_id: input.image_id, score: 0.5, reason: this.id };
  }
  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}

function makeSlots(): OrchestratorSlots {
  return {
    preprocess: new PassThroughAgent("preprocess"),
    textRisk: new PassThroughAgent("textRisk"),
    vision: new PassThroughAgent("vision"),
    metadata: new PassThroughAgent("metadata"),
    fusion: new PassThroughAgent("fusion"),
  };
}

describe("state-machine: adjacency table", () => {
  it("PIPELINE_STATE_ORDER contains the six main-path states in order", () => {
    expect(PIPELINE_STATE_ORDER).toEqual([
      "init",
      "preprocess",
      "parallel-fan-out",
      "fan-in",
      "fusion",
      "done",
    ]);
  });

  it("isLegalTransition accepts the main-path transitions", () => {
    expect(isLegalTransition("init", "preprocess")).toBe(true);
    expect(isLegalTransition("preprocess", "parallel-fan-out")).toBe(true);
    expect(isLegalTransition("parallel-fan-out", "fan-in")).toBe(true);
    expect(isLegalTransition("fan-in", "fusion")).toBe(true);
    expect(isLegalTransition("fusion", "done")).toBe(true);
  });

  it("isLegalTransition accepts the cancel/fail branches", () => {
    expect(isLegalTransition("preprocess", "cancelled")).toBe(true);
    expect(isLegalTransition("fan-in", "failed")).toBe(true);
  });

  it("isLegalTransition rejects skipping states (e.g. init -> done)", () => {
    expect(isLegalTransition("init", "done")).toBe(false);
    expect(isLegalTransition("init", "fusion")).toBe(false);
    expect(isLegalTransition("preprocess", "fan-in")).toBe(false);
  });

  it("terminal states have no outgoing edges", () => {
    for (const term of TERMINAL_STATES) {
      expect(PIPELINE_TRANSITIONS[term]).toEqual([]);
    }
    for (const target of PIPELINE_STATE_ORDER) {
      expect(isLegalTransition("done", target)).toBe(false);
      expect(isLegalTransition("cancelled", target)).toBe(false);
      expect(isLegalTransition("failed", target)).toBe(false);
    }
  });
});

describe("state-machine: helpers", () => {
  it("nextMainPathState walks the main path", () => {
    expect(nextMainPathState("init")).toBe("preprocess");
    expect(nextMainPathState("preprocess")).toBe("parallel-fan-out");
    expect(nextMainPathState("parallel-fan-out")).toBe("fan-in");
    expect(nextMainPathState("fan-in")).toBe("fusion");
    expect(nextMainPathState("fusion")).toBe("done");
    expect(nextMainPathState("done")).toBeNull();
  });

  it("IllegalTransitionError carries from/to fields", () => {
    const e = new IllegalTransitionError("init", "done");
    expect(e.name).toBe("IllegalTransitionError");
    expect(e.from).toBe("init");
    expect(e.to).toBe("done");
    expect(e.message).toMatch(/init/);
    expect(e.message).toMatch(/done/);
  });
});

describe("PipelineOrchestrator — state machine integration", () => {
  it("after init(), currentState is 'init' (never undefined)", async () => {
    const orch = new PipelineOrchestrator(new EventEmitterMessageBus());
    await orch.init(makeSlots());
    const s: PipelineState = orch.currentState;
    expect(s).toBe("init");
  });

  it("run() walks the main path to 'done' and emits 10 enter/leave events", async () => {
    const bus = new EventEmitterMessageBus();
    const orch = new PipelineOrchestrator(bus);
    await orch.init(makeSlots());

    const eventTypes: string[] = [];
    // Subscribe to each specific event type the orchestrator publishes.
    // The bus dispatches by exact channel key, so we register one
    // subscriber per known pipeline.<state>.enter / pipeline.<state>.leave
    // channel.
    const unsubFns: Array<() => void> = [];
    const allStates: Array<"init" | "preprocess" | "parallel-fan-out" | "fan-in" | "fusion"> = [
      "init",
      "preprocess",
      "parallel-fan-out",
      "fan-in",
      "fusion",
    ];
    for (const st of allStates) {
      for (const phase of ["enter", "leave"] as const) {
        unsubFns.push(
          bus.subscribe<unknown>(`pipeline.${st}.${phase}`, (msg) => {
            eventTypes.push(msg.type);
          }),
        );
      }
    }

    const result = await orch.run({ image_id: "img-orch-1" });
    for (const f of unsubFns) f();

    expect(orch.currentState).toBe("done");
    expect(result.terminalState).toBe("done");
    // 5 non-terminal states emit one enter and one leave = 10 events.
    const enterLeave = eventTypes.filter(
      (t) => /pipeline\..*\.(enter|leave)$/.test(t),
    );
    expect(enterLeave.length).toBe(10);
  });
});
