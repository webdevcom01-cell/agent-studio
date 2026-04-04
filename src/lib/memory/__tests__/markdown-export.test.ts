import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findUnique: vi.fn() },
    agentMemory: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  exportAgentMemoryAsMarkdown,
  exportMemoryShards,
  parseMemoryMarkdown,
  importMemoryFromMarkdown,
} from "../markdown-export";

const mockAgentFind = prisma.agent.findUnique as ReturnType<typeof vi.fn>;
const mockMemoryFind = prisma.agentMemory.findMany as ReturnType<typeof vi.fn>;
const mockMemoryUpsert = prisma.agentMemory.upsert as ReturnType<typeof vi.fn>;

function makeMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    key: "user-preference",
    value: "dark mode",
    category: "general",
    importance: 0.5,
    accessCount: 3,
    accessedAt: new Date("2026-04-03T10:00:00Z"),
    createdAt: new Date("2026-04-01T10:00:00Z"),
    updatedAt: new Date("2026-04-03T10:00:00Z"),
    ...overrides,
  };
}

describe("exportAgentMemoryAsMarkdown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates markdown with agent name and memory count", async () => {
    mockAgentFind.mockResolvedValue({ name: "Test Agent" });
    mockMemoryFind.mockResolvedValue([makeMemory()]);

    const md = await exportAgentMemoryAsMarkdown("agent-1");
    expect(md).toContain("# Agent Memory — Test Agent");
    expect(md).toContain("Total: 1 memories");
  });

  it("includes hot section for high-importance memories", async () => {
    mockAgentFind.mockResolvedValue({ name: "Agent" });
    mockMemoryFind.mockResolvedValue([
      makeMemory({ importance: 0.95, accessedAt: new Date() }),
    ]);

    const md = await exportAgentMemoryAsMarkdown("agent-1");
    expect(md).toContain("## Hot (active context)");
    expect(md).toContain("**user-preference**");
  });

  it("groups by category", async () => {
    mockAgentFind.mockResolvedValue({ name: "Agent" });
    mockMemoryFind.mockResolvedValue([
      makeMemory({ category: "profile", key: "name" }),
      makeMemory({ id: "mem-2", category: "preferences", key: "theme" }),
    ]);

    const md = await exportAgentMemoryAsMarkdown("agent-1");
    expect(md).toContain("### profile");
    expect(md).toContain("### preferences");
  });

  it("handles empty memories", async () => {
    mockAgentFind.mockResolvedValue({ name: "Agent" });
    mockMemoryFind.mockResolvedValue([]);

    const md = await exportAgentMemoryAsMarkdown("agent-1");
    expect(md).toContain("Total: 0 memories");
    expect(md).not.toContain("## Hot");
  });

  it("falls back to agentId when agent not found", async () => {
    mockAgentFind.mockResolvedValue(null);
    mockMemoryFind.mockResolvedValue([]);

    const md = await exportAgentMemoryAsMarkdown("agent-123");
    expect(md).toContain("agent-123");
  });
});

describe("exportMemoryShards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one shard file per category", async () => {
    mockMemoryFind.mockResolvedValue([
      makeMemory({ category: "general", key: "k1" }),
      makeMemory({ id: "m2", category: "general", key: "k2" }),
      makeMemory({ id: "m3", category: "profile", key: "k3" }),
    ]);

    const shards = await exportMemoryShards("agent-1");
    expect(shards.size).toBe(2);
    expect(shards.has("memory-general.md")).toBe(true);
    expect(shards.has("memory-profile.md")).toBe(true);
  });

  it("includes memory details in shard content", async () => {
    mockMemoryFind.mockResolvedValue([
      makeMemory({ category: "general", key: "user-name", value: "Alice" }),
    ]);

    const shards = await exportMemoryShards("agent-1");
    const content = shards.get("memory-general.md") ?? "";
    expect(content).toContain("## user-name");
    expect(content).toContain("Alice");
    expect(content).toContain("**Importance:** 0.5");
  });
});

describe("parseMemoryMarkdown", () => {
  it("parses basic entry format", () => {
    const md = `# Agent Memory — Test
## Categories
### general
- **user-name**: Alice
- **theme**: dark mode
`;
    const entries = parseMemoryMarkdown(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      key: "user-name",
      value: "Alice",
      category: "general",
      importance: 0.5,
    });
    expect(entries[1]).toEqual({
      key: "theme",
      value: "dark mode",
      category: "general",
      importance: 0.5,
    });
  });

  it("parses hot section with importance metadata", () => {
    const md = `## Hot (active context)
- **critical-fact** [context]: some info _(importance: 0.95, accessed: 2h ago)_
## Categories
### general
- **other**: value
`;
    const entries = parseMemoryMarkdown(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      key: "critical-fact",
      value: "some info",
      category: "context",
      importance: 0.95,
    });
  });

  it("uses category from bracket notation", () => {
    const md = `### general
- **key1** [profile]: some value
`;
    const entries = parseMemoryMarkdown(md);
    expect(entries[0].category).toBe("profile");
  });

  it("falls back to current section category", () => {
    const md = `### my-category
- **key1**: value1
`;
    const entries = parseMemoryMarkdown(md);
    expect(entries[0].category).toBe("my-category");
  });

  it("returns empty for invalid markdown", () => {
    const md = "# Just a title\nSome random text\n";
    expect(parseMemoryMarkdown(md)).toEqual([]);
  });

  it("handles roundtrip: export → parse preserves entries", () => {
    // Simulate what exportAgentMemoryAsMarkdown would produce
    const md = `# Agent Memory — Test Agent
> Exported: 2026-04-04T10:00:00Z | Total: 2 memories

## Categories

### general
- **user-name**: Alice
- **preference**: dark mode

`;
    const entries = parseMemoryMarkdown(md);
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe("user-name");
    expect(entries[1].key).toBe("preference");
  });
});

describe("importMemoryFromMarkdown", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts parsed entries", async () => {
    mockMemoryUpsert.mockResolvedValue({});
    const md = `### general
- **key1**: value1
- **key2**: value2
`;
    const result = await importMemoryFromMarkdown("agent-1", md);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockMemoryUpsert).toHaveBeenCalledTimes(2);
  });

  it("counts skipped entries on upsert failure", async () => {
    mockMemoryUpsert
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("constraint violation"));

    const md = `### general
- **ok-key**: works
- **bad-key**: fails
`;
    const result = await importMemoryFromMarkdown("agent-1", md);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("passes correct upsert params", async () => {
    mockMemoryUpsert.mockResolvedValue({});
    const md = `### profile
- **name**: Bob
`;
    await importMemoryFromMarkdown("agent-1", md);
    expect(mockMemoryUpsert).toHaveBeenCalledWith({
      where: { agentId_key: { agentId: "agent-1", key: "name" } },
      create: {
        agentId: "agent-1",
        key: "name",
        value: "Bob",
        category: "profile",
        importance: 0.5,
      },
      update: {
        value: "Bob",
        category: "profile",
        importance: 0.5,
      },
    });
  });
});
