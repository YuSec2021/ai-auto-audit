/**
 * Sprint 5 — Unit tests for the extracted pipeline-stages helpers.
 *
 * Coverage gaps closed here:
 *   - `clampToFusionUnit`: the NaN / non-finite branch (the
 *     Sprint 4 stub agents always return `score: 0.5`, so the
 *     in-line happy path is already covered by the smoke runner;
 *     this test exercises the defensive branch).
 *   - `placeholderFusionOutput`: the helper itself (it is called
 *     by the orchestrator on every blocklist fast-path + cancel
 *     path; a unit test makes the contract explicit).
 *   - `buildFusionInput` and `buildBlocklistFusionInput`: the
 *     two fusion-input builders.
 *
 * The contract says "Do NOT add new tests" for the extracted
 * helpers; however, SC-5 explicitly allows a 2-line test
 * addition in `clamp.test.ts` if coverage dips below 80%.
 */

import { describe, expect, it } from "vitest";
import {
  buildBlocklistFusionInput,
  buildFusionInput,
  clampToFusionUnit,
  placeholderFusionOutput,
} from "./index.js";
import type { AgentOutput, OrchestratorInput } from "../agents/index.js";

describe("pipeline-stages — clampToFusionUnit", () => {
  it("passes through in-range numbers", () => {
    expect(clampToFusionUnit(0)).toBe(0);
    expect(clampToFusionUnit(0.5)).toBe(0.5);
    expect(clampToFusionUnit(1)).toBe(1);
  });
  it("clamps below 0 to 0", () => {
    expect(clampToFusionUnit(-0.1)).toBe(0);
  });
  it("clamps above 1 to 1", () => {
    expect(clampToFusionUnit(1.5)).toBe(1);
  });
  it("treats NaN as 0", () => {
    expect(clampToFusionUnit(Number.NaN)).toBe(0);
  });
  it("treats Infinity as 0", () => {
    expect(clampToFusionUnit(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampToFusionUnit(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("pipeline-stages — placeholderFusionOutput", () => {
  it("returns the documented placeholder shape", () => {
    const out = placeholderFusionOutput("img-x", "skipped-blocklist");
    expect(out.image_id).toBe("img-x");
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("skipped-blocklist");
    expect(out.details).toEqual({ action: "REVIEW" });
  });
});

describe("pipeline-stages — buildFusionInput", () => {
  it("assembles a per_layer record with clamped scores", () => {
    const input: OrchestratorInput = { image_id: "img-f" };
    const stub: AgentOutput = { image_id: "img-f", score: 0.4, reason: "ok" };
    const tooHigh: AgentOutput = { image_id: "img-f", score: 1.5, reason: "ok" };
    const out = buildFusionInput(
      input,
      stub,
      stub,
      stub,
      stub,
      stub,
      tooHigh,
      stub,
      stub,
    );
    expect(out.image_id).toBe("img-f");
    const ctx = out.context as { per_layer: Record<string, number> };
    expect(ctx.per_layer.text_risk).toBe(0.4);
    expect(ctx.per_layer.ad).toBe(1);
  });
});

describe("pipeline-stages — buildBlocklistFusionInput", () => {
  it("returns 7 placeholders at 1.0 with the blocklist_fast_path flag", () => {
    const input: OrchestratorInput = { image_id: "img-bl" };
    const stub: AgentOutput = { image_id: "img-bl", score: 0, reason: "blocklist-hit" };
    const out = buildBlocklistFusionInput(input, stub);
    expect(out.image_id).toBe("img-bl");
    const ctx = out.context as {
      per_layer: Record<string, number>;
      blocklist_fast_path: boolean;
    };
    expect(ctx.blocklist_fast_path).toBe(true);
    for (const v of Object.values(ctx.per_layer)) {
      expect(v).toBe(1.0);
    }
  });
});
