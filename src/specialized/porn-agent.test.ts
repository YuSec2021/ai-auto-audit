/**
 * Unit tests for src/specialized/porn-agent.ts.
 *
 * Covers the documented stub contract:
 *   - `run()` returns score 0.5, reason "stub-porn",
 *     details.target === "porn".
 *   - `healthcheck()` returns `{ ok: true, latencyMs: 1 }`.
 *   - `id` and `version` are stable strings matching the contract.
 *   - The agent refuses to run before `init()`.
 */
import { describe, it, expect } from "vitest";

import { PornAgent, STUB_SCORE } from "./index.js";

describe("PornAgent", () => {
  it("returns the documented stub output (score 0.5, reason stub-porn, target porn)", async () => {
    const agent = new PornAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-pn-1", target: "porn" });
    expect(out.image_id).toBe("img-pn-1");
    expect(out.score).toBe(STUB_SCORE);
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-porn");
    const details = out.details as { target: string; score: number };
    expect(details.target).toBe("porn");
    expect(details.score).toBe(0.5);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new PornAgent();
    expect(agent.id).toBe("porn-stub-004");
    expect(agent.version).toBe("0.4.0");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.latencyMs).toBe(1);
  });

  it("refuses to run before init()", async () => {
    const agent = new PornAgent();
    await expect(
      agent.run({ image_id: "img-pn-2", target: "porn" }),
    ).rejects.toThrow(/not initialized/);
  });
});
