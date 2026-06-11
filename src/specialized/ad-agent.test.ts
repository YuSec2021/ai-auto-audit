/**
 * Unit tests for src/specialized/ad-agent.ts.
 *
 * Same contract as PornAgent but with the `ad` target discriminator.
 */
import { describe, it, expect } from "vitest";

import { AdAgent, STUB_SCORE } from "./index.js";

describe("AdAgent", () => {
  it("returns the documented stub output (score 0.5, reason stub-ad, target ad)", async () => {
    const agent = new AdAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-ad-1", target: "ad" });
    expect(out.image_id).toBe("img-ad-1");
    expect(out.score).toBe(STUB_SCORE);
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-ad");
    const details = out.details as { target: string; score: number };
    expect(details.target).toBe("ad");
    expect(details.score).toBe(0.5);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new AdAgent();
    expect(agent.id).toBe("ad-stub-004");
    expect(agent.version).toBe("0.4.0");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.latencyMs).toBe(1);
  });

  it("refuses to run before init()", async () => {
    const agent = new AdAgent();
    await expect(
      agent.run({ image_id: "img-ad-2", target: "ad" }),
    ).rejects.toThrow(/not initialized/);
  });
});
