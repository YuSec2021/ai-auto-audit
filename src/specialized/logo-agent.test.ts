/**
 * Unit tests for src/specialized/logo-agent.ts.
 *
 * Same contract as PornAgent but with the `logo` target.
 */
import { describe, it, expect } from "vitest";

import { LogoAgent, STUB_SCORE } from "./index.js";

describe("LogoAgent", () => {
  it("returns the documented stub output (score 0.5, reason stub-logo, target logo)", async () => {
    const agent = new LogoAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-lg-1", target: "logo" });
    expect(out.image_id).toBe("img-lg-1");
    expect(out.score).toBe(STUB_SCORE);
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-logo");
    const details = out.details as { target: string; score: number };
    expect(details.target).toBe("logo");
    expect(details.score).toBe(0.5);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new LogoAgent();
    expect(agent.id).toBe("logo-stub-004");
    expect(agent.version).toBe("0.4.0");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.latencyMs).toBe(1);
  });

  it("refuses to run before init()", async () => {
    const agent = new LogoAgent();
    await expect(
      agent.run({ image_id: "img-lg-2", target: "logo" }),
    ).rejects.toThrow(/not initialized/);
  });
});
