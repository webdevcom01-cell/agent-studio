# Content Repurposer — Instincts
*Path: /agents/content-repurposer/instincts*
*Last updated: 2026-05-02*

---

## Learned Patterns

### Platform adaptation principles

**LinkedIn → the piece with the most technical depth**
- Developer audience expects substance, not just a hook
- Structure that works: Hook → 3 insights → 1 contrarian → 1 specific question
- Insight blocks: 3-4 sentences each, one concrete example per block
- CTA questions that drive comments: "How are you handling X in your current stack?" beats "What do you think?"
- Word count: shoot for 500-600 words — under 300 feels thin, over 800 loses the feed scroll

**X Thread → the fastest, densest piece**
- Each tweet must stand alone as a complete thought
- Thread narrative: Problem → Context → Implication → Mistake → Fix → Takeaway → CTA
- Never split a sentence across tweets — complete thought per tweet
- Don't pad to 6 tweets if 5 is cleaner
- Reuse the hook from all_hooks that has the sharpest single-tweet structure

**YouTube → the most educational piece**
- Script outline, not full script — enough for a confident presenter to riff
- Thumbnail must promise something specific and deliverable in the video length
- Section titles: outcome-oriented ("How to X" not "About X")
- Tags: mix exact-match terms with broad discovery terms — 8-10 total
- HOOK line: 15 words max, end on a half-thought to create watch pressure

**Instagram → the most visual piece**
- Carousel cover (Slide 1) must work as a standalone billboard
- Each slide: one insight only — resist the urge to stack points
- Supporting lines: concrete, not abstract — "3 nodes, not 300 lines of code" not "simplified architecture"
- CTA slide should ask a question that invites saves ("Save this if you're building X")
- Hashtags: 8-12 is optimal; >15 looks spammy to developer audience

**TikTok → the most raw piece**
- Write it as if you're talking to a developer friend, not an audience
- Each point: 8-12 words max — TikTok rewards density
- PAYOFF must deliver something surprising or counter-intuitive
- No corporate language anywhere — "leverage" and "utilize" are instant credibility killers
- CTA: "Follow for X" works better than "Comment below" for dev content

### Cross-platform adaptation rules
- Hook from all_hooks: select based on platform fit, NOT score alone — a ⭐⭐ fit-optimized hook beats a ⭐⭐⭐ wrong-platform hook
- LinkedIn body ≠ thread tweets — completely different content, same topic
- TikTok script should feel like the LinkedIn post's rebellious younger sibling
- Never copy-paste a sentence from one platform piece into another

### Developer voice test (applied before finalizing each piece)
Ask: "Could this sentence appear in a B2C product blog or general tech newsletter?"
If YES → rewrite for builders. The audience knows what APIs, prompts, and tokens are.

BAD: "This feature streamlines AI integration for consistent outputs."
GOOD: "Set once in system prompt — no per-request config, no repeated context overhead."

BAD: "Improve user experience with dynamic adjustments."  
GOOD: "Swap instruction sets per user segment without touching your app logic."

BAD: "Leverage this powerful tool to enhance your workflow."
GOOD: "One kb_search node, injected via {{kb_context}} — agents read it on every run."

### Common mistakes
- DO NOT generate a "YouTube full script" — outline only, sections + bullets
- DO NOT use same hook text on LinkedIn and X verbatim — reformat even if same pattern
- DO NOT forget to check all_hooks for TikTok-specific hook before defaulting to main hook
- Word count check: if LinkedIn draft < 300 words, it's not done — expand the body
- TikTok SPOKEN hook: count the words manually before finalizing. Max 12. If >12, cut.
