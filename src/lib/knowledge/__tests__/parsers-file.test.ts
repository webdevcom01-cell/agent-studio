import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}));

// ── ExcelJS mock ──────────────────────────────────────────────────────────────
// We build a fake Workbook that lets tests push rows into sheets.
type FakeRow = { values: unknown[] };
type FakeSheet = { name: string; rows: FakeRow[] };

const _fakeSheets: FakeSheet[] = [];

vi.mock("exceljs", () => {
  class FakeWorkbook {
    // exceljs exposes workbook.xlsx.load(buffer)
    xlsx = {
      load: async (_buf: Buffer) => {
        // no-op: sheets pre-populated by tests via _fakeSheets
      },
    };
    eachSheet(cb: (ws: { name: string; eachRow: (opts: unknown, rowCb: (row: FakeRow) => void) => void }) => void) {
      for (const sheet of _fakeSheets) {
        cb({
          name: sheet.name,
          eachRow(_opts: unknown, rowCb: (row: FakeRow) => void) {
            for (const row of sheet.rows) rowCb(row);
          },
        });
      }
    }
  }
  return { Workbook: FakeWorkbook };
});

import { parsePDF, parseDOCX, parseExcel, parseSource } from "../parsers";

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

// ── parseExcel ────────────────────────────────────────────────────────────────

describe("parseExcel — CSV path (no exceljs)", () => {
  it("parses a simple CSV buffer into a markdown table", async () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = await parseExcel(Buffer.from(csv), "data.csv");
    expect(result).toContain("## Sheet: CSV");
    expect(result).toContain("| name | age |");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("| Alice | 30 |");
    expect(result).toContain("| Bob | 25 |");
  });

  it("handles quoted CSV fields with commas", async () => {
    const csv = 'city,info\n"London, UK",capital\nParis,capital';
    const result = await parseExcel(Buffer.from(csv), "cities.csv");
    expect(result).toContain("| London, UK | capital |");
    expect(result).toContain("| Paris | capital |");
  });

  it("throws when CSV is empty", async () => {
    await expect(parseExcel(Buffer.from("   "), "empty.csv")).rejects.toThrow(
      "CSV contains no data"
    );
  });

  it("rejects CSV buffer exceeding 10 MB", async () => {
    const large = Buffer.alloc(11 * 1024 * 1024, "a");
    await expect(parseExcel(large, "big.csv")).rejects.toThrow(
      "exceeds 10 MB limit"
    );
  });
});

describe("parseExcel — XLSX path (exceljs mock)", () => {
  beforeEach(() => {
    // Reset fake sheets before each test
    _fakeSheets.length = 0;
  });

  it("converts a single sheet with headers and rows to markdown", async () => {
    _fakeSheets.push({
      name: "Sales",
      rows: [
        { values: [undefined, "product", "revenue"] },
        { values: [undefined, "Widget", 1000] },
        { values: [undefined, "Gadget", 2500] },
      ],
    });

    const result = await parseExcel(Buffer.from("fake"), "report.xlsx");
    expect(result).toContain("## Sheet: Sales");
    expect(result).toContain("| product | revenue |");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("| Widget | 1000 |");
    expect(result).toContain("| Gadget | 2500 |");
  });

  it("renders multiple sheets separated by blank lines", async () => {
    _fakeSheets.push(
      {
        name: "Sheet1",
        rows: [
          { values: [undefined, "a", "b"] },
          { values: [undefined, "1", "2"] },
        ],
      },
      {
        name: "Sheet2",
        rows: [
          { values: [undefined, "x", "y"] },
          { values: [undefined, "3", "4"] },
        ],
      }
    );

    const result = await parseExcel(Buffer.from("fake"), "multi.xlsx");
    expect(result).toContain("## Sheet: Sheet1");
    expect(result).toContain("## Sheet: Sheet2");
    expect(result).toContain("| a | b |");
    expect(result).toContain("| x | y |");
  });

  it("skips empty sheets without throwing", async () => {
    _fakeSheets.push(
      { name: "Empty", rows: [] },
      {
        name: "Data",
        rows: [
          { values: [undefined, "col"] },
          { values: [undefined, "val"] },
        ],
      }
    );

    const result = await parseExcel(Buffer.from("fake"), "partial.xlsx");
    expect(result).not.toContain("## Sheet: Empty");
    expect(result).toContain("## Sheet: Data");
  });

  it("throws when all sheets are empty", async () => {
    _fakeSheets.push({ name: "Empty", rows: [] });
    await expect(parseExcel(Buffer.from("fake"), "empty.xlsx")).rejects.toThrow(
      "Spreadsheet contains no data"
    );
  });

  it("handles formula cells (result field)", async () => {
    _fakeSheets.push({
      name: "Formulas",
      rows: [
        { values: [undefined, "label", "value"] },
        { values: [undefined, "Sum", { formula: "=A1+A2", result: 42 }] },
      ],
    });

    const result = await parseExcel(Buffer.from("fake"), "formulas.xlsx");
    expect(result).toContain("| Sum | 42 |");
  });

  it("handles rich text cells", async () => {
    _fakeSheets.push({
      name: "RichText",
      rows: [
        { values: [undefined, "title"] },
        {
          values: [
            undefined,
            { richText: [{ text: "Hello " }, { text: "World" }] },
          ],
        },
      ],
    });

    const result = await parseExcel(Buffer.from("fake"), "rich.xlsx");
    expect(result).toContain("| Hello World |");
  });

  it("handles date cells as ISO date strings", async () => {
    _fakeSheets.push({
      name: "Dates",
      rows: [
        { values: [undefined, "date"] },
        { values: [undefined, new Date("2024-06-15T00:00:00.000Z")] },
      ],
    });

    const result = await parseExcel(Buffer.from("fake"), "dates.xlsx");
    expect(result).toContain("| 2024-06-15 |");
  });

  it("rejects XLSX buffer exceeding 10 MB", async () => {
    const large = Buffer.alloc(11 * 1024 * 1024, 0);
    await expect(parseExcel(large, "big.xlsx")).rejects.toThrow(
      "exceeds 10 MB limit"
    );
  });
});

describe("parseSource FILE routing — xlsx/xls/csv", () => {
  beforeEach(() => {
    _fakeSheets.length = 0;
    vi.clearAllMocks();
  });

  it("routes .xlsx files to parseExcel", async () => {
    _fakeSheets.push({
      name: "Sheet1",
      rows: [
        { values: [undefined, "col"] },
        { values: [undefined, "val"] },
      ],
    });

    const result = await parseSource({
      type: "FILE",
      fileBuffer: Buffer.from("fake"),
      fileName: "data.xlsx",
    });

    expect(result).toContain("## Sheet: Sheet1");
  });

  it("routes .csv files to parseExcel (CSV path)", async () => {
    const csv = "name\nAlice";
    const result = await parseSource({
      type: "FILE",
      fileBuffer: Buffer.from(csv),
      fileName: "list.csv",
    });

    expect(result).toContain("## Sheet: CSV");
    expect(result).toContain("| name |");
  });
});
