# Hook Writer — Instincts
*Path: /agents/hook-writer/instincts*
*Last updated: 2026-05-02*

---

## Learned Patterns

### Per-platform hook intelligence

**LinkedIn**
- Line 1 works best as a hard stat or bold claim, never a question
- "X% of developers still do Y" outperforms "Here's why X matters"
- Avoid exclamation marks in Line 1 — signals low-confidence claim
- Best-performing format: `[Specific number] + [counterintuitive implication]`
- Example that works: "Claude Agent SDK just shipped. Multi-agent pipelines now take 3 nodes, not 30."

**X (Twitter)**
- Under 180 chars consistently outperforms 200-240 chars (more retweets)
- Rhetorical questions underperform vs. direct claims for developer audience
- "Unpopular opinion:" prefix adds 15-20% pattern interrupt for contrarian angles
- Hot takes require specificity — generic hot takes get ratio'd

**YouTube**
- Thumbnail text: odd numbers perform better (3, 5, 7) vs even
- "I tested X for N days" thumbnails outperform feature-announcement thumbnails
- OPEN line: end with a half-sentence or curiosity gap — don't complete the thought
- Best thumbnail formula: `[NUMBER] [THING] [THAT CHALLENGES ASSUMPTION]`

**Instagram**
- First line must be completable as a carousel cover without the rest of the caption
- Community-first framing ("we", "builders like us") outperforms solo narrative
- 1 emoji early in line 1 adds scroll-stop on mobile
- Hashtag strategy: 3 broad (#AITools) + 5 niche (#AgentBuilding) + 2 trend-specific

**TikTok**
- OVERLAY outperforms SPOKEN for developer hooks — screen readers don't need to wait
- Pattern interrupt works best mid-statement, not as a question
- "Nobody talks about this" prefix gets high initial watch time but lower completion
- Best format for dev audience: state a concrete result in first 3 words

### Scoring calibration notes
- Platform Fit (PF) is most critical dimension — wrong format = instant scroll-past
- Urgency (UF) often sacrificed for specificity — that trade is acceptable
- Any hook scoring < 14 total: try switching pattern before trying to tweak words
- P3 (Curiosity Gap) consistently scores highest on YouTube, P1 (Hard Stat) on LinkedIn

### Common mistakes
- DO NOT use "game-changer" — banned phrase, auto-reduces PF score
- DO NOT write LinkedIn hook as one run-on sentence — 2-line structure is mandatory
- TikTok SPOKEN hooks over 12 words will get cut mid-sentence in production — hard limit
- Winners-log reference: match the STRUCTURE of winners, never copy content
