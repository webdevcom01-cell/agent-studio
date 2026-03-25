import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateWithDNS = vi.hoisted(() => vi.fn());
const mockValidateExternal = vi.hoisted(() => vi.fn());

vi.mock("@/lib/utils/url-validation", () => ({
  validateExternalUrlWithDNS: mockValidateWithDNS,
  validateExternalUrl: mockValidateExternal,
}));

vi.mock("cheerio", () => ({
  load: vi.fn(() => {
    const $ = (selector: string) => ({
      text: () => (selector === "title" ? "Test Page" : "page content"),
      attr: () => "",
      each: () => {},
      remove: () => {},
    });
    $.load = vi.fn(() => $);
    return $;
  }),
}));

import { scrapeWebsite } from "../scraper";

function makeResponse(
  body: string,
  options: { status?: number; contentType?: string; location?: string } = {}
): Response {
  const { status = 200, contentType = "text/html", location } = options;
  const headers = new Headers({ "content-type": contentType });
  if (location) headers.set("location", location);
  return new Response(body, { status, headers });
}

const HTML_PAGE = "<html><head><title>Test</title></head><body>Content</body></html>";

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateWithDNS.mockResolvedValue({ valid: true });
  mockValidateExternal.mockReturnValue({ valid: true });
});

describe("scrapePage redirect handling", () => {
  it("fetches non-redirect URL normally", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""))
      .mockResolvedValueOnce(makeResponse(HTML_PAGE));

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://example.com", { maxPages: 1 });

    expect(result.pages).toHaveLength(1);
    const calls = fetchMock.mock.calls;
    const scrapeCall = calls.find(
      (c) => c[0] === "https://example.com" || c[0] === "https://example.com/"
    );
    expect(scrapeCall?.[1]).toHaveProperty("redirect", "manual");
  });

  it("follows redirect to valid external URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""))
      .mockResolvedValueOnce(
        makeResponse("", { status: 302, location: "https://new.example.com/page" })
      )
      .mockResolvedValueOnce(makeResponse(HTML_PAGE));

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://example.com", { maxPages: 1 });

    expect(result.pages).toHaveLength(1);
    expect(mockValidateWithDNS).toHaveBeenCalledWith("https://new.example.com/page");
  });

  it("blocks redirect to internal IP (127.0.0.1)", async () => {
    mockValidateWithDNS
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ valid: false, error: "Blocked destination" });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""))
      .mockResolvedValueOnce(
        makeResponse("", { status: 302, location: "http://127.0.0.1/admin" })
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://evil.com", { maxPages: 1 });

    expect(result.pages).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Redirect blocked");
  });

  it("blocks redirect to cloud metadata (169.254.169.254)", async () => {
    mockValidateWithDNS
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ valid: false, error: "Blocked destination" });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""))
      .mockResolvedValueOnce(
        makeResponse("", {
          status: 301,
          location: "http://169.254.169.254/latest/meta-data/",
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://evil.com", { maxPages: 1 });

    expect(result.errors[0].error).toContain("Redirect blocked");
  });

  it("blocks redirect chain deeper than 5 hops", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""));

    for (let i = 0; i < 7; i++) {
      fetchMock.mockResolvedValueOnce(
        makeResponse("", {
          status: 302,
          location: `https://example.com/hop${i + 1}`,
        })
      );
    }

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://example.com", { maxPages: 1 });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Too many redirects");
  });

  it("handles missing Location header on 302 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(""))
      .mockResolvedValueOnce(makeResponse("", { status: 302 }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeWebsite("https://example.com", { maxPages: 1 });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("missing Location header");
  });
});
