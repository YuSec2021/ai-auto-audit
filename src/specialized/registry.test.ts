/**
 * Unit tests for src/specialized/registry.ts.
 *
 * Covers:
 *   - register() then get() resolves the same agent instance.
 *   - targets() returns the registered targets in insertion order.
 *   - register() a duplicate target throws.
 *   - get() on an unregistered target returns undefined.
 */
import { describe, it, expect } from "vitest";

import type { Agent, AgentContext, AgentInput, AgentOutput, HealthStatus } from "../agents/types.js";
import {
  AdAgent,
  LogoAgent,
  PoliticalAgent,
  PornAgent,
  SpecializedAgentRegistry,
} from "./index.js";

/**
 * Minimal agent fixture for the registry tests — we need an Agent
 * instance to register, but we don't need real classifier logic.
 */
class DummyAgent implements Agent {
  readonly id: string;
  readonly version = "0.0.0";
  constructor(id: string) {
    this.id = id;
  }
  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
  }
  async run(input: AgentInput): Promise<AgentOutput> {
    return { image_id: input.image_id, score: 0, reason: "dummy" };
  }
  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 0 };
  }
}

describe("SpecializedAgentRegistry", () => {
  it("register then get resolves the same agent instance", () => {
    const reg = new SpecializedAgentRegistry();
    const agent = new DummyAgent("a");
    reg.register("porn", agent);
    expect(reg.get("porn")).toBe(agent);
  });

  it("targets() returns the insertion-order list of registered targets", () => {
    const reg = new SpecializedAgentRegistry();
    reg.register("porn", new PornAgent());
    reg.register("ad", new AdAgent());
    reg.register("political", new PoliticalAgent());
    reg.register("logo", new LogoAgent());
    expect(reg.size()).toBe(4);
    expect(reg.targets()).toEqual(["porn", "ad", "political", "logo"]);
  });

  it("register a duplicate target throws (no silent overwrite)", () => {
    const reg = new SpecializedAgentRegistry();
    reg.register("porn", new PornAgent());
    expect(() => reg.register("porn", new DummyAgent("dup"))).toThrow(
      /already registered/,
    );
  });

  it("get on an unregistered target returns undefined", () => {
    const reg = new SpecializedAgentRegistry();
    expect(reg.get("porn")).toBeUndefined();
    reg.register("ad", new AdAgent());
    expect(reg.get("porn")).toBeUndefined();
    expect(reg.get("ad")).toBeDefined();
  });

  it("mutating the returned targets() array does not affect the registry", () => {
    const reg = new SpecializedAgentRegistry();
    reg.register("porn", new PornAgent());
    reg.register("ad", new AdAgent());
    const targets = reg.targets() as SpecializedTarget[];
    targets.push("logo");
    expect(reg.size()).toBe(2);
    expect(reg.targets()).toEqual(["porn", "ad"]);
  });
});

// Re-export the type for the test above (avoids an unused-import lint
// error in tools that statically analyze this file in isolation).
type SpecializedTarget = "porn" | "ad" | "political" | "logo";
