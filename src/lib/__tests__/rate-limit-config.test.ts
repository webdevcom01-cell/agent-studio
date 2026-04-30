import { describe, it, expect } from "vitest";
import { getEndpointLimit, categorizeEndpoint } from "../rate-limit-config";

describe("getEndpointLimit", () => {
  it("returns strict limits for auth", () => {
    const limit = getEndpointLimit("auth:login");
    expect(limit.maxRequests).toBe(5);
  });

  it("returns moderate limits for chat", () => {
    const limit = getEndpointLimit("chat");
    expect(limit.maxRequests).toBe(30);
  });

  it("returns restrictive limits for upload", () => {
    const limit = getEndpointLimit("upload");
    expect(limit.maxRequests).toBe(10);
  });

  it("returns default for unknown category", () => {
    const limit = getEndpointLimit("unknown_endpoint");
    expect(limit.maxRequests).toBe(20);
  });

  it("returns 1/day for export", () => {
    const limit = getEndpointLimit("export");
    expect(limit.maxRequests).toBe(1);
    expect(limit.windowMs).toBe(86_400_000);
  });

  it("returns restrictive limits for pipeline", () => {
    const limit = getEndpointLimit("pipeline");
    expect(limit.maxRequests).toBe(5);
    expect(limit.windowMs).toBe(60_000);
  });
});

describe("categorizeEndpoint", () => {
  it("categorizes chat endpoint", () => {
    expect(categorizeEndpoint("/api/agents/abc/chat")).toBe("chat");
  });

  it("categorizes upload endpoint", () => {
    expect(categorizeEndpoint("/api/agents/abc/knowledge/sources/upload")).toBe("upload");
  });

  it("categorizes webhook trigger", () => {
    expect(categorizeEndpoint("/api/agents/abc/trigger/wh-123")).toBe("webhook");
  });

  it("categorizes auth endpoint", () => {
    expect(categorizeEndpoint("/api/auth/callback/github")).toBe("auth:login");
  });

  it("categorizes admin endpoint", () => {
    expect(categorizeEndpoint("/api/admin/jobs")).toBe("admin");
  });

  it("categorizes pipeline endpoint", () => {
    expect(categorizeEndpoint("/api/agents/abc/pipelines")).toBe("pipeline");
  });

  it("falls back to default", () => {
    expect(categorizeEndpoint("/api/health")).toBe("default");
  });
});
