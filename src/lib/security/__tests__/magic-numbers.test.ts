import { describe, it, expect } from "vitest";
import { validateMagicBytes } from "../magic-numbers";

describe("validateMagicBytes", () => {
  it("accepts a valid PDF buffer", () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(validateMagicBytes(buf, ".pdf")).toEqual({ valid: true });
  });

  it("rejects a PDF extension with PK (ZIP) bytes", () => {
    const buf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00]);
    const result = validateMagicBytes(buf, ".pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("File content does not match declared type");
  });

  it("accepts CSV regardless of content (no signature required)", () => {
    const buf = Buffer.from("name,email\nfoo,bar\n");
    expect(validateMagicBytes(buf, ".csv")).toEqual({ valid: true });
  });

  it("accepts XLSX buffer with PK header", () => {
    const buf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14]);
    expect(validateMagicBytes(buf, ".xlsx")).toEqual({ valid: true });
  });

  it("rejects buffer shorter than signature", () => {
    const buf = Buffer.from([0x25, 0x50]);
    const result = validateMagicBytes(buf, ".pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("File too small to validate");
  });

  it("accepts XLS buffer with D0CF header", () => {
    const buf = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1]);
    expect(validateMagicBytes(buf, ".xls")).toEqual({ valid: true });
  });

  it("returns valid for unknown extension not in signatures map", () => {
    const buf = Buffer.from("anything");
    expect(validateMagicBytes(buf, ".txt")).toEqual({ valid: true });
  });
});
