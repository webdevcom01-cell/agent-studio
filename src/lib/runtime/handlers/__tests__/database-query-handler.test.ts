import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteQuery = vi.fn();

vi.mock("@/lib/database/query-executor", () => ({
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
}));

import { databaseQueryHandler } from "../database-query-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "db-1",
    type: "database_query",
    position: { x: 0, y: 0 },
    data: {
      dbType: "postgres",
      connectionString: "postgresql://user:pass@localhost:5432/testdb",
      query: "SELECT * FROM users WHERE id = $1",
      params: ["123"],
      readOnly: true,
      maxRows: 1000,
      outputVariable: "query_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "db-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("databaseQueryHandler", () => {
  it("returns error when query is empty", async () => {
    const result = await databaseQueryHandler(
      makeNode({ query: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no SQL query");
  });

  it("returns error when connection string is empty", async () => {
    const result = await databaseQueryHandler(
      makeNode({ connectionString: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no connection string");
  });

  it("executes query and returns formatted result", async () => {
    mockExecuteQuery.mockResolvedValueOnce({
      rows: [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }],
      rowCount: 2,
      columns: ["id", "name"],
      executionTimeMs: 15,
    });

    const result = await databaseQueryHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.query_result as Record<string, unknown>;
    expect(output.rowCount).toBe(2);
    expect(output.columns).toEqual(["id", "name"]);
    expect(output.executionTimeMs).toBe(15);
  });

  it("passes readOnly flag to executor", async () => {
    mockExecuteQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      columns: [],
      executionTimeMs: 5,
    });

    await databaseQueryHandler(makeNode({ readOnly: true }), makeContext());
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true }),
    );
  });

  it("rejects write operations in read-only mode", async () => {
    mockExecuteQuery.mockRejectedValueOnce(
      new Error("Write operations are blocked in read-only mode"),
    );

    const result = await databaseQueryHandler(
      makeNode({ query: "DELETE FROM users" }),
      makeContext(),
    );
    expect(result.updatedVariables?.query_result).toContain("[Error:");
  });

  it("handles query timeout gracefully", async () => {
    mockExecuteQuery.mockRejectedValueOnce(
      new Error("Query timed out after 10000ms"),
    );

    const result = await databaseQueryHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.query_result).toContain("[Error:");
    expect(result.updatedVariables?.query_result).toContain("timed out");
  });
});
