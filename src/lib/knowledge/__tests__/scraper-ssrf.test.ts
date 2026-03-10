import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateWithDNS = vi.hoisted(() => vi.fn());
const mockValidateExternal = vi.hoisted(() => vi.fn());

vi.mock("@/lib/utils/url-validation", () => ({
  validateExternalUrlWithDNS: mockValidateWithDNS,
  validateExternalUrl: mockValidateExternal,
}));

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`;

const SITEMAP_WITH_INTERNAL = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/public</loc></url>
  <url><loc>http://169.254.169.254/latest/meta-data/</loc></url>
  <url><loc>http://127.0.0.1:8080/admin</loc></url>
  <url><loc>http://10.0.0.1/internal</loc></url>
  <url><loc>http://192.168.1.1/router</loc></url>
  <url><loc>http://172.16.0.1/private</loc></url>
</urlset>`;

import { parseSitemap } from "../scraper";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SITEMAP_XML),
    })
  );
});

describe("parseSitemap SSRF protection", () => {
  it("allows valid external sitemap URL", async () => {
    mockValidateWithDNS.mockResolvedValue({ valid: true });
    mockValidateExternal.mockReturnValue({ valid: true });

    const urls = await parseSitemap("https://example.com/sitemap.xml");

    expect(mockValidateWithDNS).toHaveBeenCalledWith("https://example.com/sitemap.xml");
    expect(urls).toEqual([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
  });

  it("rejects sitemap URL pointing to localhost", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    await expect(
      parseSitemap("http://127.0.0.1/sitemap.xml")
    ).rejects.toThrow("Sitemap URL not allowed: Blocked destination");
  });

  it("rejects sitemap URL pointing to cloud metadata (169.254.169.254)", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    await expect(
      parseSitemap("http://169.254.169.254/latest/meta-data/")
    ).rejects.toThrow("Sitemap URL not allowed");
  });

  it("rejects sitemap URL pointing to 10.x private range", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    await expect(
      parseSitemap("http://10.0.0.1/sitemap.xml")
    ).rejects.toThrow("Sitemap URL not allowed");
  });

  it("rejects sitemap URL pointing to 172.16.x private range", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    await expect(
      parseSitemap("http://172.16.0.1/sitemap.xml")
    ).rejects.toThrow("Sitemap URL not allowed");
  });

  it("rejects sitemap URL pointing to 192.168.x private range", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    await expect(
      parseSitemap("http://192.168.1.1/sitemap.xml")
    ).rejects.toThrow("Sitemap URL not allowed");
  });

  it("filters out internal URLs found inside sitemap XML", async () => {
    mockValidateWithDNS.mockResolvedValue({ valid: true });
    mockValidateExternal
      .mockReturnValueOnce({ valid: true })
      .mockReturnValueOnce({ valid: false, error: "Blocked destination" })
      .mockReturnValueOnce({ valid: false, error: "Blocked destination" })
      .mockReturnValueOnce({ valid: false, error: "Blocked destination" })
      .mockReturnValueOnce({ valid: false, error: "Blocked destination" })
      .mockReturnValueOnce({ valid: false, error: "Blocked destination" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SITEMAP_WITH_INTERNAL),
      })
    );

    const urls = await parseSitemap("https://example.com/sitemap.xml");

    expect(urls).toEqual(["https://example.com/public"]);
    expect(mockValidateExternal).toHaveBeenCalledTimes(6);
  });

  it("does not call fetch when URL validation fails", async () => {
    mockValidateWithDNS.mockResolvedValue({
      valid: false,
      error: "Blocked destination",
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      parseSitemap("http://127.0.0.1/sitemap.xml")
    ).rejects.toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
