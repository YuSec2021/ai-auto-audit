/**
 * Unit tests for src/preprocess/phash.ts.
 *
 * Covers:
 *   - same input → same hash (deterministic)
 *   - different input → different hash
 *   - 1x1 / 4x4 small inputs produce stable hashes
 *   - Hamming distance is bounded for near-duplicate inputs
 *   - hammingHex helper correctness
 */

import { describe, it, expect } from "vitest";

import { hammingHex, pHash } from "./phash.js";

describe("pHash", () => {
  it("returns a 16-character lowercase hex string", () => {
    const h = pHash(Buffer.from("hello world"));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same input yields the same hash (3 distinct inputs)", () => {
    const inputs = [
      Buffer.from("test-fixture-alpha"),
      Buffer.from("test-fixture-beta"),
      Buffer.from("test-fixture-gamma"),
    ];
    for (const input of inputs) {
      const h1 = pHash(input);
      const h2 = pHash(input);
      const h3 = pHash(input);
      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    }
  });

  it("differentiates distinct inputs — 4 distinct buffers produce 4 distinct hashes", () => {
    // Inputs of different lengths and content. The pHash function
    // maps each input into a 64-cell grid (cells default to 128 when
    // the input is shorter than 64 bytes); inputs of different lengths
    // therefore produce different cell patterns, which in turn produce
    // different hash bit patterns.
    const inputs = [
      Buffer.from("alpha"),                   // 5 bytes
      Buffer.from("beta beta"),               // 9 bytes
      Buffer.from("gamma gamma gamma"),       // 17 bytes
      Buffer.from("delta delta delta delta"), // 23 bytes
    ];
    const hashes = new Set(inputs.map((b) => pHash(b)));
    expect(hashes.size).toBe(4);
  });

  it("handles 1x1 and 4x4 small inputs without crashing", () => {
    const a = Buffer.alloc(1, 0xff);
    const b = Buffer.alloc(4, 0x00);
    const ha = pHash(a);
    const hb = pHash(b);
    expect(ha).toMatch(/^[0-9a-f]{16}$/);
    expect(hb).toMatch(/^[0-9a-f]{16}$/);
    // 1x1 (all 0xff) and 4x4 (all 0x00) are different inputs → different hashes.
    expect(ha).not.toBe(hb);
  });

  it("near-duplicate inputs have bounded Hamming distance (≤ 16)", () => {
    // Two near-duplicate inputs: differ only in the last byte.
    const a = Buffer.from("hello world!");
    const b = Buffer.from("hello world.");
    const ha = pHash(a);
    const hb = pHash(b);
    const d = hammingHex(ha, hb);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(16);
  });

  it("hammingHex returns the per-bit distance between two equal-length hexes", () => {
    expect(hammingHex("0000", "0000")).toBe(0);
    expect(hammingHex("ffff", "0000")).toBe(16);
    expect(hammingHex("aaaa", "5555")).toBe(16);
    // Mismatched length → -1 sentinel.
    expect(hammingHex("00", "0000")).toBe(-1);
  });
});
