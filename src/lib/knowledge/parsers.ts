import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { validateExternalUrl } from "@/lib/utils/url-validation";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_URL_RESPONSE_SIZE = 5 * 1024 * 1024;

export async function parsePDF(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`);
  }

  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  const text = result.text?.trim();

  if (!text) throw new Error("PDF contains no extractable text");
  return text;
}

export async function parseDOCX(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`);
  }

  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim();

  if (!text) throw new Error("DOCX contains no extractable text");
  return text;
}

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function parseHTML(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export async function fetchAndParseURL(url: string): Promise<string> {
  const urlCheck = validateExternalUrl(url);
  if (!urlCheck.valid) {
    throw new Error("URL not allowed: blocked destination");
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "AgentStudio-KB/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);

  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_URL_RESPONSE_SIZE) {
    throw new Error(`Response too large (${(contentLength / 1024 / 1024).toFixed(1)} MB)`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (text.length > MAX_URL_RESPONSE_SIZE) throw new Error("Response too large");

  return contentType.includes("text/html") ? parseHTML(text) : text.trim();
}

// ── Excel cell value → string (handles all ExcelJS CellValue variants) ────────

function excelCellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Formula cell: { formula: "...", result: CellValue }
    if ("result" in obj) return excelCellToString(obj.result);
    // Rich text: { richText: [{ text: "..." }] }
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text: string }>).map((r) => r.text).join("").trim();
    }
    // Hyperlink: { text: "...", hyperlink: "..." }
    if ("text" in obj) return String(obj.text).trim();
    // Error value: { error: "#VALUE!" } — silently empty
    if ("error" in obj) return "";
  }
  return String(value);
}

// ── RFC-4180 CSV parser ────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCSVBuffer(buffer: Buffer): string {
  const lines = buffer.toString("utf-8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) throw new Error("CSV contains no data");

  const rows = lines.map(parseCSVLine);
  const headers = rows[0];
  if (!headers || headers.length === 0) throw new Error("CSV contains no data");

  const colCount = headers.length;
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.slice(1).map((row) => {
    const cells = Array.from({ length: colCount }, (_, i) => row[i] ?? "");
    return `| ${cells.join(" | ")} |`;
  });

  return `## Sheet: CSV\n\n${headerRow}\n${separator}\n${dataRows.join("\n")}`;
}

// ── parseExcel — uses ExcelJS (replaces SheetJS/xlsx, no security CVEs) ──────

export async function parseExcel(buffer: Buffer, filename: string): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`);
  }

  const ext = getFileExtension(filename);

  // CSV: pure text path, no binary parsing needed
  if (ext === ".csv") {
    return parseCSVBuffer(buffer);
  }

  // XLSX / XLS — ExcelJS binary parser
  const ExcelJSModule = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  // ExcelJS declares its own Buffer interface that conflicts with Node's generic Buffer<T>.
  // Extract the exact parameter type from the load() signature to satisfy TypeScript.
  type ExcelLoadBuffer = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer as unknown as ExcelLoadBuffer);

  const parts: string[] = [];

  workbook.eachSheet((worksheet) => {
    const allRows: string[][] = [];

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed; index 0 is always undefined
      const values = (row.values as unknown[]).slice(1);
      allRows.push(values.map(excelCellToString));
    });

    if (allRows.length === 0) return;

    const headers = allRows[0];
    const colCount = headers.length;
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const dataRows = allRows.slice(1).map((row) => {
      const cells = Array.from({ length: colCount }, (_, i) => row[i] ?? "");
      return `| ${cells.join(" | ")} |`;
    });

    parts.push(`## Sheet: ${worksheet.name}\n\n${headerRow}\n${separator}\n${dataRows.join("\n")}`);
  });

  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("Spreadsheet contains no data");
  return text;
}

