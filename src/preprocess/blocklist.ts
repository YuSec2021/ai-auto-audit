/**
 * Sprint 3 — In-memory blocklist registry for the Preprocess Agent.
 *
 * Holds known-bad MD5 hex strings and pHash 64-bit hex seeds. The
 * `isBlocked(md5, phash)` query is exact-match (no Hamming nearest-
 * neighbor in Sprint 3) and synchronous. The seed JSON is loaded at
 * module init via `loadFromFile()`; the file is the only I/O surface.
 *
 * Why a custom class (not a plain Set): we want pHash seeds to be
 * discoverable separately (the seed JSON keys are md5 + phash_seed)
 * and we want a future `reload()` method to be a one-line extension
 * without breaking the public surface.
 */

import { readFileSync } from "node:fs";

/** Single seed entry shape. */
export interface BlocklistEntry {
  hash: string;
  kind: "md5" | "phash";
}

/** The on-disk JSON shape (loaded at module init). */
export interface BlocklistSeedFile {
  md5: string[];
  phash_seed: string[];
}

export class BlocklistRegistry {
  private readonly md5Set: Set<string> = new Set();
  private readonly phashSet: Set<string> = new Set();

  constructor() {
    // no-op; use loadFromFile() to populate.
  }

  /** Register one MD5 hash (lowercase hex, 32 chars). */
  registerMd5(hex: string): void {
    this.md5Set.add(hex.toLowerCase());
  }

  /** Register one pHash 64-bit hex seed (16 chars). */
  registerPHashSeed(hex64: string): void {
    this.phashSet.add(hex64.toLowerCase());
  }

  /** Register many in one call. */
  registerMany(seeds: BlocklistSeedFile): void {
    for (const m of seeds.md5) this.registerMd5(m);
    for (const p of seeds.phash_seed) this.registerPHashSeed(p);
  }

  /**
   * Returns the matched hash + kind if either input matches, else null.
   * MD5 is checked first (cheaper, exact).
   */
  check(md5: string, phash: string): { hash: string; hit_kind: "md5" | "phash" } | null {
    const m = md5.toLowerCase();
    if (this.md5Set.has(m)) {
      return { hash: m, hit_kind: "md5" };
    }
    const p = phash.toLowerCase();
    if (this.phashSet.has(p)) {
      return { hash: p, hit_kind: "phash" };
    }
    return null;
  }

  /** Boolean convenience wrapper. */
  isBlocked(md5: string, phash: string): boolean {
    return this.check(md5, phash) !== null;
  }

  /** Count of registered MD5 entries (for tests and observability). */
  get md5Count(): number {
    return this.md5Set.size;
  }

  /** Count of registered pHash seed entries. */
  get phashCount(): number {
    return this.phashSet.size;
  }

  /**
   * Read a JSON seed file from disk and return a populated registry.
   * Pure helper; no side effects on the global state.
   *
   * The file must be a UTF-8 JSON object of shape
   * `{"md5": string[], "phash_seed": string[]}`. Missing keys default
   * to empty arrays (so a partial file is loadable).
   */
  static loadFromFile(filePath: string): BlocklistRegistry {
    // Use a synchronous read for module-init simplicity; the seed file
    // is small (tens of entries) and we want the registry to be ready
    // before any agent `run()` is invoked.
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BlocklistSeedFile>;
    const reg = new BlocklistRegistry();
    reg.registerMany({
      md5: Array.isArray(parsed.md5) ? parsed.md5 : [],
      phash_seed: Array.isArray(parsed.phash_seed) ? parsed.phash_seed : [],
    });
    return reg;
  }
}
