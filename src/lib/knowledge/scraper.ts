import * as cheerio from "cheerio";

const MAX_PAGES_DEFAULT = 20;
const MAX_DEPTH_DEFAULT = 3;
const DELAY_MS_DEFAULT = 500;
const TIMEOUT_MS = 15000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export interface ScrapeOptions {
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
}

export interface ScrapeResult {
  pages: ScrapedPage[];
  errors: Array<{ url: string; error: string }>;
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/$/, "");
    }
    return parsed.href.toLowerCase();
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  const baseDomain = new URL(baseUrl).hostname;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized) return;
    try {
      const linkUrl = new URL(normalized);
      if (linkUrl.hostname === baseDomain && linkUrl.protocol.startsWith("http")) {
        links.push(normalized);
      }
    } catch { /* skip */ }
  });

  return links;
}

function extractContent(html: string): { title: string; content: string } {
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || $('meta[property="og:title"]').attr("content") || "";
  $("script, style, nav, footer, header, noscript, iframe").remove();

  let content = $("body").text();
  const mainSelectors = ["main", "article", '[role="main"]', ".content", "#content"];
  for (const selector of mainSelectors) {
    const mainContent = $(selector).text();
    if (mainContent.length > content.length * 0.3) {
      content = mainContent;
      break;
    }
  }

  return { title, content: content.replace(/\s+/g, " ").trim() };
}

async function fetchRobotsTxt(baseUrl: string): Promise<string[]> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).href;
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": "AgentStudio-KB/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];

    const text = await response.text();
    const disallowedPaths: string[] = [];
    const lines = text.split("\n");
    let isRelevantUserAgent = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("User-agent:")) {
        const agent = trimmed.substring(11).trim();
        isRelevantUserAgent = agent === "*";
      } else if (isRelevantUserAgent && trimmed.startsWith("Disallow:")) {
        const path = trimmed.substring(9).trim();
        if (path) disallowedPaths.push(path);
      }
    }
    return disallowedPaths;
  } catch {
    return [];
  }
}

function isAllowed(url: string, disallowedPaths: string[]): boolean {
  if (disallowedPaths.length === 0) return true;
  try {
    const { pathname } = new URL(url);
    return !disallowedPaths.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

interface ScrapedPageInternal extends ScrapedPage {
  html: string;
}

async function scrapePage(url: string): Promise<ScrapedPageInternal> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AgentStudio-KB/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error(`Unsupported: ${contentType}`);

  const html = await response.text();
  if (html.length > MAX_RESPONSE_SIZE) throw new Error("Response too large");

  const { title, content } = extractContent(html);
  return { url, title, content, html };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeWebsite(
  seedUrl: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const maxPages = options.maxPages ?? MAX_PAGES_DEFAULT;
  const maxDepth = options.maxDepth ?? MAX_DEPTH_DEFAULT;
  const delayMs = options.delayMs ?? DELAY_MS_DEFAULT;

  const pages: ScrapedPage[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];

  const normalizedSeed = normalizeUrl(seedUrl, seedUrl);
  if (!normalizedSeed) throw new Error("Invalid seed URL");

  const disallowedPaths = await fetchRobotsTxt(normalizedSeed);
  queue.push({ url: normalizedSeed, depth: 0 });
  visited.add(normalizedSeed);

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (!isAllowed(url, disallowedPaths)) continue;

    try {
      const { html, ...page } = await scrapePage(url);
      pages.push(page);

      if (depth < maxDepth) {
        const links = extractLinks(html, url);
        for (const link of links) {
          if (!visited.has(link) && pages.length + queue.length < maxPages) {
            visited.add(link);
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      if (queue.length > 0) await delay(delayMs);
    } catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return { pages, errors };
}

export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  const response = await fetch(sitemapUrl, {
    headers: { "User-Agent": "AgentStudio-KB/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];

  $("url > loc").each((_, el) => {
    const url = $(el).text().trim();
    if (url) urls.push(url);
  });

  if (urls.length === 0) {
    $("sitemap > loc").each((_, el) => {
      const url = $(el).text().trim();
      if (url) urls.push(url);
    });
  }

  return urls;
}
