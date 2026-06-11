/**
 * Sprint 2 — Pipeline state machine definitions.
 *
 * The pipeline runs a single image through a fixed sequence of stages:
 *
 *   init -> preprocess -> parallel-fan-out -> fan-in -> fusion -> done
 *
 * with two terminal branches: `cancelled` and `failed`. Every transition
 * is declared in the adjacency table; the orchestrator's `currentState`
 * is always one of the `PipelineState` values and is never `undefined`
 * after `init()`.
 *
 * The state machine is encoded as a TypeScript string-literal union
 * (not an `enum`) so the values serialize cleanly to JSON for the
 * `pipeline.checkpoint` payload on the bus.
 */

/** The legal states a pipeline run can be in. */
export type PipelineState =
  | "init"
  | "preprocess"
  | "parallel-fan-out"
  | "fan-in"
  | "fusion"
  | "done"
  | "cancelled"
  | "failed";

/** States from which the main-path `done` is reachable. */
export const TERMINAL_STATES: ReadonlySet<PipelineState> = new Set<PipelineState>([
  "done",
  "cancelled",
  "failed",
]);

/** Ordered list of the main-path (non-terminal, non-cancel) states. */
export const PIPELINE_STATE_ORDER: ReadonlyArray<PipelineState> = [
  "init",
  "preprocess",
  "parallel-fan-out",
  "fan-in",
  "fusion",
  "done",
];

/**
 * Adjacency table — the only source of truth for legal transitions.
 * Terminal states (done, cancelled, failed) are sinks: no outgoing edges.
 * The orchestrator MUST consult this table before transitioning; an
 * illegal transition throws `IllegalTransitionError` (see below).
 */
export const PIPELINE_TRANSITIONS: Readonly<
  Record<PipelineState, ReadonlyArray<PipelineState>>
> = Object.freeze({
  init: ["preprocess", "cancelled", "failed"],
  preprocess: ["parallel-fan-out", "cancelled", "failed"],
  "parallel-fan-out": ["fan-in", "cancelled", "failed"],
  "fan-in": ["fusion", "cancelled", "failed"],
  fusion: ["done", "cancelled", "failed"],
  done: [],
  cancelled: [],
  failed: [],
});

/**
 * Subscriber callback for state transitions. The orchestrator publishes
 * `enterState` on `<state>.enter` and `leaveState` on `<state>.leave`.
 */
export type EnterStateHook = (state: PipelineState) => void | Promise<void>;
export type LeaveStateHook = (state: PipelineState) => void | Promise<void>;

/**
 * Pair of hooks called on entering and leaving a state.
 * `enter` runs before the state's work; `leave` runs after.
 */
export interface StateHooks {
  enter?: EnterStateHook;
  leave?: LeaveStateHook;
}

/**
 * Thrown when the orchestrator attempts a transition that is not
 * declared in `PIPELINE_TRANSITIONS`. The orchestrator catches and
 * turns this into a `failed` transition; subscribers see
 * `pipeline.failed` on the bus.
 */
export class IllegalTransitionError extends Error {
  readonly from: PipelineState;
  readonly to: PipelineState;
  constructor(from: PipelineState, to: PipelineState) {
    super(`Illegal pipeline transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Pure helper: returns true if `from -> to` is a legal transition per
 * the adjacency table. Terminal states have no outgoing edges.
 */
export function isLegalTransition(from: PipelineState, to: PipelineState): boolean {
  const outgoing = PIPELINE_TRANSITIONS[from];
  return outgoing.includes(to);
}

/**
 * Pure helper: returns the next state in the main path, or `null` if
 * `current` is a terminal state. Used by `resume()` to skip already-
 * completed stages.
 */
export function nextMainPathState(current: PipelineState): PipelineState | null {
  const idx = PIPELINE_STATE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PIPELINE_STATE_ORDER.length - 1) {
    return null;
  }
  return PIPELINE_STATE_ORDER[idx + 1] ?? null;
}
