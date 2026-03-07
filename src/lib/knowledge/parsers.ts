import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";

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

async function parseSitemapContent(sitemapUrl: string): Promise<string> {
  const { parseSitemap } = await import("./scraper");
  const urls = await parseSitemap(sitemapUrl);
  const contentParts: string[] = [];

  for (const url of urls.slice(0, 50)) {
    try {
      const content = await fetchAndParseURL(url);
      contentParts.push(`\n\n--- ${url} ---\n\n${content}`);
    } catch (error) {
      logger.error("URL fetch failed", error, { url });
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
