import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCheckoutTask,
  mockReleaseCheckout,
  mockGetAgentCheckouts,
} = vi.hoisted(() => ({
  mockCheckoutTask: vi.fn(),
  mockReleaseCheckout: vi.fn(),
  mockGetAgentCheckouts: vi.fn(),
}));

vi.mock("../atomic-checkout", () => ({
  checkoutTask: mockCheckoutTask,
  releaseCheckout: mockReleaseCheckout,
  getAgentCheckouts: mockGetAgentCheckouts,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { distributeTask, releaseAllAgentTasks } from "../swarm-coordinator";

const makeCheckout = (agentId: string, taskId = "task-1") => ({
  taskId,
  agentId,
  sessionId: "session-1",
  checkedOutAt: new Date(),
  expiresAt: new Date(Date.now() + 300_000),
  ttlSeconds: 300,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("distributeTask", () => {
  it("returns first successful checkout", async () => {
    const checkout = makeCheckout("agent-1");
    mockCheckoutTask.mockResolvedValue(checkout);

    const result = await distributeTask("task-1", ["agent-1", "agent-2"], "session-1");

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("agent-1");
    expect(result?.checkout).toBe(checkout);
    expect(mockCheckoutTask).toHaveBeenCalledTimes(1);
  });

  it("tries next agent when first fails", async () => {
    const checkout = makeCheckout("agent-2");
    mockCheckoutTask
      .mockResolvedValueOnce(null)   // agent-1 fails
      .mockResolvedValueOnce(checkout); // agent-2 succeeds

    const result = await distributeTask("task-1", ["agent-1", "agent-2"], "session-1");

    expect(result?.agentId).toBe("agent-2");
    expect(mockCheckoutTask).toHaveBeenCalledTimes(2);
  });

  it("returns null when all agents fail", async () => {
    mockCheckoutTask.mockResolvedValue(null);

    const result = await distributeTask("task-1", ["agent-1", "agent-2", "agent-3"], "session-1");

    expect(result).toBeNull();
    expect(mockCheckoutTask).toHaveBeenCalledTimes(3);
  });

  it("returns null for empty agent list", async () => {
    const result = await distributeTask("task-1", [], "session-1");

    expect(result).toBeNull();
    expect(mockCheckoutTask).not.toHaveBeenCalled();
  });

  it("passes ttlSeconds to checkoutTask", async () => {
    const checkout = makeCheckout("agent-1");
    mockCheckoutTask.mockResolvedValue(checkout);

    await distributeTask("task-1", ["agent-1"], "session-1", 600);

    expect(mockCheckoutTask).toHaveBeenCalledWith("task-1", "agent-1", "session-1", 600);
  });
});

describe("releaseAllAgentTasks", () => {
  it("calls releaseCheckout for each agent checkout with matching sessionId", async () => {
    mockGetAgentCheckouts.mockResolvedValue([
      makeCheckout("agent-1", "task-1"),
      makeCheckout("agent-1", "task-2"),
    ]);
    mockReleaseCheckout.mockResolvedValue(true);

    const count = await releaseAllAgentTasks("agent-1", "session-1");

    expect(count).toBe(2);
    expect(mockReleaseCheckout).toHaveBeenCalledTimes(2);
    expect(mockReleaseCheckout).toHaveBeenCalledWith("task-1", "agent-1", "session-1");
    expect(mockReleaseCheckout).toHaveBeenCalledWith("task-2", "agent-1", "session-1");
  });

  it("skips checkouts with a different sessionId", async () => {
    mockGetAgentCheckouts.mockResolvedValue([
      { ...makeCheckout("agent-1", "task-1"), sessionId: "other-session" },
      makeCheckout("agent-1", "task-2"),
    ]);
    mockReleaseCheckout.mockResolvedValue(true);

    const count = await releaseAllAgentTasks("agent-1", "session-1");

    expect(count).toBe(1);
    expect(mockReleaseCheckout).toHaveBeenCalledOnce();
  });

  it("returns 0 when no checkouts exist", async () => {
    mockGetAgentCheckouts.mockResolvedValue([]);

    const count = await releaseAllAgentTasks("agent-1", "session-1");

    expect(count).toBe(0);
    expect(mockReleaseCheckout).not.toHaveBeenCalled();
  });

  it("counts only successfully released locks", async () => {
    mockGetAgentCheckouts.mockResolvedValue([
      makeCheckout("agent-1", "task-1"),
      makeCheckout("agent-1", "task-2"),
    ]);
    mockReleaseCheckout
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false); // second release fails (already expired)

    const count = await releaseAllAgentTasks("agent-1", "session-1");

    expect(count).toBe(1);
  });
});
