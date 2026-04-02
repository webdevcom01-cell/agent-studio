import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendEmail } from "../client";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
});

describe("sendEmail", () => {
  it("sends email successfully", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "msg-1" }, error: null });

    const result = await sendEmail({
      to: "user@test.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Test",
        html: "<p>Hello</p>",
      }),
    );
  });

  it("returns false when Resend returns error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await sendEmail({
      to: "user@test.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
  });

  it("returns false when RESEND_API_KEY is not set", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendEmail({
      to: "user@test.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("catches network errors gracefully", async () => {
    mockSend.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await sendEmail({
      to: "user@test.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result).toBe(false);
  });

  it("uses default from address when RESEND_FROM_EMAIL not set", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "msg-2" }, error: null });

    await sendEmail({
      to: "user@test.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining("Agent Studio"),
      }),
    );
  });
});
