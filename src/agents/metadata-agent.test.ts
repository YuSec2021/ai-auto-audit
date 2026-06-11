/**
 * Unit tests for src/agents/metadata-agent.ts
 *
 * Covers:
 *   - The stub returns the documented three-flag output
 *     (has_exif=false, has_gps=false, ai_gen_suspected=false).
 *   - The input contract is enforced at the type level: a value typed
 *     as `MetadataInput` requires `image_bytes: Buffer`.
 *   - The buffer length is preserved on the input contract (the
 *     orchestrator passes through whatever bytes it received).
 */
import { describe, it, expect } from "vitest";

import { MetadataAgent, type MetadataInput } from "./metadata-agent.js";

describe("MetadataAgent", () => {
  it("returns the documented three-flag stub output (all false)", async () => {
    const agent = new MetadataAgent();
    await agent.init({});
    const bytes = Buffer.alloc(16, 0xaa);
    const input: MetadataInput = {
      image_id: "img-meta-1",
      image_bytes: bytes,
    };
    const out = await agent.run(input);
    expect(out.image_id).toBe("img-meta-1");
    expect(out.score).toBe(0.5);
    expect(out.reason).toBe("stub-metadata");
    const details = out.details as {
      has_exif: boolean;
      has_gps: boolean;
      ai_gen_suspected: boolean;
    };
    expect(details.has_exif).toBe(false);
    expect(details.has_gps).toBe(false);
    expect(details.ai_gen_suspected).toBe(false);
    // All three fields must be booleans (the type contract).
    expect(typeof details.has_exif).toBe("boolean");
    expect(typeof details.has_gps).toBe("boolean");
    expect(typeof details.ai_gen_suspected).toBe("boolean");
  });

  it("preserves the input buffer length on the input contract", async () => {
    const agent = new MetadataAgent();
    await agent.init({});
    const bytes = Buffer.alloc(2048);
    const input: MetadataInput = {
      image_id: "img-meta-2",
      image_bytes: bytes,
    };
    expect(input.image_bytes.length).toBe(2048);
    const out = await agent.run(input);
    expect(out.image_id).toBe("img-meta-2");
  });

  it("id/version/healthcheck surface matches the Agent contract", async () => {
    const agent = new MetadataAgent();
    expect(agent.id).toBeTypeOf("string");
    expect(agent.version).toBeTypeOf("string");
    const h = await agent.healthcheck();
    expect(h.ok).toBe(true);
  });
});
