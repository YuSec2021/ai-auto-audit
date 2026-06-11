/**
 * Sprint 1 — Barrel export for the new agent runtime module.
 * Sprint 2 additions appended at the bottom.
 * Sprint 3 additions appended at the bottom.
 *
 * Importers can `import { Agent, getMessageBus, emitAgentAuditLog } from "@/agents"`
 * rather than reaching into individual files.
 */

export type {
  Agent,
  AgentContext,
  AgentInput,
  AgentOutput,
  AgentMessage,
  AuditLogEntry,
  CorrelationId,
  FanInResult,
  HealthStatus,
  ImageId,
  MessageBus,
  MessageHandler,
  OrchestratorInput,
  OrchestratorSlots,
  OrchestratorSubscriber,
  PipelineCheckpoint,
  PipelineEvent,
  PipelineStateS2,
  RunId,
  Unsubscribe,
  // Sprint 3 — preprocess / blocklist types.
  PreprocessInput,
  PreprocessOutput,
  PreprocessOutputDetails,
  PreprocessMetadata,
  BlocklistEntry,
  BlocklistHitEvent,
  // Sprint 4 — specialized sub-agent + risk fusion types.
  SpecializedTarget,
  SpecializedInput,
  SpecializedOutput,
  SpecializedOrchestratorSlots,
  FusionAction,
  FusionWeights,
  FusionThresholds,
  FusionInput,
  FusionOutput,
} from "./types.js";

export {
  EventEmitterMessageBus,
  getMessageBus,
  setMessageBus,
} from "./message-bus.js";

export {
  countLogLines,
  emitAgentAuditLog,
  resolveLogFile,
} from "./audit-log.js";

// -------------------------------------------------------------------------
// Sprint 2 — stub agents (text-risk, vision, metadata).
// -------------------------------------------------------------------------

export {
  TextRiskAgent,
  type TextRiskInput,
  type TextRiskOutputDetails,
} from "./text-risk-agent.js";

export {
  VisionAgent,
  type VisionInput,
  type VisionOutputDetails,
} from "./vision-agent.js";

export {
  MetadataAgent,
  type MetadataInput,
  type MetadataOutputDetails,
} from "./metadata-agent.js";

// -------------------------------------------------------------------------
// Sprint 3 — preprocess agent, blocklist registry, pHash helper.
// -------------------------------------------------------------------------

export {
  PreprocessAgent,
  BlocklistRegistry,
  pHash,
  hammingHex,
  type BlocklistSeedFile,
} from "../preprocess/index.js";

// -------------------------------------------------------------------------
// Sprint 4 — specialized sub-agents + risk fusion.
// -------------------------------------------------------------------------

export {
  PornAgent,
  AdAgent,
  PoliticalAgent,
  LogoAgent,
  SpecializedAgentRegistry,
  STUB_SCORE,
} from "../specialized/index.js";

export {
  RiskFusionAgent,
  buildDefaultRiskFusionAgent,
  FUSION_CONFIG,
  FUSION_WEIGHTS,
  FUSION_THRESHOLDS,
  configureFusion,
  clamp01,
  scoreToAction,
} from "../fusion/index.js";
