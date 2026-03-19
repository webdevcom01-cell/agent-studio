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
} from "./instinct-engine";
export { createObsidianAdapter } from "./obsidian-adapter";
export type {
  SkillFrontmatter,
  ParsedSkill,
  SkillIngestResult,
  SkillParam,
} from "./types";
export type { InstinctSummary, PromotionCandidate } from "./instinct-engine";
export type {
  ObsidianConfig,
  ObsidianDocument,
  ObsidianAdapter,
} from "./obsidian-adapter";
