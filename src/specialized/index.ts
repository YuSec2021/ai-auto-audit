/**
 * Sprint 4 — Specialized module barrel.
 *
 * Re-exports the four specialized stub classes, the registry, and the
 * `SpecializedTarget` / `SpecializedInput` / `SpecializedOutput` /
 * `STUB_SCORE` types so consumers can `import` from one place.
 */

export { PornAgent } from "./porn-agent.js";
export { AdAgent } from "./ad-agent.js";
export { PoliticalAgent } from "./political-agent.js";
export { LogoAgent } from "./logo-agent.js";
export { SpecializedAgentRegistry } from "./registry.js";
export {
  STUB_SCORE,
  type SpecializedTarget,
  type SpecializedInput,
  type SpecializedOutput,
} from "./specialized-types.js";
