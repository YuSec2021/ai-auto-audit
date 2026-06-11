/**
 * Unit tests for src/agents/text-risk-agent.ts
 *
 * Covers:
 *   - The stub returns the documented output shape (score 0.5, reason
 *     "stub-text-risk", details.matched_words is an empty array).
 *   - The input contract is enforced at the type level: a call
 *     without `ocr_text` or `bboxes` is a compile error. We exercise
 *     this by constructing a value typed as `TextRiskInput` and
 *     asserting both fields are present.
 */
import { describe, it, expect } from "vitest";

import { TextRiskAgent, type TextRiskInput } from "./text-risk-agent.js";

describe("TextRiskAgent", () => {
  it("returns the documented stub output shape (score 0.5, reason stub-text-risk, empty matched_words)", async () => {
    const agent = new TextRiskAgent();
    await agent.init({});
    const input: TextRiskInput = {
      image_id: "img-tr-1",
      ocr_text: "微❤联系",
      bboxes: [],
    };
    const out = await agent.run(input);
    expect(out.image_id).toBe("img-tr-1");
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-text-risk");
    expect(out.details).toBeDefined();
    const details = out.details as { matched_words: ReadonlyArray<unknown> };
    expect(Array.isArray(details.matched_words)).toBe(true);
    expect(details.matched_words.length).toBe(0);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new TextRiskAgent();
    expect(agent.id).toBeTypeOf("string");
    expect(agent.id.length).toBeGreaterThan(0);
    expect(agent.version).toBeTypeOf("string");
    expect(agent.version.length).toBeGreaterThan(0);
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
  });

  it("refuses to run before init()", async () => {
    const agent = new TextRiskAgent();
    await expect(
      agent.run({
        image_id: "img-tr-2",
        ocr_text: "",
        bboxes: [],
      }),
    ).rejects.toThrow(/not initialized/);
  });
});
