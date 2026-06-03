import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEvalBaseUrl } from "../ssrf-guard";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function expectBlocked(url: string): void {
  expect(() => validateEvalBaseUrl(url), `expected '${url}' to be blocked`).toThrow(
    /SSRF_BLOCKED/,
  );
}

function expectAllowed(url: string): void {
  expect(() => validateEvalBaseUrl(url), `expected '${url}' to be allowed`).not.toThrow();
}

describe("validateEvalBaseUrl — blocked URLs", () => {
  describe("127.0.0.0/8 — full range, not just .1", () => {
    it("blocks http://127.0.0.2", () => expectBlocked("http://127.0.0.2"));
    it("blocks http://127.1.2.3", () => expectBlocked("http://127.1.2.3"));
    it("blocks http://127.255.255.255", () => expectBlocked("http://127.255.255.255"));
  });

  describe("encoded 127.0.0.1 variants", () => {
    it("blocks hex 0x7f000001", () => expectBlocked("http://0x7f000001"));
    it("blocks octal 0177.0.0.1", () => expectBlocked("http://0177.0.0.1"));
    it("blocks decimal 2130706433", () => expectBlocked("http://2130706433"));
  });

  describe("link-local / metadata", () => {
    it("blocks http://169.254.169.254", () => expectBlocked("http://169.254.169.254"));
    it("blocks http://169.254.0.1", () => expectBlocked("http://169.254.0.1"));
  });

  describe("RFC1918 private ranges", () => {
    it("blocks http://10.0.0.5", () => expectBlocked("http://10.0.0.5"));
    it("blocks http://10.255.255.255", () => expectBlocked("http://10.255.255.255"));
    it("blocks http://192.168.1.1", () => expectBlocked("http://192.168.1.1"));
    it("blocks http://172.16.0.1", () => expectBlocked("http://172.16.0.1"));
    it("blocks http://172.31.255.255", () => expectBlocked("http://172.31.255.255"));
  });

  describe("IPv6-mapped private addresses", () => {
    it("blocks http://[::ffff:10.0.0.1]", () => expectBlocked("http://[::ffff:10.0.0.1]"));
    it("blocks http://[::ffff:192.168.1.1]", () => expectBlocked("http://[::ffff:192.168.1.1]"));
    it("blocks http://[::ffff:169.254.169.254]", () =>
      expectBlocked("http://[::ffff:169.254.169.254]"));
  });

  describe("disallowed schemes", () => {
    it("blocks file:///etc/passwd", () => expectBlocked("file:///etc/passwd"));
    it("blocks redis://localhost:6379", () => expectBlocked("redis://localhost:6379"));
    it("blocks ftp://localhost", () => expectBlocked("ftp://localhost"));
  });

  describe("invalid URL", () => {
    it("blocks empty string", () => expectBlocked(""));
    it("blocks bare hostname", () => expectBlocked("not-a-url"));
  });
});

describe("validateEvalBaseUrl — allowed URLs", () => {
  it("allows http://localhost:3000", () => expectAllowed("http://localhost:3000"));
  it("allows http://localhost (no port)", () => expectAllowed("http://localhost"));
  it("allows http://127.0.0.1:3000", () => expectAllowed("http://127.0.0.1:3000"));
  it("allows https://localhost:3000", () => expectAllowed("https://localhost:3000"));

  describe("NEXTAUTH_URL env var", () => {
    const originalEnv = process.env["NEXTAUTH_URL"];

    beforeEach(() => {
      process.env["NEXTAUTH_URL"] = "https://myapp.example.com";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env["NEXTAUTH_URL"];
      } else {
        process.env["NEXTAUTH_URL"] = originalEnv;
      }
    });

    it("allows the production host from NEXTAUTH_URL", () =>
      expectAllowed("https://myapp.example.com"));

    it("allows production host with port", () =>
      expectAllowed("https://myapp.example.com:443"));

    it("does NOT allow a subdomain of NEXTAUTH_URL host (exact match only)", () =>
      expectBlocked("https://evil.myapp.example.com"));
  });
});
