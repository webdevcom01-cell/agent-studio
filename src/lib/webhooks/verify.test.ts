/**
 * Tests for webhook signature verification functions.
 * Covers Standard Webhooks spec, GitHub HMAC-SHA256, and GitLab plaintext token.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  verifyWebhookSignature,
  verifyGitHubSignature,
  verifyGitLabToken,
  generateWebhookSecret,
} from "./verify";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeStandardHeaders(msgId: string, timestamp: string, secret: string, body: string) {
  const toSign = `${msgId}.${timestamp}.${body}`;
  const hmac = createHmac("sha256", secret).update(toSign).digest("base64");
  return {
    "x-webhook-id": msgId,
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": `v1,${hmac}`,
  };
}

function makeGitHubHeaders(body: string, secret: string) {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return { "x-hub-signature-256": `sha256=${hex}` };
}

const NOW_SECONDS = String(Math.floor(Date.now() / 1000));
const SECRET = "test-secret-key-12345";
const BODY = JSON.stringify({ action: "opened", number: 42 });

// ─── verifyWebhookSignature (Standard Webhooks) ───────────────────────────────

describe("verifyWebhookSignature", () => {
  it("returns valid:true for a correct Standard Webhooks signature", () => {
    const headers = makeStandardHeaders("msg-001", NOW_SECONDS, SECRET, BODY);
    expect(verifyWebhookSignature(BODY, headers, SECRET).valid).toBe(true);
  });

  it("returns valid:false for wrong secret", () => {
    const headers = makeStandardHeaders("msg-001", NOW_SECONDS, SECRET, BODY);
    expect(verifyWebhookSignature(BODY, headers, "wrong-secret").valid).toBe(false);
  });

  it("returns valid:false for a tampered body", () => {
    const headers = makeStandardHeaders("msg-001", NOW_SECONDS, SECRET, BODY);
    const tamperedBody = JSON.stringify({ action: "deleted" });
    expect(verifyWebhookSignature(tamperedBody, headers, SECRET).valid).toBe(false);
  });

  it("returns valid:false for a missing x-webhook-id header", () => {
    const headers = makeStandardHeaders("msg-001", NOW_SECONDS, SECRET, BODY);
    const { "x-webhook-id": _, ...headersWithout } = headers;
    const result = verifyWebhookSignature(BODY, headersWithout, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("x-webhook-id");
  });

  it("returns valid:false for a timestamp too far in the past", () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400); // > 5 min ago
    const headers = makeStandardHeaders("msg-001", oldTimestamp, SECRET, BODY);
    const result = verifyWebhookSignature(BODY, headers, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("timestamp too old");
  });
});

// ─── verifyGitHubSignature ────────────────────────────────────────────────────

describe("verifyGitHubSignature", () => {
  it("returns valid:true for a correct GitHub sha256 signature", () => {
    const headers = makeGitHubHeaders(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, headers, SECRET).valid).toBe(true);
  });

  it("returns valid:false for wrong secret", () => {
    const headers = makeGitHubHeaders(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, headers, "wrong-secret").valid).toBe(false);
  });

  it("returns valid:false for tampered body", () => {
    const headers = makeGitHubHeaders(BODY, SECRET);
    expect(verifyGitHubSignature("tampered", headers, SECRET).valid).toBe(false);
  });

  it("returns valid:false when header is missing", () => {
    const result = verifyGitHubSignature(BODY, {}, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("x-hub-signature-256");
  });

  it("returns valid:false when header is missing sha256= prefix", () => {
    const headers = { "x-hub-signature-256": "abc123" }; // no sha256= prefix
    const result = verifyGitHubSignature(BODY, headers, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sha256=");
  });

  it("does NOT require x-webhook-id or x-webhook-timestamp (GitHub doesn't send them)", () => {
    const headers = makeGitHubHeaders(BODY, SECRET);
    // No Standard Webhooks headers — should still pass
    expect(verifyGitHubSignature(BODY, headers, SECRET).valid).toBe(true);
  });

  it("is case-insensitive for the header name", () => {
    const hex = createHmac("sha256", SECRET).update(BODY).digest("hex");
    const headers = { "X-Hub-Signature-256": `sha256=${hex}` }; // uppercase
    // Our getHeader normalises to lowercase so this should work
    expect(verifyGitHubSignature(BODY, headers, SECRET).valid).toBe(true);
  });
});

// ─── verifyGitLabToken ────────────────────────────────────────────────────────

describe("verifyGitLabToken", () => {
  it("returns valid:true for a matching plaintext token", () => {
    const headers = { "x-gitlab-token": SECRET };
    expect(verifyGitLabToken(headers, SECRET).valid).toBe(true);
  });

  it("returns valid:false for a wrong token", () => {
    const headers = { "x-gitlab-token": "wrong-token" };
    expect(verifyGitLabToken(headers, SECRET).valid).toBe(false);
  });

  it("returns valid:false when header is missing", () => {
    const result = verifyGitLabToken({}, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("X-Gitlab-Token");
  });

  it("is case-insensitive for the header name", () => {
    const headers = { "X-Gitlab-Token": SECRET }; // mixed case
    expect(verifyGitLabToken(headers, SECRET).valid).toBe(true);
  });

  it("does NOT check the request body (GitLab does not HMAC-sign the body)", () => {
    // Same token, totally different body — should still pass
    const headers = { "x-gitlab-token": SECRET };
    const _tamperedBody = "completely-different-content";
    // verifyGitLabToken doesn't even take a body parameter
    expect(verifyGitLabToken(headers, SECRET).valid).toBe(true);
  });
});

// ─── generateWebhookSecret ────────────────────────────────────────────────────

describe("generateWebhookSecret", () => {
  it("generates a non-empty string", () => {
    expect(generateWebhookSecret().length).toBeGreaterThan(0);
  });

  it("generates unique secrets", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toBe(b);
  });

  it("generates URL-safe base64 (no +, /, or = padding)", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
