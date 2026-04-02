import { describe, it, expect } from "vitest";
import { validateFileUpload } from "../file-validator";

describe("validateFileUpload", () => {
  it("accepts valid PDF", () => {
    const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const result = validateFileUpload(pdfHeader, "doc.pdf", "application/pdf");
    expect(result.valid).toBe(true);
  });

  it("rejects PDF with wrong magic number", () => {
    const fakeFile = Buffer.from("not a real pdf content");
    const result = validateFileUpload(fakeFile, "malicious.pdf", "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("magic number");
  });

  it("rejects file exceeding size limit", () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    const result = validateFileUpload(bigBuffer, "big.pdf", "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("limit");
  });

  it("rejects disallowed MIME type", () => {
    const buffer = Buffer.from("test");
    const result = validateFileUpload(buffer, "script.exe", "application/x-executable");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("rejects extension mismatch", () => {
    const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const result = validateFileUpload(pdfHeader, "renamed.txt", "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("does not match");
  });

  it("accepts text file without magic number check", () => {
    const buffer = Buffer.from("Hello world");
    const result = validateFileUpload(buffer, "notes.txt", "text/plain");
    expect(result.valid).toBe(true);
  });

  it("accepts valid DOCX (ZIP magic)", () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const result = validateFileUpload(
      zipHeader,
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.valid).toBe(true);
  });
});
