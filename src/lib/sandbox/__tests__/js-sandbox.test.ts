/**
 * F7-1 tests: JS sandbox must be fail-closed (no vm), E2B-isolated.
 *
 * (a) no E2B key → REFUSED (error set, no Sandbox created) — never vm.
 * (b) vm-escape PoC is never executed in-process — it goes to E2B, and with
 *     no key it is refused (fail-closed), proving the vm path is gone.
 * (c) with E2B key → routes through Sandbox.runCode (isolated).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunCode = vi.hoisted(() => vi.fn());
const mockKill = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: { create: mockCreate },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { executeJS } from "../js-sandbox";

const ESCAPE_POC = `this.constructor.constructor("return process")().env`;

describe("F7-1: JS sandbox fail-closed isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockCreate.mockResolvedValue({ runCode: mockRunCode, kill: mockKill });
    mockRunCode.mockResolvedValue({
      logs: { stdout: ["ok"], stderr: [] },
      results: [{ isMainResult: true, text: "42" }],
      error: undefined,
    });
  });

  it("(a) no E2B key → REFUSED, no Sandbox created (never vm)", async () => {
    vi.stubEnv("E2B_API_KEY", "");
    const r = await executeJS("1 + 1");
    expect(r.error).toMatch(/E2B sandbox is not configured/);
    expect(r.result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("(b) vm-escape PoC with no E2B key → refused, not executed in-process", async () => {
    vi.stubEnv("E2B_API_KEY", "");
    const r = await executeJS(ESCAPE_POC);
    expect(r.error).toMatch(/fail-closed/);
    expect(mockCreate).not.toHaveBeenCalled();
    // If this had run in vm, r.result would leak process.env — assert it did not
    expect(r.result).toBeNull();
  });

  it("(c) with E2B key → routes through E2B Sandbox.runCode (isolated)", async () => {
    vi.stubEnv("E2B_API_KEY", "e2b_key_xyz");
    const r = await executeJS("return 40 + 2", { x: 5 });
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockRunCode).toHaveBeenCalledOnce();
    expect(mockRunCode.mock.calls[0][1]).toMatchObject({ language: "js" });
    // variables injected as prelude, not as host objects
    expect(mockRunCode.mock.calls[0][0]).toContain("const x = 5;");
    expect(r.error).toBeNull();
    expect(r.stdout).toBe("ok");
    expect(mockKill).toHaveBeenCalledOnce();
  });

  it("(c2) E2B execution error surfaces as error, sandbox still killed", async () => {
    vi.stubEnv("E2B_API_KEY", "e2b_key_xyz");
    mockRunCode.mockResolvedValue({
      logs: { stdout: [], stderr: ["boom"] },
      results: [],
      error: { name: "ReferenceError", value: "process is not defined" },
    });
    const r = await executeJS(ESCAPE_POC);
    expect(r.error).toMatch(/ReferenceError: process is not defined/);
    expect(mockKill).toHaveBeenCalledOnce();
  });
});
