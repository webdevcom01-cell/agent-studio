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

export async function parseExcel(buffer: Buffer, filename: string): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`);
  }

  const XLSX = await import("xlsx");
  const ext = getFileExtension(filename);
  const workbook = ext === ".csv"
    ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
    : XLSX.read(buffer, { type: "buffer" });

  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0]);
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;

    const dataRows = rows.map((row) =>
      `| ${headers.map((h) => String(row[h] ?? "")).join(" | ")} |`
    );

    parts.push(`## Sheet: ${sheetName}\n\n${headerRow}\n${separator}\n${dataRows.join("\n")}`);
  }

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
