/**
 * Unit tests for src/agents/vision-agent.ts
 *
 * Covers:
 *   - The stub returns the documented multi-axis output (4 axes at 0.5).
 *   - `exif_keys` is derived from the input `exif_summary` keys, and
 *     is an empty array when the field is absent.
 *   - The input contract is enforced at the type level: a value typed
 *     as `VisionInput` requires `image_id` and accepts optional
 *     `ocr_text` and `exif_summary`.
 */
import { describe, it, expect } from "vitest";

import { VisionAgent, type VisionInput } from "./vision-agent.js";

describe("VisionAgent", () => {
  it("returns the documented four-axis stub output", async () => {
    const agent = new VisionAgent();
    await agent.init({});
    const input: VisionInput = {
      image_id: "img-vis-1",
      image: Buffer.alloc(0),
      ocr_text: "some text",
      exif_summary: { Make: "Canon" },
    };
    const out = await agent.run(input);
    expect(out.image_id).toBe("img-vis-1");
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-vision");
    const details = out.details as {
      porn_score: number;
      violence_score: number;
      ad_score: number;
      political_score: number;
      exif_keys: ReadonlyArray<string>;
    };
    expect(details.porn_score).toBe(0.5);
    expect(details.violence_score).toBe(0.5);
    expect(details.ad_score).toBe(0.5);
    expect(details.political_score).toBe(0.5);
  });

  it("exif_keys is an empty array when exif_summary is absent", async () => {
    const agent = new VisionAgent();
    await agent.init({});
    const out = await agent.run({ image_id: "img-vis-2" });
    const details = out.details as { exif_keys: ReadonlyArray<string> };
    expect(details.exif_keys).toEqual([]);
  });

  it("exif_keys mirrors the input exif_summary keys", async () => {
    const agent = new VisionAgent();
    await agent.init({});
    const out = await agent.run({
      image_id: "img-vis-3",
      exif_summary: { Make: "Canon", Model: "EOS R5" },
    });
    const details = out.details as { exif_keys: ReadonlyArray<string> };
    expect([...details.exif_keys].sort()).toEqual(["Make", "Model"]);
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new VisionAgent();
    expect(agent.id).toBeTypeOf("string");
    expect(agent.version).toBeTypeOf("string");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
  });
});
