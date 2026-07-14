/**
 * F4-4 tests: SSRF guard for MCPServer.url.
 * Blocklist: metadata, loopback, private v4/v6, link-local, IPv4-mapped.
 * Allowlist: *.railway.internal (legitimate ECC MCP path — see investigate).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: mockLookup }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { validateMcpUrl } from "../ssrf-guard";

describe("F4-4: SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  // ── ODBIJENO ──
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:3000/api",
    "http://0.0.0.0:8000/mcp",
    "http://10.1.2.3/mcp",
    "http://172.20.0.5/mcp",
    "http://192.168.1.10/mcp",
    "http://[::1]:8000/mcp",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://[fe80::1]/mcp",
    "http://[::ffff:10.0.0.1]/mcp",
  ])("blokira IP literal: %s", async (url) => {
    const v = await validateMcpUrl(url);
    expect(v.allowed).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("blokira localhost i metadata hostname-ove bez DNS-a", async () => {
    expect((await validateMcpUrl("http://localhost:3000/mcp")).allowed).toBe(false);
    expect((await validateMcpUrl("http://metadata.google.internal/x")).allowed).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("blokira hostname koji se rezolvuje u privatnu adresu (bilo koja od svih)", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 }, // rebinding pokušaj — druga adresa privatna
    ]);
    const v = await validateMcpUrl("https://evil.example.com/mcp");
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("10.0.0.7");
  });

  it("fail-closed: DNS greška → odbijeno", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect((await validateMcpUrl("https://ne-postoji.example/mcp")).allowed).toBe(false);
  });

  it("blokira ne-http(s) protokole", async () => {
    expect((await validateMcpUrl("file:///etc/passwd")).allowed).toBe(false);
    expect((await validateMcpUrl("gopher://x/1")).allowed).toBe(false);
  });

  // ── DOZVOLJENO ──
  it("dozvoljava javni URL", async () => {
    const v = await validateMcpUrl("https://jn-portal-playwright-mcp-production.up.railway.app/mcp");
    expect(v.allowed).toBe(true);
  });

  it("dozvoljava javnu IP adresu", async () => {
    expect((await validateMcpUrl("http://8.8.8.8/mcp")).allowed).toBe(true);
  });

  it("ALLOWLIST: *.railway.internal (ECC MCP legitimna putanja)", async () => {
    const v = await validateMcpUrl("http://positive-inspiration.railway.internal:8000");
    expect(v.allowed).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
