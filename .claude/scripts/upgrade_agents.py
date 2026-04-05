#!/usr/bin/env python3
"""
Agent Upgrade Script — adds missing XML sections to reach tier targets.
Uses DeepSeek API to generate domain-specific content for each agent.
"""

import json, os, sys, time, re, psycopg2
from openai import OpenAI

# ── Config ──────────────────────────────────────────────────────────────
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "sk-9cc902410b2244d58ef62be83a9d0e62")
RAILWAY_URL = "postgresql://postgres:pQQzSClgIQIBdBMjXMRbmKDqNCORevFD@tramway.proxy.rlwy.net:54364/railway"
OUTPUT_FILE = "/tmp/upgraded_agents.json"
DRY_RUN = "--dry-run" in sys.argv  # Don't push to DB if dry-run

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")

# ── Dimension Checkers (same as audit) ──────────────────────────────────
def has_dim(prompt, dim):
    checks = {
        "role": r'<role>',
        "output_format": r'<output_format>',
        "constraints": r'<constraints>',
        "json_schema": r'<json_schema>',
        "examples": r'<example>',
        "failure_modes": r'<failure_modes>',
        "verification": r'<verification>',
        "xml_depth": None,  # special
        "decomposition": None,  # special
        "hard_rules": r'<hard_rules>',
    }
    if dim == "xml_depth":
        tags = set(re.findall(r'<(\w+)>', prompt))
        return len(tags) >= 6
    if dim == "decomposition":
        phases = re.findall(r'(phase \d|step \d|stage \d)', prompt, re.IGNORECASE)
        return len(phases) >= 3 or bool(re.search(r'<(phase|step|stage|workflow)', prompt, re.IGNORECASE))
    pattern = checks.get(dim)
    if pattern:
        return bool(re.search(pattern, prompt, re.IGNORECASE))
    return False

# ── Tier Classification ─────────────────────────────────────────────────
ORCHESTRATOR_KW = ['orchestrat', 'coordinat', 'pipeline', 'sub-agent', 'sibling agent', 'dispatch', 'aggregate']
COMPLEX_KW = ['workflow', 'multi-step', 'phases', 'stages', 'comprehensive', 'analysis', 'audit', 'review']

def classify_tier(agent):
    combined = f"{agent.get('name','')} {agent.get('systemPrompt','')} {agent.get('description','')}".lower()
    if any(kw in combined for kw in ORCHESTRATOR_KW):
        return 3, "Orchestrator"
    prompt_len = len(agent.get('systemPrompt') or '')
    if prompt_len > 8000 or sum(1 for kw in COMPLEX_KW if kw in combined) >= 3:
        return 2, "Complex"
    return 1, "Simple Leaf"

TIER_REQUIRED = {
    1: ["role", "output_format", "constraints", "examples", "failure_modes", "verification", "xml_depth", "hard_rules"],
    2: ["role", "output_format", "constraints", "json_schema", "examples", "failure_modes", "verification", "xml_depth", "hard_rules"],
    3: ["role", "output_format", "constraints", "json_schema", "examples", "failure_modes", "verification", "xml_depth", "decomposition", "hard_rules"],
}

# ── Generate Missing Sections via DeepSeek ──────────────────────────────
def generate_missing_sections(agent_name, existing_prompt, missing_dims, tier, tier_label):
    """Call DeepSeek to generate the missing XML sections."""
    
    dim_instructions = []
    for dim in missing_dims:
        if dim == "verification":
            dim_instructions.append("""<verification> — 3-4 self-check criteria the agent MUST verify before returning output. Each should be specific and testable. Format:
<verification>
- Check 1: [specific verification relevant to this agent's domain]
- Check 2: ...
- Check 3: ...
</verification>""")
        elif dim == "examples":
            dim_instructions.append("""<example> — One POPULATED input/output example with REAL domain-specific data (not placeholders). Show actual realistic input and the expected output structure. Format:
<example>
<input>[realistic input for this agent]</input>
<output>[realistic expected output with real data]</output>
</example>""")
        elif dim == "failure_modes":
            dim_instructions.append("""<failure_modes> — 3+ scenarios where the agent might fail, with condition → action → fallback. Format:
<failure_modes>
- condition: [when X happens]
  action: [what the agent should do]
  message: "[user-facing error message]"
- condition: ...
  action: ...
  message: "..."
</failure_modes>""")
        elif dim == "hard_rules":
            dim_instructions.append("""<hard_rules> — 5+ absolute rules using NEVER/ALWAYS/MUST. These are non-negotiable constraints. Format:
<hard_rules>
- NEVER [do X]
- ALWAYS [do Y]
- MUST [requirement Z]
- NEVER [do W]
- MUST [requirement V]
</hard_rules>""")
        elif dim == "json_schema":
            dim_instructions.append("""<json_schema> — A complete JSON schema for the agent's primary output. Include types, required fields, and enums where relevant. Format:
<json_schema>
{
  "type": "object",
  "properties": {
    "field1": {"type": "string", "description": "..."},
    ...
  },
  "required": [...]
}
</json_schema>""")
        elif dim == "decomposition":
            dim_instructions.append("""<decomposition> — Break the agent's workflow into 3-5 explicit phases/steps. Format:
<decomposition>
Phase 1 — [Name]: [What happens in this phase]
Phase 2 — [Name]: [What happens]
Phase 3 — [Name]: [What happens]
Phase 4 — [Name]: [What happens]
</decomposition>""")

    dims_text = "\n\n".join(dim_instructions)
    
    system_msg = """You are an expert prompt engineer specializing in 2026 enterprise AI agent standards.
Your task: generate ONLY the missing XML sections for an existing agent's system prompt.

Rules:
- Output ONLY the XML sections requested, nothing else
- Make content deeply specific to the agent's domain (read the existing prompt carefully)
- Use REAL, POPULATED data in examples (not placeholders like "TODO" or "your_value")
- Be concise but thorough — each section should be 5-15 lines
- Do NOT repeat content that already exists in the prompt
- Do NOT wrap your response in markdown code blocks"""

    user_msg = f"""Agent: {agent_name}
Tier: {tier} ({tier_label})

EXISTING SYSTEM PROMPT (first 3000 chars):
{existing_prompt[:3000]}

GENERATE THESE MISSING SECTIONS:

{dims_text}

Output ONLY the XML sections above, ready to be appended to the existing prompt."""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.3,
            max_tokens=4000,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"  ❌ API error for {agent_name}: {e}")
        return None

