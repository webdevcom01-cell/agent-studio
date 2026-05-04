import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGet,
  mockSet,
  mockDel,
  mockEval,
  mockScan,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDel: vi.fn(),
  mockEval: vi.fn(),
  mockScan: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    get: mockGet,
    set: mockSet,
    setex: vi.fn(),
    del: mockDel,
    eval: mockEval,
    scan: mockScan,
    quit: vi.fn().mockResolvedValue(undefined),
    status: "ready",
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

process.env.REDIS_URL = "redis://localhost:6379";

import {
  checkoutTask,
  renewCheckout,
  releaseCheckout,
  getCheckout,
  getAgentCheckouts,
  forceRelease,
} from "../atomic-checkout";
import { resetRedis } from "@/lib/redis";

beforeEach(() => {
  vi.clearAllMocks();
  resetRedis();
});

const makeStoredCheckout = (overrides: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    taskId: "task-1",
    agentId: "agent-1",
    sessionId: "session-1",
    checkedOutAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    ttlSeconds: 300,
    ...overrides,
  });

describe("checkoutTask", () => {
  it("calls redis.set with NX and EX flags", async () => {
    mockSet.mockResolvedValue("OK");

    await checkoutTask("task-1", "agent-1", "session-1", 300);

    expect(mockSet).toHaveBeenCalledWith(
      "task:lock:task-1",
      expect.any(String),
      "NX",
      "EX",
      300,
    );
  });

  it("returns TaskCheckout on success", async () => {
    mockSet.mockResolvedValue("OK");

    const result = await checkoutTask("task-1", "agent-1", "session-1", 300);

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe("task-1");
    expect(result?.agentId).toBe("agent-1");
    expect(result?.sessionId).toBe("session-1");
    expect(result?.ttlSeconds).toBe(300);
    expect(result?.checkedOutAt).toBeInstanceOf(Date);
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });

  it("returns null when already locked (redis.set returns null)", async () => {
    mockSet.mockResolvedValue(null);

    const result = await checkoutTask("task-1", "agent-1", "session-1");

    expect(result).toBeNull();
  });

  it("also writes to checkout index key", async () => {
    mockSet.mockResolvedValue("OK");

    await checkoutTask("task-1", "agent-1", "session-1", 120);

    expect(mockSet).toHaveBeenCalledWith(
      "task:checkout:agent-1:task-1",
      expect.any(String),
      "EX",
      120,
    );
  });
});

describe("renewCheckout", () => {
  it("returns false when lock not found (eval returns 0)", async () => {
    mockEval.mockResolvedValue(0);

    const result = await renewCheckout("task-1", "agent-1", "session-1");

    expect(result).toBe(false);
  });

  it("returns false when agentId doesn't match (eval returns 0)", async () => {
    mockEval.mockResolvedValue(0);

    const result = await renewCheckout("task-1", "wrong-agent", "session-1");

    expect(result).toBe(false);
  });

  it("returns true and calls eval with correct keys when owner renews", async () => {
    mockEval.mockResolvedValue(1);

    const result = await renewCheckout("task-1", "agent-1", "session-1", 600);

    expect(result).toBe(true);
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      "task:lock:task-1",
      "task:checkout:agent-1:task-1",
      "agent-1",
      "session-1",
      600,
    );
  });
});

describe("releaseCheckout", () => {
  it("calls redis.eval with Lua script and correct keys", async () => {
    mockEval.mockResolvedValue(1);

    await releaseCheckout("task-1", "agent-1", "session-1");

    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining("cjson.decode"),
      2,
      "task:lock:task-1",
      "task:checkout:agent-1:task-1",
      "agent-1",
      "session-1",
    );
  });

  it("returns true when lock released (eval returns 1)", async () => {
    mockEval.mockResolvedValue(1);

    const result = await releaseCheckout("task-1", "agent-1", "session-1");

    expect(result).toBe(true);
  });

  it("returns false when not owner (eval returns 0)", async () => {
    mockEval.mockResolvedValue(0);

    const result = await releaseCheckout("task-1", "wrong-agent", "session-1");

    expect(result).toBe(false);
  });
});

describe("getCheckout", () => {
  it("returns null when no lock exists", async () => {
    mockGet.mockResolvedValue(null);

    const result = await getCheckout("task-1");

    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("task:lock:task-1");
  });

  it("returns parsed TaskCheckout when lock exists", async () => {
    mockGet.mockResolvedValue(makeStoredCheckout());

    const result = await getCheckout("task-1");

    expect(result).not.toBeNull();
    expect(result?.taskId).toBe("task-1");
    expect(result?.agentId).toBe("agent-1");
    expect(result?.checkedOutAt).toBeInstanceOf(Date);
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });
});

describe("getAgentCheckouts", () => {
  it("returns empty array when no checkouts exist", async () => {
    mockScan.mockResolvedValue(["0", []]);

    const result = await getAgentCheckouts("agent-1");

    expect(result).toEqual([]);
  });

  it("returns all checkouts for an agent", async () => {
    mockScan.mockResolvedValue([
      "0",
      ["task:checkout:agent-1:task-1", "task:checkout:agent-1:task-2"],
    ]);
    mockGet
      .mockResolvedValueOnce(makeStoredCheckout({ taskId: "task-1" }))
      .mockResolvedValueOnce(makeStoredCheckout({ taskId: "task-2" }));

    const result = await getAgentCheckouts("agent-1");

    expect(result).toHaveLength(2);
    expect(result[0].agentId).toBe("agent-1");
  });
});

describe("forceRelease", () => {
  it("deletes both lock key and checkout index key", async () => {
    mockGet.mockResolvedValue(makeStoredCheckout());
    mockDel.mockResolvedValue(2);

    await forceRelease("task-1");

    expect(mockDel).toHaveBeenCalledWith(
      "task:lock:task-1",
      "task:checkout:agent-1:task-1",
    );
  });

  it("deletes only lock key when no checkout data parseable", async () => {
    mockGet.mockResolvedValue(null);
    mockDel.mockResolvedValue(1);

    await forceRelease("task-1");

    expect(mockDel).toHaveBeenCalledWith("task:lock:task-1");
  });

  it("returns true when key was deleted", async () => {
    mockGet.mockResolvedValue(makeStoredCheckout());
    mockDel.mockResolvedValue(2);

    const result = await forceRelease("task-1");

    expect(result).toBe(true);
  });

  it("returns false when no key existed", async () => {
    mockGet.mockResolvedValue(null);
    mockDel.mockResolvedValue(0);

    const result = await forceRelease("task-1");

    expect(result).toBe(false);
  });
});
