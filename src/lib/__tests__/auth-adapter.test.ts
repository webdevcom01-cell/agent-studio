import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { encrypt, decrypt } from "../crypto";

const VALID_KEY = randomBytes(32).toString("base64url");

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("OAuth token encryption", () => {
  const originalKey = process.env.OAUTH_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.OAUTH_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.OAUTH_ENCRYPTION_KEY;
    }
  });

  describe("encrypt/decrypt with OAUTH_ENCRYPTION_KEY", () => {
    beforeEach(() => {
      process.env.OAUTH_ENCRYPTION_KEY = VALID_KEY;
    });

    it("round-trips an access token", () => {
      const token = "ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const encrypted = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      expect(encrypted).not.toBe(token);
      expect(decrypt(encrypted, "OAUTH_ENCRYPTION_KEY")).toBe(token);
    });

    it("round-trips a refresh token", () => {
      const token = "1//0exxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxx";
      const encrypted = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      expect(decrypt(encrypted, "OAUTH_ENCRYPTION_KEY")).toBe(token);
    });

    it("round-trips a JWT id_token", () => {
      const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIn0.signature";
      const encrypted = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      expect(decrypt(encrypted, "OAUTH_ENCRYPTION_KEY")).toBe(token);
    });

    it("produces different ciphertexts for same token (random IV)", () => {
      const token = "ya29.access-token-value";
      const a = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      const b = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      expect(a).not.toBe(b);
    });

    it("rejects tampered ciphertext", () => {
      const token = "ya29.access-token";
      const encrypted = encrypt(token, "OAUTH_ENCRYPTION_KEY");
      const tampered = encrypted.slice(0, -2) + "xx";
      expect(() => decrypt(tampered, "OAUTH_ENCRYPTION_KEY")).toThrow();
    });
  });

  describe("key isolation", () => {
    it("OAUTH key cannot decrypt WEBHOOK data and vice versa", () => {
      const webhookKey = randomBytes(32).toString("base64url");
      const oauthKey = randomBytes(32).toString("base64url");

      process.env.WEBHOOK_ENCRYPTION_KEY = webhookKey;
      process.env.OAUTH_ENCRYPTION_KEY = oauthKey;

      const token = "test-token";
      const encryptedWithWebhook = encrypt(token, "WEBHOOK_ENCRYPTION_KEY");
      const encryptedWithOauth = encrypt(token, "OAUTH_ENCRYPTION_KEY");

      expect(decrypt(encryptedWithWebhook, "WEBHOOK_ENCRYPTION_KEY")).toBe(token);
      expect(decrypt(encryptedWithOauth, "OAUTH_ENCRYPTION_KEY")).toBe(token);

      expect(() => decrypt(encryptedWithWebhook, "OAUTH_ENCRYPTION_KEY")).toThrow();
      expect(() => decrypt(encryptedWithOauth, "WEBHOOK_ENCRYPTION_KEY")).toThrow();

      delete process.env.WEBHOOK_ENCRYPTION_KEY;
    });
  });

  describe("graceful degradation", () => {
    it("throws when OAUTH_ENCRYPTION_KEY is not set", () => {
      delete process.env.OAUTH_ENCRYPTION_KEY;
      expect(() => encrypt("token", "OAUTH_ENCRYPTION_KEY")).toThrow(
        /OAUTH_ENCRYPTION_KEY is not set/
      );
    });
  });

  describe("key rotation support", () => {
    it("tokens encrypted with old key fail to decrypt with new key", () => {
      process.env.OAUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
      const encrypted = encrypt("my-token", "OAUTH_ENCRYPTION_KEY");

      process.env.OAUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
      expect(() => decrypt(encrypted, "OAUTH_ENCRYPTION_KEY")).toThrow();
    });

    it("re-encryption with new key works after decrypt with old key", () => {
      const oldKey = randomBytes(32).toString("base64url");
      const newKey = randomBytes(32).toString("base64url");

      process.env.OAUTH_ENCRYPTION_KEY = oldKey;
      const encrypted = encrypt("my-token", "OAUTH_ENCRYPTION_KEY");
      const decrypted = decrypt(encrypted, "OAUTH_ENCRYPTION_KEY");

      process.env.OAUTH_ENCRYPTION_KEY = newKey;
      const reEncrypted = encrypt(decrypted, "OAUTH_ENCRYPTION_KEY");
      expect(decrypt(reEncrypted, "OAUTH_ENCRYPTION_KEY")).toBe("my-token");
    });
  });
});
