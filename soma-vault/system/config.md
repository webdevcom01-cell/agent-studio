# SOMA System Config
*Last updated: 2026-05-02*

---

## Agent Registry

| Agent | ID | Model | Nodes |
|-------|----|-------|-------|
| Trend Intelligence | c1777723587797ch65fqcudn | gpt-4.1-mini | kb_search → web_search → ai_response → call_agent(HW) |
| Hook Writer | c17777235878091qa78qw27c | gpt-4.1-mini | kb_search → ai_response → call_agent(CR) |
| Content Repurposer | c1777723587821zymz38ug0j | gpt-4.1-mini | kb_search → ai_response |

---

## KnowledgeBase Registry

| Agent | KB ID | Sources |
|-------|-------|---------|
| Trend Intelligence | c1777724361613zkacaonj60 | instincts, evo-log |
| Hook Writer | c17777243623082bxh7e2crn | instincts, winners-log |
| Content Repurposer | c1777724362990ottwffcep9 | instincts, format-templates |

---

## A2A Chain

```
Trend Intelligence
  └─ call_agent → Hook Writer
       └─ call_agent → Content Repurposer
                          └─ [output → human review queue]
```

---

## Platform Scope

Active platforms: LinkedIn, X (Twitter), YouTube, Instagram, TikTok

Primary niche: AI development, agent building, LLM tooling

---

## Model Config

Provider: OpenAI
Default model: gpt-4.1-mini
Web search: Tavily API

---

## Trigger

Manual trigger: Send `scan trends now` to Trend Intelligence
Auto trigger: Not configured (set up cron when ready)
