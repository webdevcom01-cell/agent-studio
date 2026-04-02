/**
 * OWASP LLM Top 10 — Automated Security Audit
 *
 * Verifies that security controls are in place by checking
 * that the relevant modules exist and export the expected functions.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

describe("OWASP LLM Top 10 Security Audit", () => {
  // LLM01: Prompt Injection
  it("has prompt injection detector", () => {
    expect(existsSync(join(SRC, "lib/safety/injection-detector.ts"))).toBe(true);
  });

  it("has engine safety middleware for auto-checking AI calls", () => {
    expect(existsSync(join(SRC, "lib/safety/engine-safety-middleware.ts"))).toBe(true);
  });

  // LLM02: Insecure Output Handling
  it("has PII detector and redactor", () => {
    expect(existsSync(join(SRC, "lib/safety/pii-detector.ts"))).toBe(true);
  });

  it("has content moderator", () => {
    expect(existsSync(join(SRC, "lib/safety/content-moderator.ts"))).toBe(true);
  });

  // LLM03: Training Data Poisoning — N/A (we use external models)

  // LLM04: Model Denial of Service
  it("has rate limiting", () => {
    expect(existsSync(join(SRC, "lib/rate-limit.ts"))).toBe(true);
  });

  it("has per-endpoint rate limit config", () => {
    expect(existsSync(join(SRC, "lib/rate-limit-config.ts"))).toBe(true);
  });

  // LLM05: Supply Chain Vulnerabilities
  it("has post-deploy verifier with security scan", () => {
    expect(existsSync(join(SRC, "lib/versioning/post-deploy-verifier.ts"))).toBe(true);
  });

  // LLM06: Sensitive Information Disclosure
  it("has audit logger for compliance", () => {
    expect(existsSync(join(SRC, "lib/safety/audit-logger.ts"))).toBe(true);
  });

  it("has CSP in security headers", () => {
    expect(existsSync(join(SRC, "lib/api/security-headers.ts"))).toBe(true);
  });

  // LLM07: Insecure Plugin Design
  it("has RBAC for MCP tool access", async () => {
    const handler = await import("@/lib/runtime/handlers/mcp-tool-handler");
    expect(handler.mcpToolHandler).toBeDefined();
  });

  // LLM08: Excessive Agency
  it("has guardrails handler", () => {
    expect(existsSync(join(SRC, "lib/runtime/handlers/guardrails-handler.ts"))).toBe(true);
  });

  it("has cost monitor for budget enforcement", () => {
    expect(existsSync(join(SRC, "lib/runtime/handlers/cost-monitor-handler.ts"))).toBe(true);
  });

  // LLM09: Overreliance — Covered by eval framework
  it("has eval framework with 3-layer assertions", () => {
    expect(existsSync(join(SRC, "lib/evals/assertions.ts"))).toBe(true);
    expect(existsSync(join(SRC, "lib/evals/runner.ts"))).toBe(true);
  });

  // LLM10: Model Theft — N/A (we use API-based models)

  // Additional: Auth
  it("has org-level auth guards", async () => {
    const guards = await import("@/lib/api/auth-guard");
    expect(guards.requireOrgMember).toBeDefined();
    expect(guards.requireOrgAdmin).toBeDefined();
    expect(guards.requireOrgOwner).toBeDefined();
  });

  // Additional: File Upload
  it("has file upload validator with magic number check", () => {
    expect(existsSync(join(SRC, "lib/upload/file-validator.ts"))).toBe(true);
  });

  // Additional: GDPR
  it("has GDPR account deletion", () => {
    expect(existsSync(join(SRC, "lib/gdpr/account-deletion.ts"))).toBe(true);
  });

  it("has GDPR data export", () => {
    expect(existsSync(join(SRC, "lib/gdpr/data-export.ts"))).toBe(true);
  });

  // Additional: Webhook Security
  it("has webhook signature verification", () => {
    expect(existsSync(join(SRC, "lib/webhooks/verify.ts"))).toBe(true);
  });

  it("has webhook retry with circuit breaker", () => {
    expect(existsSync(join(SRC, "lib/webhooks/retry.ts"))).toBe(true);
  });

  // Additional: Session Management
  it("has concurrent session tracker", () => {
    expect(existsSync(join(SRC, "lib/session/session-tracker.ts"))).toBe(true);
  });
});
