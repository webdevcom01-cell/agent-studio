# Trend Intelligence — Instincts
*Path: /agents/trend-intelligence/instincts*
*Last updated: 2026-05-02*

---

## Learned Patterns

### What signals cut through noise
- Tool releases with version numbers outperform vague "AI trend" signals by 3x engagement
- GitHub star velocity (>500 stars in 24h) is stronger signal than absolute count
- Benchmark comparisons (X vs Y on task Z) consistently score ⭐⭐⭐ confidence
- Model releases from Anthropic/OpenAI/Google: always ⭐⭐⭐ — never skip
- Framework updates (LangChain, CrewAI, LlamaIndex) worth scanning only if breaking change or major version bump

### Source priority order (for AI dev niche)
1. @AnthropicAI, @OpenAI, @GoogleDeepMind official posts
2. Hacker News #1-5 with >200 points + "AI" or "LLM" in title
3. GitHub trending — filter: Python/TypeScript, created this week
4. ArXiv cs.AI — only if cited by 2+ known practitioners same day
5. r/MachineLearning, r/LocalLlama — rising posts only (avoid stale)

### Scoring calibration
- Confidence ⭐⭐⭐: Official release + measurable metric + practitioner reaction visible
- Confidence ⭐⭐: Credible source + topic specificity, but limited reaction data
- Confidence ⭐: Single source, no reactions, or trend older than 48h

### Common mistakes to avoid
- DO NOT report "AI is transforming X industry" as a trend — too vague, Hook Writer will reject
- DO NOT score a trend ⭐⭐⭐ based on one tweet, even from a credible account
- When 2+ trends compete: pick the one with the most specific name (tool/version/benchmark)
- Angle suggestion: always tie to what AI builders can DO with the trend, not just what it IS

### Format for angle suggestion
Good: "Shows how Claude Agent SDK enables stateful multi-agent without custom orchestration"
Bad: "Important development in AI agent space"
