# Obsidian Integration — Onboarding Guide

## Purpose

Persistent memory layer for agent-learned knowledge. Obsidian vault stores
skills and instincts that survive Railway's ephemeral filesystem.

## Architecture

```
Agent learns → Instinct (DB) → Promoted to Skill → Obsidian vault document
                                                  ↑
                              GitMCP bridge (MCP server over GitHub repo)
```

## Prerequisites

- Obsidian (free version — paid plans not needed)
- Obsidian Git plugin (free community plugin)
- GitHub repo for vault sync
- GitMCP account (or self-hosted)

## Setup Steps

### 1. Create Obsidian Vault
```
mkdir agent-studio-vault
cd agent-studio-vault
git init
```

### 2. Install Obsidian Git Plugin
1. Open Obsidian → Settings → Community Plugins
2. Search "Obsidian Git" → Install → Enable
3. Configure: auto-push every 10 min, auto-pull on start

### 3. Push to GitHub
```bash
git remote add origin git@github.com:<user>/agent-studio-vault.git
git push -u origin main
```

### 4. Connect via GitMCP
GitMCP URL: `https://gitmcp.io/<user>/agent-studio-vault`

Add as MCP server in agent-studio:
- Name: "Obsidian Vault"
- URL: `https://gitmcp.io/<user>/agent-studio-vault`
- Transport: SSE

### 5. Configure Adapter (when implemented)

Set env vars on Railway:
```
OBSIDIAN_VAULT_REPO=<user>/agent-studio-vault
OBSIDIAN_BRANCH=main
OBSIDIAN_BASE_PATH=skills/
```

## Vault Structure

```
agent-studio-vault/
├── skills/
│   ├── ecc/           ← Imported ECC skills
│   │   ├── api-design.md
│   │   ├── coding-standards.md
│   │   └── ...
│   └── learned/       ← Auto-promoted instincts
│       ├── instinct-error-handling.md
│       └── ...
├── agents/
│   └── execution-logs/ ← Optional execution summaries
└── README.md
```

## Integration Status

| Component | Status |
|-----------|--------|
| `ObsidianAdapter` interface | Defined (`src/lib/ecc/obsidian-adapter.ts`) |
| Read/write implementation | Stub — returns null/throws |
| GitMCP bridge | Available via Featured Servers |
| Skill → vault sync | Not implemented |
| Auto-sync on promotion | Not implemented |

Implementation target: post-ECC Phase 9, when instinct system has production data.
