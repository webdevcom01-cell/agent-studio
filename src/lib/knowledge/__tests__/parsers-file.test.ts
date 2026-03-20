import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}));

import { parsePDF, parseDOCX, parseSource } from "../parsers";

describe("parsePDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text from valid PDF buffer", async () => {
    const pdfParse = (await import("pdf-parse")).default as ReturnType<
      typeof vi.fn
    >;
    pdfParse.mockResolvedValue({ text: "Hello from PDF" });

    const buffer = Buffer.from("fake-pdf-content");
    const result = await parsePDF(buffer);

    expect(result).toBe("Hello from PDF");
    expect(pdfParse).toHaveBeenCalledWith(buffer);
  });

  it("rejects buffer exceeding 10 MB", async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

    await expect(parsePDF(largeBuffer)).rejects.toThrow("exceeds 10 MB limit");
  });

  it("throws on empty extracted text", async () => {
    const pdfParse = (await import("pdf-parse")).default as ReturnType<
      typeof vi.fn
    >;
    pdfParse.mockResolvedValue({ text: "   " });

    const buffer = Buffer.from("fake-pdf");

    await expect(parsePDF(buffer)).rejects.toThrow(
      "PDF contains no extractable text"
    );
  });
});

describe("parseDOCX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text from valid DOCX buffer", async () => {
    const mammoth = await import("mammoth");
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: "Hello from DOCX",
    });

    const buffer = Buffer.from("fake-docx-content");
    const result = await parseDOCX(buffer);

    expect(result).toBe("Hello from DOCX");
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it("rejects buffer exceeding 10 MB", async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

    await expect(parseDOCX(largeBuffer)).rejects.toThrow(
      "exceeds 10 MB limit"
    );
  });

  it("throws on empty extracted text", async () => {
    const mammoth = await import("mammoth");
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: "  " });

    const buffer = Buffer.from("fake-docx");

    await expect(parseDOCX(buffer)).rejects.toThrow(
      "DOCX contains no extractable text"
    );
  });
});

describe("parseSource FILE routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes .pdf files to parsePDF", async () => {
    const pdfParse = (await import("pdf-parse")).default as ReturnType<
      typeof vi.fn
    >;
    pdfParse.mockResolvedValue({ text: "PDF content" });

    const result = await parseSource({
      type: "FILE",
      fileBuffer: Buffer.from("data"),
      fileName: "report.pdf",
    });

    expect(result).toBe("PDF content");
  });

  it("routes .docx files to parseDOCX", async () => {
    const mammoth = await import("mammoth");
    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: "DOCX content",
    });

    const result = await parseSource({
      type: "FILE",
      fileBuffer: Buffer.from("data"),
      fileName: "report.docx",
    });

    expect(result).toBe("DOCX content");
  });

  it("defaults to parsePDF when no extension", async () => {
    const pdfParse = (await import("pdf-parse")).default as ReturnType<
      typeof vi.fn
    >;
    pdfParse.mockResolvedValue({ text: "PDF fallback" });

    const result = await parseSource({
      type: "FILE",
      fileBuffer: Buffer.from("data"),
      fileName: "noext",
    });

    expect(result).toBe("PDF fallback");
  });

  it("throws on unsupported file extension", async () => {
    await expect(
      parseSource({
        type: "FILE",
        fileBuffer: Buffer.from("data"),
        fileName: "data.zip",
      })
    ).rejects.toThrow("Unsupported file type: .zip");
  });

  it("throws when file buffer is missing", async () => {
    await expect(
      parseSource({ type: "FILE", fileBuffer: null, fileName: "test.pdf" })
    ).rejects.toThrow("File buffer required");
  });
});
