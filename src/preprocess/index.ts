/**
 * Sprint 3 — Preprocess module barrel.
 *
 * Re-exports the PreprocessAgent, BlocklistRegistry, pHash helper,
 * and the public types so consumers can `import` from one place.
 */

export { PreprocessAgent } from "./preprocess-agent.js";
export type { BlocklistSeedFile, BlocklistEntry } from "./blocklist.js";
export { BlocklistRegistry } from "./blocklist.js";
export { pHash, hammingHex } from "./phash.js";
export type {
  PreprocessInput,
  PreprocessOutput,
  PreprocessOutputDetails,
  PreprocessMetadata,
  BlocklistHitEvent,
} from "../agents/types.js";
