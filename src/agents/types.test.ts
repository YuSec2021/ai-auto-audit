/**
 * Unit tests for src/agents/types.ts
 * The type system is structural, so these tests exercise the public
 * surface: a StubAgent implementing the Agent interface, and a
 * typed message round-trip via the AgentMessage envelope.
 */
import { describe, it, expect } from "vitest";

import type {
  Agent,
  AgentContext,
  AgentInput,
  AgentMessage,
  AgentOutput,
  HealthStatus,
} from "./types.js";

class StubAgent implements Agent {
  readonly id: string = "stub-preprocess-001";
  readonly version: string = "0.1.0";
  private initCount = 0;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initCount++;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    return { image_id: input.image_id, score: 0.5, reason: "stub" };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }

  getInitCount(): number {
    return this.initCount;
  }
}

describe("types.ts — Agent interface", () => {
  it("can be implemented end-to-end by a stub", async () => {
    const agent = new StubAgent();
    expect(agent.id).toBe("stub-preprocess-001");
    expect(agent.version).toBe("0.1.0");
    await agent.init({});
    expect(agent.getInitCount()).toBe(1);
    const out = await agent.run({ image_id: "img-1" });
    expect(out.image_id).toBe("img-1");
    expect(out.score).toBe(0.5);
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
    if (h.ok) {
      expect(typeof h.latencyMs).toBe("number");
    }
  });

  it("supports degraded health status shape", async () => {
    const degraded: HealthStatus = { ok: false, error: "down" };
    expect(degraded.ok).toBe(false);
    if (!degraded.ok) {
      expect(degraded.error).toBe("down");
    }
  });

  it("AgentMessage envelope accepts a generic payload", () => {
    const msg: AgentMessage<{ value: number }> = {
      type: "test",
      payload: { value: 42 },
      publishedAt: new Date().toISOString(),
    };
    expect(msg.type).toBe("test");
    expect(msg.payload.value).toBe(42);
  });
});
