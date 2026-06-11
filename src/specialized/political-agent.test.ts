/**
 * Unit tests for src/specialized/political-agent.ts.
 *
 * Same contract as PornAgent but with the `political` target.
 */
import { describe, it, expect } from "vitest";

import { PoliticalAgent, STUB_SCORE } from "./index.js";

describe("PoliticalAgent", () => {
  it("returns the documented stub output (score 0.5, reason stub-political, target political)", async () => {
    const agent = new PoliticalAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-pol-1", target: "political" });
    expect(out.image_id).toBe("img-pol-1");
    expect(out.score).toBe(STUB_SCORE);
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-political");
    const details = out.details as { target: string; score: number };
    expect(details.target).toBe("political");
    expect(details.score).toBe(0.5);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new PoliticalAgent();
    expect(agent.id).toBe("political-stub-004");
    expect(agent.version).toBe("0.4.0");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.latencyMs).toBe(1);
  });

  it("refuses to run before init()", async () => {
    const agent = new PoliticalAgent();
    await expect(
      agent.run({ image_id: "img-pol-2", target: "political" }),
    ).rejects.toThrow(/not initialized/);
  });
});
