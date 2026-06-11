/**
 * Unit tests for src/fusion/risk-fusion-agent.ts.
 *
 * Covers:
 *   - All-0.0 input → score 0.0, action "PASS".
 *   - All-0.5 input → score 0.5, action "REVIEW".
 *   - All-1.0 input → score 1.0, action "REJECT".
 *   - configureFusion with a custom weight changes the weighted sum.
 *   - Missing per-layer scores default to 0.0.
 *   - Out-of-range scores are clamped to [0, 1].
 *   - The `details.per_layer` and `details.weights` payloads are present.
 */
import { describe, it, expect } from "vitest";

import type { AgentInput, FusionWeights } from "../agents/types.js";
import {
  FUSION_THRESHOLDS,
  FUSION_WEIGHTS,
  RiskFusionAgent,
  buildDefaultRiskFusionAgent,
  clamp01,
  configureFusion,
  scoreToAction,
} from "./index.js";

function makeInput(perLayer: Partial<FusionWeights>): AgentInput {
  return {
    image_id: "img-fus-1",
    context: { per_layer: perLayer },
  };
}

function makeInputAll(value: number): AgentInput {
  return {
    image_id: "img-fus-all",
    context: {
      per_layer: {
        text_risk: value,
        vision: value,
        metadata: value,
        porn: value,
        ad: value,
        political: value,
        logo: value,
      },
    },
  };
}

describe("RiskFusionAgent — action branches (default config)", () => {
  it("all-0.0 input → score 0.0, action PASS", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(0));
    expect(out.score).toBe(0);
    expect(out.reason).toBe("fusion-decision");
    const details = out.details as { action: string };
    expect(details.action).toBe("PASS");
  });

  it("all-0.5 input → score 0.5, action REVIEW (0.40 <= 0.5 < 0.85)", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(0.5));
    expect(out.score).toBeCloseTo(0.5, 10);
    const details = out.details as { action: string };
    expect(details.action).toBe("REVIEW");
  });

  it("all-1.0 input → score 1.0, action REJECT (>= 0.85)", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(1.0));
    expect(out.score).toBe(1.0);
    const details = out.details as { action: string };
    expect(details.action).toBe("REJECT");
  });
});

describe("RiskFusionAgent — weights are tunable", () => {
  it("default config: text_risk=1.0 only → score=0.10, action PASS", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(
      makeInput({ text_risk: 1.0 }),
    );
    expect(out.score).toBeCloseTo(0.10, 10);
    const details = out.details as { action: string };
    expect(details.action).toBe("PASS");
  });

  it("custom config: text_risk weight = 1.0 → score=1.0, action REJECT", async () => {
    const cfg = configureFusion({
      weights: {
        text_risk: 1.0,
        vision: 0,
        metadata: 0,
        porn: 0,
        ad: 0,
        political: 0,
        logo: 0,
      },
    });
    const agent = new RiskFusionAgent(cfg);
    await agent.init({});
    const out = await agent.run(
      makeInput({ text_risk: 1.0 }),
    );
    expect(out.score).toBe(1.0);
    const details = out.details as { action: string };
    expect(details.action).toBe("REJECT");
  });

  it("configureFusion does not mutate the default FUSION_CONFIG", () => {
    const before = { ...FUSION_WEIGHTS };
    configureFusion({ weights: { text_risk: 0.99 } });
    expect(FUSION_WEIGHTS.text_risk).toBe(before.text_risk);
  });
});

describe("RiskFusionAgent — defaults and clamping", () => {
  it("missing per-layer scores default to 0.0", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-empty" });
    expect(out.score).toBe(0);
    const details = out.details as { action: string };
    expect(details.action).toBe("PASS");
  });

  it("out-of-range scores are clamped to [0, 1] before weighting", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(5.0));
    expect(out.score).toBe(1.0);
    const out2 = await agent.run(makeInputAll(-1.0));
    expect(out2.score).toBe(0);
  });

  it("details carries per_layer and weights payloads", async () => {
    const agent = new RiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(0.5));
    const details = out.details as {
      action: string;
      per_layer: Record<string, number>;
      weights: Record<string, number>;
    };
    expect(details.per_layer.text_risk).toBe(0.5);
    expect(details.per_layer.vision).toBe(0.5);
    expect(details.per_layer.metadata).toBe(0.5);
    expect(details.per_layer.porn).toBe(0.5);
    expect(details.per_layer.ad).toBe(0.5);
    expect(details.per_layer.political).toBe(0.5);
    expect(details.per_layer.logo).toBe(0.5);
    expect(details.weights.text_risk).toBe(0.10);
    expect(details.weights.vision).toBe(0.20);
    expect(details.weights.metadata).toBe(0.10);
    expect(details.weights.porn).toBe(0.20);
    expect(details.weights.ad).toBe(0.15);
    expect(details.weights.political).toBe(0.15);
    expect(details.weights.logo).toBe(0.10);
  });
});

describe("RiskFusionAgent — pure helpers", () => {
  it("clamp01 clamps negative / over-1 / NaN to [0,1] (NaN→0)", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
  });

  it("scoreToAction respects the threshold bands", () => {
    expect(scoreToAction(0.0)).toBe("PASS");
    expect(scoreToAction(0.39)).toBe("PASS");
    expect(scoreToAction(0.40)).toBe("REVIEW");
    expect(scoreToAction(0.5)).toBe("REVIEW");
    expect(scoreToAction(0.8499)).toBe("REVIEW");
    expect(scoreToAction(0.85)).toBe("REJECT");
    expect(scoreToAction(1.0)).toBe("REJECT");
    const custom = { ...FUSION_THRESHOLDS, rejectAt: 0.9, reviewAt: 0.5 };
    expect(scoreToAction(0.6, custom)).toBe("REVIEW");
    expect(scoreToAction(0.95, custom)).toBe("REJECT");
  });

  it("buildDefaultRiskFusionAgent returns a working agent", async () => {
    const agent = buildDefaultRiskFusionAgent();
    await agent.init({});
    const out = await agent.run(makeInputAll(1.0));
    expect(out.score).toBe(1.0);
    const details = out.details as { action: string };
    expect(details.action).toBe("REJECT");
  });
});

describe("RiskFusionAgent — refuses to run before init()", () => {
  it("throws when called without init()", async () => {
    const agent = new RiskFusionAgent();
    await expect(agent.run(makeInputAll(0.5))).rejects.toThrow(/not initialized/);
  });
});
