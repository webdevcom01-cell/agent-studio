import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createObsidianAdapter,
  isObsidianConfigured,
  type ObsidianConfig,
} from "../obsidian-adapter";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_CONFIG: ObsidianConfig = {
  vaultRepo: "user/vault",
  branch: "main",
  basePath: "",
  githubToken: "ghp_test_token",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("isObsidianConfigured", () => {
  const origRepo = process.env.OBSIDIAN_VAULT_REPO;
  const origToken = process.env.OBSIDIAN_GITHUB_TOKEN;

  afterEach(() => {
    if (origRepo !== undefined) process.env.OBSIDIAN_VAULT_REPO = origRepo;
    else delete process.env.OBSIDIAN_VAULT_REPO;
    if (origToken !== undefined) process.env.OBSIDIAN_GITHUB_TOKEN = origToken;
    else delete process.env.OBSIDIAN_GITHUB_TOKEN;
  });

  it("returns true when both env vars set", () => {
    process.env.OBSIDIAN_VAULT_REPO = "user/vault";
    process.env.OBSIDIAN_GITHUB_TOKEN = "ghp_xxx";
    expect(isObsidianConfigured()).toBe(true);
  });

  it("returns false when repo missing", () => {
    delete process.env.OBSIDIAN_VAULT_REPO;
    process.env.OBSIDIAN_GITHUB_TOKEN = "ghp_xxx";
    expect(isObsidianConfigured()).toBe(false);
  });

  it("returns false when token missing", () => {
    process.env.OBSIDIAN_VAULT_REPO = "user/vault";
    delete process.env.OBSIDIAN_GITHUB_TOKEN;
    expect(isObsidianConfigured()).toBe(false);
  });
});

describe("createObsidianAdapter", () => {
  describe("isConnected", () => {
    it("returns true when GitHub repo is accessible", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(await adapter.isConnected()).toBe(true);
    });

    it("returns false when GitHub returns error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(await adapter.isConnected()).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(await adapter.isConnected()).toBe(false);
    });
  });

  describe("readDocument", () => {
    it("reads and parses a markdown document", async () => {
      const content = Buffer.from(
        "---\ntitle: \"Test\"\ntags: [\"skill\"]\n---\n\n# Hello\n\nContent here"
      ).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content, sha: "abc123", name: "test.md" }),
      });

      const adapter = createObsidianAdapter(TEST_CONFIG);
      const doc = await adapter.readDocument("test.md");

      expect(doc).not.toBeNull();
      expect(doc?.title).toBe("Test");
      expect(doc?.tags).toContain("skill");
      expect(doc?.content).toContain("Hello");
      expect(doc?.sha).toBe("abc123");
    });

    it("returns null for missing document", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(await adapter.readDocument("missing.md")).toBeNull();
    });
  });

  describe("writeDocument", () => {
    it("creates a new document via PUT", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 }) // check existing
        .mockResolvedValueOnce({ ok: true }); // PUT create

      const adapter = createObsidianAdapter(TEST_CONFIG);
      await adapter.writeDocument({
        path: "skills/test.md",
        title: "Test Skill",
        content: "# Test\n\nContent",
        tags: ["skill"],
        updatedAt: new Date().toISOString(),
      });

      const putCall = mockFetch.mock.calls[1];
      expect(putCall[1].method).toBe("PUT");
      const body = JSON.parse(putCall[1].body);
      expect(body.branch).toBe("main");
      expect(body.message).toContain("Test Skill");
    });

    it("updates existing document with SHA", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "existing-sha" }) })
        .mockResolvedValueOnce({ ok: true });

      const adapter = createObsidianAdapter(TEST_CONFIG);
      await adapter.writeDocument({
        path: "skills/test.md",
        title: "Test",
        content: "Updated",
        tags: [],
        updatedAt: new Date().toISOString(),
      });

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.sha).toBe("existing-sha");
    });

    it("throws on API error", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Validation failed" });

      const adapter = createObsidianAdapter(TEST_CONFIG);
      await expect(
        adapter.writeDocument({
          path: "test.md",
          title: "Test",
          content: "",
          tags: [],
          updatedAt: new Date().toISOString(),
        })
      ).rejects.toThrow("GitHub API error");
    });
  });

  describe("syncSkillToVault", () => {
    it("writes skill to skills/ directory", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false }) // check existing
        .mockResolvedValueOnce({ ok: true }); // PUT

      const adapter = createObsidianAdapter(TEST_CONFIG);
      const path = await adapter.syncSkillToVault("error-handling", "# Error Handling\n\nContent", ["typescript"]);

      expect(path).toBe("skills/error-handling.md");
    });
  });

  describe("syncInstinctToVault", () => {
    it("writes instinct to instincts/ directory", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true });

      const adapter = createObsidianAdapter(TEST_CONFIG);
      const path = await adapter.syncInstinctToVault("Error Handling", "Always handle errors", 0.75);

      expect(path).toBe("instincts/error-handling.md");
    });
  });

  describe("listDocuments", () => {
    it("returns markdown files from directory", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { path: "skills/a.md", name: "a.md", type: "file" },
          { path: "skills/b.md", name: "b.md", type: "file" },
          { path: "skills/.hidden", name: ".hidden", type: "file" },
          { path: "skills/subdir", name: "subdir", type: "dir" },
        ],
      });

      const adapter = createObsidianAdapter(TEST_CONFIG);
      const docs = await adapter.listDocuments("skills");

      expect(docs).toHaveLength(2);
      expect(docs[0].name).toBe("a.md");
    });

    it("returns empty on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("timeout"));
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(await adapter.listDocuments()).toEqual([]);
    });
  });

  describe("getGitMCPUrl", () => {
    it("returns gitmcp.io URL for the repo", () => {
      const adapter = createObsidianAdapter(TEST_CONFIG);
      expect(adapter.getGitMCPUrl()).toBe("https://gitmcp.io/user/vault");
    });
  });

  describe("basePath support", () => {
    it("prepends basePath to all operations", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

      const adapter = createObsidianAdapter({ ...TEST_CONFIG, basePath: "vault-root" });
      await adapter.syncSkillToVault("test", "content");

      const putUrl = mockFetch.mock.calls[0][0] as string;
      expect(putUrl).toContain("vault-root/skills/test.md");
    });
  });
});
