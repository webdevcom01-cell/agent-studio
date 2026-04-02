import { describe, it, expect } from "vitest";
import {
  isVersionSupported,
  extractVersion,
  CURRENT_VERSION,
} from "../versioning";

describe("API Versioning", () => {
  it("current version is v1", () => {
    expect(CURRENT_VERSION).toBe("v1");
  });

  it("v1 is supported", () => {
    expect(isVersionSupported("v1")).toBe(true);
  });

  it("v2 is not supported", () => {
    expect(isVersionSupported("v2")).toBe(false);
  });

  it("extracts version from versioned path", () => {
    expect(extractVersion("/api/v1/agents")).toBe("v1");
    expect(extractVersion("/api/v1/agents/abc/chat")).toBe("v1");
  });

  it("returns null for unversioned path", () => {
    expect(extractVersion("/api/agents")).toBeNull();
    expect(extractVersion("/api/health")).toBeNull();
  });

  it("returns null for non-API path", () => {
    expect(extractVersion("/dashboard")).toBeNull();
  });
});
