/**
 * Sprint 4 — In-memory registry mapping `SpecializedTarget -> Agent`.
 *
 * The registry is a pure slot map: no I/O, no persistence, no
 * background work. Duplicate `register` calls throw (a duplicate is a
 * programmer error and must surface early — silent overwrite would
 * mask the bug in the orchestrator's `init(slots)` call).
 *
 * The registry preserves insertion order on `targets()` so callers
 * (e.g. the orchestrator's fan-out) can iterate in the documented
 * deterministic order.
 */

import type { Agent } from "../agents/types.js";
import type { SpecializedTarget } from "./specialized-types.js";

/**
 * Slot-map registry for the four Sprint 4 specialized sub-agents.
 *
 * Construction is the empty registry; populate it via `register()`.
 * `targets()` returns the registered targets in insertion order so
 * the orchestrator's fan-out order is deterministic.
 */
export class SpecializedAgentRegistry {
  private readonly slots: Map<SpecializedTarget, Agent> = new Map();
  /** Insertion-order tracking — `Map` preserves insertion order in JS. */
  private readonly order: SpecializedTarget[] = [];

  /**
   * Register an agent for the given target.
   *
   * @throws Error if the target is already registered.
   */
  register(target: SpecializedTarget, agent: Agent): void {
    if (this.slots.has(target)) {
      throw new Error(
        `SpecializedAgentRegistry: target "${target}" already registered`,
      );
    }
    this.slots.set(target, agent);
    this.order.push(target);
  }

  /**
   * Resolve a target to its agent, or `undefined` if no agent is
   * registered for that target.
   */
  get(target: SpecializedTarget): Agent | undefined {
    return this.slots.get(target);
  }

  /**
   * Return the registered targets in insertion order. The returned
   * array is a fresh copy; mutating it does not affect the registry.
   */
  targets(): ReadonlyArray<SpecializedTarget> {
    return [...this.order];
  }

  /** Number of registered agents. */
  size(): number {
    return this.order.length;
  }
}