# ── Main ────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("AGENT UPGRADE SCRIPT — Reaching Tier Targets")
    print("=" * 70)
    
    # 1. Fetch agents
    print("\n📡 Connecting to Railway PostgreSQL...")
    conn = psycopg2.connect(RAILWAY_URL)
    cur = conn.cursor()
    cur.execute('''SELECT id, name, description, "systemPrompt", model FROM "Agent" ORDER BY name''')
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    agents = [dict(zip(cols, row)) for row in rows]
    print(f"   Fetched {len(agents)} agents\n")
    
    # 2. Audit & generate
    upgrades = []
    stats = {"total": 0, "upgraded": 0, "already_ok": 0, "failed": 0}
    
    for i, agent in enumerate(agents):
        stats["total"] += 1
        name = agent["name"]
        prompt = agent.get("systemPrompt") or ""
        tier, tier_label = classify_tier(agent)
        required = TIER_REQUIRED[tier]
        
        missing = [d for d in required if not has_dim(prompt, d)]
        
        if not missing:
            print(f"  ✅ [{i+1:2d}/43] {name[:45]:45s} T{tier} — already at target")
            stats["already_ok"] += 1
            continue
        
        print(f"  🔧 [{i+1:2d}/43] {name[:45]:45s} T{tier} — missing {len(missing)}: {', '.join(missing)}")
        
        # Generate missing sections
        new_sections = generate_missing_sections(name, prompt, missing, tier, tier_label)
        
        if not new_sections:
            stats["failed"] += 1
            continue
        
        # Clean up any markdown code blocks from response
        new_sections = re.sub(r'^```\w*\n?', '', new_sections)
        new_sections = re.sub(r'\n?```$', '', new_sections)
        
        # Merge: append new sections to existing prompt
        updated_prompt = prompt.rstrip() + "\n\n" + new_sections.strip()
        
        upgrades.append({
            "id": agent["id"],
            "name": name,
            "tier": tier,
            "tier_label": tier_label,
            "missing_before": missing,
            "new_sections_length": len(new_sections),
            "updated_prompt": updated_prompt,
            "original_length": len(prompt),
            "updated_length": len(updated_prompt),
        })
        stats["upgraded"] += 1
        
        # Rate limiting (DeepSeek is generous but let's be safe)
        if (i + 1) % 5 == 0:
            time.sleep(1)
    
    # 3. Save results
    print(f"\n{'=' * 70}")
    print(f"RESULTS: {stats['upgraded']} upgraded, {stats['already_ok']} already OK, {stats['failed']} failed")
    print(f"{'=' * 70}")
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(upgrades, f, indent=2, default=str)
    print(f"\n💾 Saved {len(upgrades)} upgrades to {OUTPUT_FILE}")
    
    # 4. Push to Railway (unless dry-run)
    if DRY_RUN:
        print("\n🏃 DRY RUN — skipping database update")
    else:
        print(f"\n📤 Pushing {len(upgrades)} updates to Railway PostgreSQL...")
        for up in upgrades:
            cur.execute(
                'UPDATE "Agent" SET "systemPrompt" = %s, "updatedAt" = NOW() WHERE id = %s',
                (up["updated_prompt"], up["id"])
            )
        conn.commit()
        print(f"   ✅ All {len(upgrades)} agents updated in production!")
    
    cur.close()
    conn.close()
    
    # 5. Summary
    print(f"\n{'=' * 70}")
    print("UPGRADE SUMMARY")
    print(f"{'=' * 70}")
    for up in upgrades:
        print(f"  {up['name'][:45]:45s} +{up['new_sections_length']:5d} chars | {', '.join(up['missing_before'])}")
    
    return stats

if __name__ == "__main__":
    main()
