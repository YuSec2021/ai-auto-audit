/**
 * Sprint 2 — Orchestrator module barrel.
 *
 * Re-exports the state-machine types and the PipelineOrchestrator class
 * for ergonomic import:
 *
 *   import { PipelineOrchestrator, PIPELINE_STATE_ORDER, isLegalTransition } from "@/orchestrator";
 */

export {
  IllegalTransitionError,
  PIPELINE_STATE_ORDER,
  PIPELINE_TRANSITIONS,
  TERMINAL_STATES,
  isLegalTransition,
  nextMainPathState,
  type EnterStateHook,
  type LeaveStateHook,
  type PipelineState,
  type StateHooks,
} from "./state-machine.js";

export {
  PipelineOrchestrator,
  type OrchestratorInput,
  type OrchestratorResult,
  type OrchestratorSlots,
  type PipelineEvent,
} from "./orchestrator.js";
