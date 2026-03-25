import { describe, it, expect } from "vitest";
import { parseBodyWithLimit, BodyTooLargeError, InvalidJsonError } from "../body-limit";

function makeRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseBodyWithLimit", () => {
  it("parses valid JSON body successfully", async () => {
    const data = { message: "hello" };
    const result = await parseBodyWithLimit(makeRequest(JSON.stringify(data)));
    expect(result).toEqual(data);
  });

  it("accepts body at exactly the limit", async () => {
    const payload = JSON.stringify({ data: "x".repeat(50) });
    const limit = new TextEncoder().encode(payload).byteLength;
    const result = await parseBodyWithLimit(makeRequest(payload), limit);
    expect(result).toEqual({ data: "x".repeat(50) });
  });

  it("rejects body exceeding limit with BodyTooLargeError", async () => {
    const payload = JSON.stringify({ data: "x".repeat(1000) });

    await expect(
      parseBodyWithLimit(makeRequest(payload), 10)
    ).rejects.toThrow(BodyTooLargeError);
  });

  it("rejects invalid JSON with InvalidJsonError", async () => {
    await expect(
      parseBodyWithLimit(makeRequest("not json {{{"))
    ).rejects.toThrow(InvalidJsonError);
  });

  it("rejects empty body with InvalidJsonError", async () => {
    await expect(
      parseBodyWithLimit(makeRequest(""))
    ).rejects.toThrow(InvalidJsonError);
  });

  it("uses default 1MB limit when not specified", async () => {
    const smallPayload = JSON.stringify({ ok: true });
    const result = await parseBodyWithLimit(makeRequest(smallPayload));
    expect(result).toEqual({ ok: true });
  });

  it("error message includes byte limit", async () => {
    try {
      await parseBodyWithLimit(makeRequest("x".repeat(200)), 100);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("100");
    }
  });
});
