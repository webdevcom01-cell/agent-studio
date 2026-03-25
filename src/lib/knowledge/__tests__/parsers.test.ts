import { describe, it, expect } from "vitest";
import { parseHTML, parseText } from "../parsers";

describe("parseHTML", () => {
  it("extracts text from HTML body", () => {
    const html = "<html><body><p>Hello world</p></body></html>";
    expect(parseHTML(html)).toBe("Hello world");
  });

  it("removes script tags", () => {
    const html =
      "<html><body><script>alert('x')</script><p>Content</p></body></html>";
    expect(parseHTML(html)).toBe("Content");
  });

  it("removes style tags", () => {
    const html =
      "<html><body><style>.x{color:red}</style><p>Visible</p></body></html>";
    expect(parseHTML(html)).toBe("Visible");
  });

  it("removes nav, footer, header", () => {
    const html =
      "<html><body><nav>Menu</nav><header>Head</header><main>Main content</main><footer>Foot</footer></body></html>";
    expect(parseHTML(html)).toBe("Main content");
  });

  it("collapses whitespace", () => {
    const html =
      "<html><body><p>  Hello   world  </p><p>  test  </p></body></html>";
    const result = parseHTML(html);
    expect(result).not.toContain("  ");
  });

  it("handles empty HTML", () => {
    expect(parseHTML("<html><body></body></html>")).toBe("");
  });
});

describe("parseText", () => {
  it("trims whitespace", () => {
    expect(parseText("  hello world  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(parseText("")).toBe("");
  });

  it("preserves internal content", () => {
    expect(parseText("line one\nline two")).toBe("line one\nline two");
  });
});
