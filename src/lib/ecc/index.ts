export { parseSkillMd, slugify } from "./skill-parser";
export { ingestSkills, vectorizeSkills } from "./skill-ingest";
export {
  analyzeTask,
  getRoutingTable,
  getAvailablePipelines,
} from "./meta-orchestrator";
export {
  getPromotionCandidates,
  promoteInstinctToSkill,
  decayStaleInstincts,
  clusterSimilarInstincts,
  evolveAgentInstincts,
  getLifecycleStats,
} from "./instinct-engine";
export { createObsidianAdapter, isObsidianConfigured } from "./obsidian-adapter";
export { isECCEnabled, isECCEnabledForAgent } from "./feature-flag";
export type {
  SkillFrontmatter,
  ParsedSkill,
  SkillIngestResult,
  SkillParam,
} from "./types";
export type {
  InstinctSummary,
  PromotionCandidate,
  ClusterGroup,
  EvolveResult,
  LifecycleStats,
} from "./instinct-engine";
export type {
  ObsidianConfig,
  ObsidianDocument,
  ObsidianAdapter,
} from "./obsidian-adapter";
