/**
 * Isomorphic Python executor.
 *
 * - Browser:   Spawns a WebWorker backed by Pyodide (WASM, CDN-loaded).
 * - Node.js:   Spawns a worker_threads worker backed by python3 subprocess.
 *
 * Both paths share the same PythonRequest / PythonResponse contract.
 */

import type { PythonRequest, PythonResponse } from "./python-types";
import { logger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 10_000;

// ─── Browser path ─────────────────────────────────────────────────────────────

let browserWorker: Worker | null = null;
const browserPendingCalls = new Map<
  string,
  { resolve: (r: PythonResponse) => void; reject: (e: Error) => void }
>();

function getBrowserWorker(): Worker {
  if (browserWorker) return browserWorker;

  browserWorker = new Worker("/pyodide-worker.js");

  browserWorker.addEventListener("message", (event) => {
    const { type, id, ...rest } = event.data as {
      type: string;
      id: string;
      success?: boolean;
      output?: string;
      result?: unknown;
      error?: string;
      plots?: string[];
    };

    if (type === "result") {
      const pending = browserPendingCalls.get(id);
      if (pending) {
        browserPendingCalls.delete(id);
        pending.resolve({
          success: rest.success ?? false,
          output: rest.output ?? "",
          result: rest.result ?? null,
          error: rest.error,
          plots: rest.plots ?? [],
        });
      }
    }
    // "stdout" chunks are fired but not tracked here (streaming handler uses them)
  });

  browserWorker.addEventListener("error", (event) => {
    // Reject all pending calls on worker error
    for (const [, pending] of browserPendingCalls) {
      pending.reject(new Error(`Worker error: ${event.message}`));
    }
    browserPendingCalls.clear();
    browserWorker = null;
  });

  return browserWorker;
}

function executePythonBrowser(req: PythonRequest): Promise<PythonResponse> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = req.timeout ?? DEFAULT_TIMEOUT_MS;

    const timer = setTimeout(() => {
      browserPendingCalls.delete(id);
      reject(new Error("Python execution timed out"));
    }, timeout + 2000); // +2s buffer on top of worker timeout

    browserPendingCalls.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });

    const worker = getBrowserWorker();
    worker.postMessage({ type: "run", id, ...req, timeout });
  });
}

// ─── Node.js path ─────────────────────────────────────────────────────────────

interface NodeWorkerState {
  worker: import("worker_threads").Worker;
  busy: boolean;
  pending: Map<
    string,
    { resolve: (r: PythonResponse) => void; reject: (e: Error) => void }
  >;
}

let nodeWorkerState: NodeWorkerState | null = null;

async function getNodeWorker(): Promise<NodeWorkerState> {
  if (nodeWorkerState) return nodeWorkerState;

  const { Worker } = await import("worker_threads");
  const { resolve: resolvePath } = await import("path");
  const { fileURLToPath } = await import("url");
  const { dirname } = await import("path");

  // Resolve worker path relative to this file
  let workerPath: string;
  try {
    // ESM context
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    workerPath = resolvePath(__dirname, "workers/pyodide-node-worker.js");
  } catch {
    // CJS fallback
    workerPath = resolvePath(process.cwd(), "src/lib/runtime/workers/pyodide-node-worker.js");
  }

  const pending = new Map<
    string,
    { resolve: (r: PythonResponse) => void; reject: (e: Error) => void }
  >();

  const worker = new Worker(workerPath, {
    env: {}, // Worker itself uses a safe env, but we isolate at the subprocess level
  });

  const state: NodeWorkerState = { worker, busy: false, pending };

  worker.on(
    "message",
    (msg: { id: string } & Omit<PythonResponse, never>) => {
      const { id, ...rest } = msg;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(rest as PythonResponse);
      }
    }
  );

  worker.on("error", (err) => {
    for (const [, p] of pending) {
      p.reject(err);
    }
    pending.clear();
    nodeWorkerState = null;
  });

  worker.on("exit", () => {
    nodeWorkerState = null;
  });

  nodeWorkerState = state;
  return state;
}

async function executePythonNode(req: PythonRequest): Promise<PythonResponse> {
  let state: NodeWorkerState;
  try {
    state = await getNodeWorker();
  } catch (err) {
    logger.error("Failed to start Python worker", err);
    return {
      success: false,
      output: "",
      result: null,
      error: "Python worker unavailable: " + String(err),
      plots: [],
    };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeout = req.timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      resolve({
        success: false,
        output: "",
        result: null,
        error: "Python execution timed out",
        plots: [],
      });
    }, timeout + 3000);

    state.pending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        resolve({
          success: false,
          output: "",
          result: null,
          error: e.message,
          plots: [],
        });
      },
    });

    state.worker.postMessage({ id, ...req, timeout });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute Python code with the given variables.
 * Automatically chooses browser WebWorker or Node.js worker_threads depending on the runtime.
 */
export async function executePython(req: PythonRequest): Promise<PythonResponse> {
  if (typeof window !== "undefined") {
    return executePythonBrowser(req);
  }
  return executePythonNode(req);
}
