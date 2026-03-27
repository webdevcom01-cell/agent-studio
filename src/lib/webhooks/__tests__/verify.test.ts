import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  verifyWebhookSignature,
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
} from "../verify";
import { randomBytes } from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET = "test-secret-32-bytes-long-abcdef";
const BODY = JSON.stringify({ event: "push", repo: "agent-studio" });
const MSG_ID = "msg_01jtest123456";

function makeTimestamp(offsetSeconds = 0): string {
  return String(Math.floor(Date.now() / 1000) + offsetSeconds);
}

function makeSignature(id: string, timestamp: string, body: string, secret: string): string {
  const base = `${id}.${timestamp}.${body}`;
  const raw = createHmac("sha256", secret).update(base).digest("base64");
  return `v1,${raw}`;
}

function makeHeaders(
  id = MSG_ID,
  timestamp = makeTimestamp(),
  body = BODY,
  secret = SECRET
): Record<string, string> {
  return {
    "x-webhook-id": id,
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": makeSignature(id, timestamp, body, secret),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  describe("valid requests", () => {
    it("returns valid=true for a correctly signed request", () => {
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts fallback header names (webhook-id instead of x-webhook-id)", () => {
      const ts = makeTimestamp();
      const sig = makeSignature(MSG_ID, ts, BODY, SECRET);
      const headers = {
        "webhook-id": MSG_ID,
        "webhook-timestamp": ts,
        "webhook-signature": sig,
      };
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("accepts header names in any case", () => {
      const ts = makeTimestamp();
      const sig = makeSignature(MSG_ID, ts, BODY, SECRET);
      const headers = {
        "X-Webhook-Id": MSG_ID,
        "X-Webhook-Timestamp": ts,
        "X-Webhook-Signature": sig,
      };
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("accepts multiple signatures (rotation support) — first matches", () => {
      const ts = makeTimestamp();
      const goodSig = makeSignature(MSG_ID, ts, BODY, SECRET);
      const badSig = "v1,invalidsignaturexxxxxx";
      const headers = {
        "x-webhook-id": MSG_ID,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": `${badSig} ${goodSig}`,
      };
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("accepts timestamps within the 5-minute window (4 min old)", () => {
      const ts = makeTimestamp(-240); // 4 minutes ago
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(true);
    });
  });

  describe("missing headers", () => {
    it("rejects when x-webhook-id is missing", () => {
      const ts = makeTimestamp();
      const { "x-webhook-id": _id, ...headers } = makeHeaders(MSG_ID, ts);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing x-webhook-id/i);
    });

    it("rejects when x-webhook-timestamp is missing", () => {
      const ts = makeTimestamp();
      const { "x-webhook-timestamp": _ts, ...headers } = makeHeaders(MSG_ID, ts);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing x-webhook-timestamp/i);
    });

    it("rejects when x-webhook-signature is missing", () => {
      const ts = makeTimestamp();
      const { "x-webhook-signature": _sig, ...headers } = makeHeaders(MSG_ID, ts);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing x-webhook-signature/i);
    });
  });

  describe("signature mismatch", () => {
    it("rejects a tampered body", () => {
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const tamperedBody = JSON.stringify({ event: "push", repo: "malicious" });
      const result = verifyWebhookSignature(tamperedBody, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/signature mismatch/i);
    });

    it("rejects a wrong secret", () => {
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const result = verifyWebhookSignature(BODY, headers, "wrong-secret");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/signature mismatch/i);
    });

    it("rejects a completely invalid signature string", () => {
      const ts = makeTimestamp();
      const headers = {
        "x-webhook-id": MSG_ID,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": "not-a-signature",
      };
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
    });
  });

  describe("replay attack prevention", () => {
    it("rejects timestamps older than 5 minutes", () => {
      const ts = makeTimestamp(-310); // 5 min 10 sec ago
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timestamp too old/i);
    });

    it("rejects future timestamps beyond the window", () => {
      const ts = makeTimestamp(310); // 5 min 10 sec in the future
      const headers = makeHeaders(MSG_ID, ts, BODY, SECRET);
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timestamp too old/i);
    });

    it("rejects non-numeric timestamps", () => {
      const headers = {
        "x-webhook-id": MSG_ID,
        "x-webhook-timestamp": "not-a-number",
        "x-webhook-signature": "v1,somesig",
      };
      const result = verifyWebhookSignature(BODY, headers, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid.*timestamp/i);
    });
  });

  describe("edge cases", () => {
    it("works with an empty body string", () => {
      const emptyBody = "";
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, emptyBody, SECRET);
      const result = verifyWebhookSignature(emptyBody, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("works with a large JSON body", () => {
      const bigBody = JSON.stringify({ data: "x".repeat(10_000) });
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, bigBody, SECRET);
      const result = verifyWebhookSignature(bigBody, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("works with Unicode / non-ASCII body content", () => {
      const unicodeBody = JSON.stringify({ message: "Привет мир 🎉 שלום" });
      const ts = makeTimestamp();
      const headers = makeHeaders(MSG_ID, ts, unicodeBody, SECRET);
      const result = verifyWebhookSignature(unicodeBody, headers, SECRET);
      expect(result.valid).toBe(true);
    });
  });
});

describe("generateWebhookSecret", () => {
  it("returns a non-empty string", () => {
    const secret = generateWebhookSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("returns a URL-safe base64 string (no +, /, = characters)", () => {
    const secret = generateWebhookSecret();
    expect(secret).not.toMatch(/[+/=]/);
  });

  it("generates unique secrets on every call", () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateWebhookSecret()));
    expect(secrets.size).toBe(20);
  });

  it("generates secrets of appropriate length (43 chars for 32 bytes base64url)", () => {
    const secret = generateWebhookSecret();
    expect(secret.length).toBe(43);
  });
});

describe("encryptWebhookSecret / decryptWebhookSecret", () => {
  const originalKey = process.env.WEBHOOK_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.WEBHOOK_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.WEBHOOK_ENCRYPTION_KEY;
    }
  });

  it("returns plaintext when encryption is not configured", () => {
    delete process.env.WEBHOOK_ENCRYPTION_KEY;
    const secret = "my-webhook-secret";
    const { encrypted, isEncrypted } = encryptWebhookSecret(secret);
    expect(encrypted).toBe(secret);
    expect(isEncrypted).toBe(false);
  });

  it("encrypts when encryption key is configured", () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    const secret = "my-webhook-secret";
    const { encrypted, isEncrypted } = encryptWebhookSecret(secret);
    expect(encrypted).not.toBe(secret);
    expect(isEncrypted).toBe(true);
  });

  it("decryptWebhookSecret returns plaintext for non-encrypted secrets", () => {
    const secret = "plaintext-secret";
    expect(decryptWebhookSecret(secret, false)).toBe(secret);
  });

  it("decryptWebhookSecret decrypts encrypted secrets", () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    const secret = "my-webhook-secret";
    const { encrypted } = encryptWebhookSecret(secret);
    expect(decryptWebhookSecret(encrypted, true)).toBe(secret);
  });

  it("full round-trip: generate → encrypt → decrypt → verify signature", () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    const secret = generateWebhookSecret();
    const { encrypted, isEncrypted } = encryptWebhookSecret(secret);
    const decrypted = decryptWebhookSecret(encrypted, isEncrypted);

    const ts = makeTimestamp();
    const headers = makeHeaders(MSG_ID, ts, BODY, decrypted);
    const result = verifyWebhookSignature(BODY, headers, decrypted);
    expect(result.valid).toBe(true);
  });
});
