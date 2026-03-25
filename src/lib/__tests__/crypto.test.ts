import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncryptionConfigured } from "../crypto";
import { randomBytes } from "crypto";

const VALID_KEY = randomBytes(32).toString("base64url");

describe("crypto", () => {
  const originalEnv = process.env.WEBHOOK_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WEBHOOK_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.WEBHOOK_ENCRYPTION_KEY;
    }
  });

  describe("encrypt / decrypt", () => {
    beforeEach(() => {
      process.env.WEBHOOK_ENCRYPTION_KEY = VALID_KEY;
    });

    it("round-trips a short string", () => {
      const secret = "test-webhook-secret-abc123";
      const encrypted = encrypt(secret);
      expect(encrypted).not.toBe(secret);
      expect(decrypt(encrypted)).toBe(secret);
    });

    it("round-trips an empty string", () => {
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });

    it("round-trips a long string", () => {
      const secret = "x".repeat(1000);
      const encrypted = encrypt(secret);
      expect(decrypt(encrypted)).toBe(secret);
    });

    it("round-trips unicode content", () => {
      const secret = "Привет мир 🔐 שלום";
      const encrypted = encrypt(secret);
      expect(decrypt(encrypted)).toBe(secret);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const secret = "same-secret";
      const a = encrypt(secret);
      const b = encrypt(secret);
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe(secret);
      expect(decrypt(b)).toBe(secret);
    });

    it("rejects tampered ciphertext", () => {
      const encrypted = encrypt("test-secret");
      const tampered = encrypted.slice(0, -2) + "xx";
      expect(() => decrypt(tampered)).toThrow();
    });

    it("rejects ciphertext encrypted with a different key", () => {
      const encrypted = encrypt("test-secret");
      process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
      expect(() => decrypt(encrypted)).toThrow();
    });

    it("throws when data is too short", () => {
      expect(() => decrypt("dG9vc2hvcnQ")).toThrow(/too short/);
    });
  });

  describe("encrypt — missing key", () => {
    it("throws when WEBHOOK_ENCRYPTION_KEY is not set", () => {
      delete process.env.WEBHOOK_ENCRYPTION_KEY;
      expect(() => encrypt("test")).toThrow(/WEBHOOK_ENCRYPTION_KEY is not set/);
    });

    it("throws when key is wrong length", () => {
      process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(16).toString("base64url");
      expect(() => encrypt("test")).toThrow(/must be exactly 32 bytes/);
    });
  });

  describe("isEncryptionConfigured", () => {
    it("returns true when valid key is set", () => {
      process.env.WEBHOOK_ENCRYPTION_KEY = VALID_KEY;
      expect(isEncryptionConfigured()).toBe(true);
    });

    it("returns false when key is not set", () => {
      delete process.env.WEBHOOK_ENCRYPTION_KEY;
      expect(isEncryptionConfigured()).toBe(false);
    });

    it("returns false when key is empty", () => {
      process.env.WEBHOOK_ENCRYPTION_KEY = "";
      expect(isEncryptionConfigured()).toBe(false);
    });

    it("returns false when key is wrong length", () => {
      process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(16).toString("base64url");
      expect(isEncryptionConfigured()).toBe(false);
    });
  });
});