export async function parsePPTX(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`);
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0", 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0", 10);
      return numA - numB;
    });

  const parts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const file = zip.files[slideFiles[i]];
    if (!file) continue;

    const xml = await file.async("text");
    const textRuns = xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [];
    const slideText = textRuns
      .map((tag) => tag.replace(/<\/?a:t>/g, "").trim())
      .filter(Boolean)
      .join(" ");

    if (slideText) {
      parts.push(`## Slide ${i + 1}\n\n${slideText}`);
    }
  }

  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("PPTX contains no extractable text");
  return text;
}

export function parseText(content: string): string {
  return content.trim();
}

export async function parseSource(source: {
  type: string;
  content?: string | null;
  url?: string | null;
  fileBuffer?: Buffer | null;
  fileName?: string | null;
}): Promise<string> {
  switch (source.type) {
    case "FILE": {
      if (!source.fileBuffer) throw new Error("File buffer required");
      const ext = getFileExtension(source.fileName ?? "");
      if (ext === ".docx") return parseDOCX(source.fileBuffer);
      if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") return parseExcel(source.fileBuffer, source.fileName ?? "file.xlsx");
      if (ext === ".pptx") return parsePPTX(source.fileBuffer);
      if (ext === ".pdf" || !ext) return parsePDF(source.fileBuffer);
      throw new Error(`Unsupported file type: ${ext}`);
    }
    case "URL":
      if (!source.url) throw new Error("URL required");
      return fetchAndParseURL(source.url);
    case "TEXT":
      if (!source.content) throw new Error("Content required");
      return parseText(source.content);
    case "SITEMAP":
      if (!source.url) throw new Error("URL required");
      return parseSitemapContent(source.url);
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

const MAX_SITEMAP_URLS = 50;
const SITEMAP_CONCURRENCY = 5;
const SITEMAP_TOTAL_TIMEOUT_MS = 120_000;

async function fetchWithConcurrency(
  urls: string[],
  fn: (url: string) => Promise<string>,
  limit: number,
): Promise<PromiseSettledResult<{ url: string; content: string }>[]> {
  const results: PromiseSettledResult<{ url: string; content: string }>[] = [];
  for (let i = 0; i < urls.length; i += limit) {
    const batch = urls.slice(i, i + limit);
    const batchResults = await Promise.allSettled(
      batch.map(async (url) => ({ url, content: await fn(url) })),
    );
    results.push(...batchResults);
  }
  return results;
}

async function parseSitemapContent(sitemapUrl: string): Promise<string> {
  const { parseSitemap } = await import("./scraper");
  const urls = await parseSitemap(sitemapUrl);

  if (urls.length > MAX_SITEMAP_URLS) {
    logger.warn("Sitemap truncated", { sitemapUrl, totalUrls: urls.length, limit: MAX_SITEMAP_URLS });
  }

  const trimmedUrls = urls.slice(0, MAX_SITEMAP_URLS);

  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Sitemap fetch timeout")), SITEMAP_TOTAL_TIMEOUT_MS);
  });

  const work = fetchWithConcurrency(trimmedUrls, fetchAndParseURL, SITEMAP_CONCURRENCY);

  let results: PromiseSettledResult<{ url: string; content: string }>[];
  try {
    results = await Promise.race([work, deadline]);
  } catch {
    logger.warn("Sitemap total timeout reached", { sitemapUrl });
    return "";
  }

  const contentParts: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      contentParts.push(`\n\n--- ${result.value.url} ---\n\n${result.value.content}`);
    } else {
      logger.error("Sitemap URL fetch failed", result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
    }
  }

  return contentParts.join("\n");
}

export async function parseWebsite(
  url: string,
  options?: { maxPages?: number; maxDepth?: number }
): Promise<string> {
  const { scrapeWebsite } = await import("./scraper");
  const result = await scrapeWebsite(url, options);

  if (result.pages.length === 0) throw new Error("No pages scraped");

  return result.pages
    .map((page) => `\n\n--- ${page.title || page.url} ---\n\n${page.content}`)
    .join("\n");
}
