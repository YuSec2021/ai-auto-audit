/**
 * Unit tests for src/preprocess/blocklist.ts.
 *
 * Covers:
 *   - MD5 hit returns true
 *   - pHash hit returns true
 *   - no-hit returns false
 *   - `loadFromFile` populates from the seed JSON
 *   - case-insensitive matching
 *   - count of registered entries is correct
 */

import { describe, it, expect } from "vitest";
import { resolve as resolvePath } from "node:path";

import { BlocklistRegistry } from "./blocklist.js";

const SEED_PATH = resolvePath(
  new URL(".", import.meta.url).pathname,
  "blocklist-seeds.json",
);

describe("BlocklistRegistry", () => {
  it("MD5 hit returns true with hit_kind=md5", () => {
    const reg = new BlocklistRegistry();
    reg.registerMd5("29b137702ea42a389ca9a29e540fc784");
    const out = reg.check("29b137702ea42a389ca9a29e540fc784", "deadbeefdeadbeef");
    expect(out).toEqual({
      hash: "29b137702ea42a389ca9a29e540fc784",
      hit_kind: "md5",
    });
    expect(reg.isBlocked("29b137702ea42a389ca9a29e540fc784", "deadbeefdeadbeef")).toBe(true);
  });

  it("pHash hit returns true with hit_kind=phash (MD5 does not match)", () => {
    const reg = new BlocklistRegistry();
    reg.registerPHashSeed("96e64e58b36fb6c6");
    const out = reg.check("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "96e64e58b36fb6c6");
    expect(out).toEqual({
      hash: "96e64e58b36fb6c6",
      hit_kind: "phash",
    });
  });

  it("no-hit returns null and isBlocked returns false", () => {
    const reg = new BlocklistRegistry();
    reg.registerMd5("11111111111111111111111111111111");
    reg.registerPHashSeed("2222222222222222");
    expect(reg.check("99999999999999999999999999999999", "8888888888888888")).toBeNull();
    expect(reg.isBlocked("99999999999999999999999999999999", "8888888888888888")).toBe(false);
  });

  it("loadFromFile populates from the seed JSON (>=5 MD5 + >=5 pHash)", () => {
    const reg = BlocklistRegistry.loadFromFile(SEED_PATH);
    expect(reg.md5Count).toBeGreaterThanOrEqual(5);
    expect(reg.phashCount).toBeGreaterThanOrEqual(5);
    // Spot-check: a known fixture hash is in the registry.
    expect(
      reg.isBlocked("29b137702ea42a389ca9a29e540fc784", "ffffffffffffffff"),
    ).toBe(true);
  });

  it("case-insensitive matching", () => {
    const reg = new BlocklistRegistry();
    reg.registerMd5("ABCDEF0123456789ABCDEF0123456789");
    expect(reg.isBlocked("abcdef0123456789abcdef0123456789", "00")).toBe(true);
  });
});
