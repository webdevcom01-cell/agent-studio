import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "../url-validation";

describe("validateExternalUrl", () => {
  describe("allowed URLs", () => {
    it("allows https external URLs", () => {
      expect(validateExternalUrl("https://api.example.com")).toEqual({ valid: true });
    });

    it("allows http external URLs", () => {
      expect(validateExternalUrl("http://external-service.io/webhook")).toEqual({ valid: true });
    });

    it("allows URLs with paths and query params", () => {
      expect(validateExternalUrl("https://api.example.com/v1/data?key=abc")).toEqual({ valid: true });
    });
  });

  describe("blocked URLs", () => {
    it("blocks localhost", () => {
      const result = validateExternalUrl("http://localhost:3000");
      expect(result.valid).toBe(false);
    });

    it("blocks 127.0.0.1", () => {
      const result = validateExternalUrl("http://127.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks AWS metadata endpoint 169.254.169.254", () => {
      const result = validateExternalUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.valid).toBe(false);
    });

    it("blocks 10.x.x.x private range", () => {
      const result = validateExternalUrl("http://10.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks 192.168.x.x private range", () => {
      const result = validateExternalUrl("http://192.168.1.1");
      expect(result.valid).toBe(false);
    });

    it("blocks 172.16-31 private range", () => {
      const result = validateExternalUrl("http://172.16.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks IPv6 loopback [::1]", () => {
      const result = validateExternalUrl("http://[::1]");
      expect(result.valid).toBe(false);
    });

    it("blocks file:// protocol", () => {
      const result = validateExternalUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("blocks ftp:// protocol", () => {
      const result = validateExternalUrl("ftp://internal");
      expect(result.valid).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      const result = validateExternalUrl("http://0.0.0.0");
      expect(result.valid).toBe(false);
    });

    it("blocks invalid URL format", () => {
      const result = validateExternalUrl("not-a-url");
      expect(result.valid).toBe(false);
    });
  });
});
