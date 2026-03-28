import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { executeQuery } from "@/lib/database/query-executor";

const DEFAULT_OUTPUT_VARIABLE = "query_result";

/**
 * database_query — Direct SQL queries against Postgres, MySQL, or SQLite.
 * Supports parameterized queries, read-only mode, row limits, and timeouts.
 */
export const databaseQueryHandler: NodeHandler = async (node, context) => {
  const dbType = (node.data.dbType as string) ?? "postgres";
  const connectionString = resolveTemplate(
    (node.data.connectionString as string) ?? "",
    context.variables,
  );
  const query = (node.data.query as string) ?? "";
  const rawParams = (node.data.params as unknown[]) ?? [];
  const readOnly = (node.data.readOnly as boolean) ?? true;
  const maxRows =
    (node.data.maxRows as number) ??
    Number(process.env.DATABASE_QUERY_MAX_ROWS ?? "1000");
  const timeoutMs =
    Number(process.env.DATABASE_QUERY_TIMEOUT_MS ?? "10000");
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (!query) {
    return {
      messages: [
        { role: "assistant", content: "Database Query node has no SQL query configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (!connectionString) {
    return {
      messages: [
        { role: "assistant", content: "Database Query node has no connection string." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const params = rawParams.map((p) =>
    typeof p === "string" ? resolveTemplate(p, context.variables) : p,
  );

  try {
    const result = await executeQuery({
      dbType,
      connectionString,
      query,
      params,
      readOnly,
      maxRows,
      timeoutMs,
      variables: context.variables,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: result,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};
