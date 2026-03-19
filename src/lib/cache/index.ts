import { MemoryCache } from "./memory-cache";

const SKILL_METADATA_TTL = 10 * 60 * 1000;
const KB_SEARCH_TTL = 2 * 60 * 1000;
const AGENT_CARD_TTL = 5 * 60 * 1000;

export const skillMetadataCache = new MemoryCache(SKILL_METADATA_TTL);
export const kbSearchCache = new MemoryCache(KB_SEARCH_TTL);
export const agentCardCache = new MemoryCache(AGENT_CARD_TTL);

export { MemoryCache } from "./memory-cache";

export function getAllCacheStats(): Record<
  string,
  { hits: number; misses: number; hitRate: number; size: number }
> {
  return {
    skillMetadata: skillMetadataCache.stats(),
    kbSearch: kbSearchCache.stats(),
    agentCard: agentCardCache.stats(),
  };
}
