import type { NodeHandler, ExecutionResult } from "../types";

const DEFAULT_OUTPUT_VARIABLE = "aggregate_result";
const DEFAULT_TIMEOUT_MS = 30_000;

interface BranchInput {
  id: string;
  value: unknown;
}

/**
 * aggregate — Advanced merge node supporting wait_all, wait_first, wait_n, and custom strategies.
 * Unlike parallel (which always waits for all), aggregate handles race conditions and partial results.
 */
export const aggregateHandler: NodeHandler = async (node, context) => {
  const strategy = (node.data.strategy as string) ?? "wait_all";
  const waitN = (node.data.waitN as number) ?? 1;
  const timeoutMs =
    ((node.data.timeout as number) ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;
  const mergeMode = (node.data.mergeMode as string) ?? "concat";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  // Collect branch inputs from context variables
  const branchInputs = collectBranchInputs(node.data, context.variables);

  if (branchInputs.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Aggregate: no branch inputs found.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const promises = branchInputs.map((branch) =>
      resolveBranchValue(branch, timeoutMs),
    );

    let results: PromiseSettledResult<BranchInput>[];

    switch (strategy) {
      case "wait_first": {
        const first = await raceWithTimeout(promises, timeoutMs);
        results = first
          ? [{ status: "fulfilled" as const, value: first }]
          : [{ status: "rejected" as const, reason: new Error("All branches failed or timed out") }];
        break;
      }

      case "wait_n": {
        const n = Math.min(waitN, promises.length);
        results = await waitForN(promises, n, timeoutMs);
        break;
      }

      case "wait_all":
      default:
        results = await Promise.allSettled(promises);
        break;
    }

    const fulfilled = results
      .filter(
        (r): r is PromiseSettledResult<BranchInput> & { status: "fulfilled" } =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    const failed = results.filter((r) => r.status === "rejected").length;

    const merged = mergeBranches(fulfilled, mergeMode);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: merged,
        [`${outputVariable}_count`]: fulfilled.length,
        [`${outputVariable}_failed`]: failed,
        [`${outputVariable}_strategy`]: strategy,
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

function collectBranchInputs(
  data: Record<string, unknown>,
  variables: Record<string, unknown>,
): BranchInput[] {
  const branchVars = (data.branchVariables as string[]) ?? [];
  return branchVars
    .filter((name) => name in variables)
    .map((name) => ({ id: name, value: variables[name] }));
}

async function resolveBranchValue(
  branch: BranchInput,
  _timeoutMs: number,
): Promise<BranchInput> {
  // Branch values are already resolved in context.variables by upstream nodes
  if (
    typeof branch.value === "string" &&
    branch.value.startsWith("[Error:")
  ) {
    throw new Error(`Branch "${branch.id}" failed: ${branch.value}`);
  }
  return branch;
}

async function raceWithTimeout(
  promises: Promise<BranchInput>[],
  timeoutMs: number,
): Promise<BranchInput | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs),
  );

  const settled = promises.map((p) =>
    p.then((v) => v).catch(() => null),
  );

  return Promise.race([...settled, timeout]);
}

async function waitForN(
  promises: Promise<BranchInput>[],
  n: number,
  timeoutMs: number,
): Promise<PromiseSettledResult<BranchInput>[]> {
  return new Promise((resolve) => {
    const results: PromiseSettledResult<BranchInput>[] = [];
    let resolved = 0;
    let completed = 0;

    const timer = setTimeout(() => {
      resolve(results);
    }, timeoutMs);

    for (const promise of promises) {
      promise
        .then((value) => {
          results.push({ status: "fulfilled", value });
          resolved++;
          completed++;
          if (resolved >= n) {
            clearTimeout(timer);
            resolve(results);
          }
        })
        .catch((reason: unknown) => {
          results.push({ status: "rejected", reason });
          completed++;
          if (completed >= promises.length) {
            clearTimeout(timer);
            resolve(results);
          }
        });
    }
  });
}

function mergeBranches(
  branches: BranchInput[],
  mode: string,
): unknown {
  if (branches.length === 0) return null;

  switch (mode) {
    case "first":
      return branches[0].value;

    case "last":
      return branches[branches.length - 1].value;

    case "concat": {
      const values = branches.map((b) => {
        if (typeof b.value === "string") return b.value;
        return JSON.stringify(b.value);
      });
      return values.join("\n");
    }

    case "object": {
      const merged: Record<string, unknown> = {};
      for (const branch of branches) {
        merged[branch.id] = branch.value;
      }
      return merged;
    }

    default:
      return branches.map((b) => b.value);
  }
}
