/**
 * LSP Client — Phase F1
 *
 * Thin JSON-RPC 2.0 client that communicates with a language server via stdio.
 * Implements the minimum LSP surface needed for the lsp_query node:
 *   • initialize / initialized handshake (with 30s timeout)
 *   • textDocument/didOpen + operation + textDocument/didClose
 *   • hover, definition, completion, diagnostics (15s per operation)
 *   • shutdown / exit lifecycle
 *
 * No external npm package required — the JSON-RPC framing (Content-Length header)
 * is implemented directly.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { logger } from "@/lib/logger";
import type {
  LspLanguage,
  LspOperation,
  LspPosition,
  LspHoverResult,
  LspDefinitionResult,
  LspCompletionResult,
  LspDiagnosticsResult,
  LspOperationResult,
  LspServerConfig,
  LspDiagnostic,
} from "./types";
import { LSP_LANGUAGE_ID } from "./types";

// ─── Timeouts ─────────────────────────────────────────────────────────────────

export const INITIALIZE_TIMEOUT_MS = 30_000;
export const OPERATION_TIMEOUT_MS = 15_000;

// ─── JSON-RPC types ───────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Framing parser ───────────────────────────────────────────────────────────

/**
 * Stateful parser for the LSP stdio framing:
 *   Content-Length: N\r\n\r\n<N bytes of JSON>
 */
class LspFrameParser extends EventEmitter {
  private buffer = "";

  feed(chunk: string): void {
    this.buffer += chunk;
    this.flush();
  }

  private flush(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        // Malformed frame — discard up to separator
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const bodyLen = parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;

      if (this.buffer.length < bodyStart + bodyLen) break; // incomplete

      const body = this.buffer.slice(bodyStart, bodyStart + bodyLen);
      this.buffer = this.buffer.slice(bodyStart + bodyLen);

      try {
        const msg = JSON.parse(body) as JsonRpcResponse | JsonRpcNotification;
        this.emit("message", msg);
      } catch {
        logger.warn("LSP frame parse error", { body: body.slice(0, 200) });
      }
    }
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class LspClient {
  private proc: ChildProcess;
  private parser = new LspFrameParser();
  private pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private pendingDiagnostics = new Map<string, (d: LspDiagnostic[]) => void>();
  private nextId = 1;
  private _initialized = false;
  private _closed = false;

  readonly language: LspLanguage;

  constructor(config: LspServerConfig) {
    this.language = config.language;

    this.proc = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.proc.stdout?.setEncoding("utf8");
    this.proc.stdout?.on("data", (chunk: string) => this.parser.feed(chunk));
    this.proc.stderr?.on("data", (chunk: string) => {
      logger.warn("LSP stderr", { language: config.language, chunk: String(chunk).slice(0, 200) });
    });

    this.proc.on("exit", (code) => {
      this._closed = true;
      logger.info("LSP process exited", { language: config.language, code });
      // Reject all pending requests
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error("LSP process exited"));
      }
      this.pendingRequests.clear();
    });

    this.parser.on("message", (msg: JsonRpcResponse | JsonRpcNotification) => {
      this.handleMessage(msg);
    });
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get closed(): boolean {
    return this._closed;
  }

  // ─── Core JSON-RPC ─────────────────────────────────────────────────────────

  private send(msg: JsonRpcRequest | JsonRpcNotification): void {
    const body = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
    this.proc.stdin?.write(frame);
  }

  private request<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this._closed) {
        reject(new Error("LSP client is closed"));
        return;
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in msg && msg.id !== undefined) {
      // Response to a request
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result ?? null);
        }
      }
    } else if ("method" in msg) {
      // Notification from server
      this.handleNotification(msg as JsonRpcNotification);
    }
  }

  private handleNotification(notif: JsonRpcNotification): void {
    if (notif.method === "textDocument/publishDiagnostics") {
      const params = notif.params as { uri: string; diagnostics: LspDiagnostic[] };
      const cb = this.pendingDiagnostics.get(params.uri);
      if (cb) {
        this.pendingDiagnostics.delete(params.uri);
        cb(params.diagnostics);
      }
    }
  }

  // ─── LSP lifecycle ─────────────────────────────────────────────────────────

  async initialize(rootUri: string): Promise<void> {
    await this.request(
      "initialize",
      {
        processId: process.pid,
        rootUri,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ["plaintext"] },
            definition: {},
            completion: { completionItem: { snippetSupport: false } },
            publishDiagnostics: {},
          },
          workspace: { workspaceFolders: false },
        },
        initializationOptions: {},
      },
      INITIALIZE_TIMEOUT_MS,
    );

    this.notify("initialized", {});
    this._initialized = true;
    logger.info("LSP initialized", { language: this.language, rootUri });
  }

  async shutdown(): Promise<void> {
    if (this._closed) return;
    try {
      await this.request("shutdown", null, 5_000);
      this.notify("exit", null);
    } catch {
      // Best-effort
    } finally {
      this._closed = true;
      this.proc.kill();
    }
  }

  // ─── Document management ───────────────────────────────────────────────────

  didOpen(uri: string, languageId: string, text: string): void {
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  didClose(uri: string): void {
    this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  // ─── Operations ────────────────────────────────────────────────────────────

  async hover(uri: string, position: LspPosition): Promise<LspHoverResult | null> {
    const result = await this.request<{
      contents: { value?: string; kind?: string } | string | Array<string | { value: string }>;
      range?: unknown;
    } | null>("textDocument/hover", { textDocument: { uri }, position }, OPERATION_TIMEOUT_MS);

    if (!result) return null;

    let contents = "";
    if (typeof result.contents === "string") {
      contents = result.contents;
    } else if (Array.isArray(result.contents)) {
      contents = result.contents
        .map((c) => (typeof c === "string" ? c : c.value ?? ""))
        .join("\n");
    } else if (typeof result.contents === "object" && result.contents !== null) {
      contents = (result.contents as { value?: string }).value ?? "";
    }

    return { contents, range: result.range as LspHoverResult["range"] };
  }

  async definition(uri: string, position: LspPosition): Promise<LspDefinitionResult> {
    const result = await this.request<
      Array<{ uri: string; range: unknown }> | { uri: string; range: unknown } | null
    >("textDocument/definition", { textDocument: { uri }, position }, OPERATION_TIMEOUT_MS);

    if (!result) return { locations: [] };

    const locs = Array.isArray(result) ? result : [result];
    return {
      locations: locs.map((l) => ({ uri: l.uri, range: l.range as LspDefinitionResult["locations"][0]["range"] })),
    };
  }

  async completion(uri: string, position: LspPosition): Promise<LspCompletionResult> {
    const result = await this.request<{
      items?: Array<{ label: string; kind?: number; detail?: string; documentation?: string; insertText?: string }>;
      isIncomplete?: boolean;
    } | Array<{ label: string }> | null>(
      "textDocument/completion",
      { textDocument: { uri }, position, context: { triggerKind: 1 } },
      OPERATION_TIMEOUT_MS,
    );

    if (!result) return { items: [], isIncomplete: false };

    if (Array.isArray(result)) {
      return { items: result, isIncomplete: false };
    }

    return {
      items: result.items ?? [],
      isIncomplete: result.isIncomplete ?? false,
    };
  }

  async diagnostics(uri: string, timeoutMs = OPERATION_TIMEOUT_MS): Promise<LspDiagnosticsResult> {
    return new Promise<LspDiagnosticsResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDiagnostics.delete(uri);
        resolve({ diagnostics: [] });
      }, timeoutMs);

      this.pendingDiagnostics.set(uri, (diags) => {
        clearTimeout(timer);
        resolve({ diagnostics: diags });
      });
    });
  }

  // ─── High-level unified operation ──────────────────────────────────────────

  async executeOperation(
    operation: LspOperation,
    source: string,
    language: LspLanguage,
    line: number,
    character: number,
  ): Promise<LspOperationResult> {
    const uri = `file:///tmp/lsp-query-${Date.now()}.${language === "python" ? "py" : language === "javascript" ? "js" : "ts"}`;
    const languageId = LSP_LANGUAGE_ID[language];

    this.didOpen(uri, languageId, source);

    try {
      const position: LspPosition = { line, character };

      switch (operation) {
        case "hover":
          return (await this.hover(uri, position)) ?? { contents: "" };
        case "definition":
          return await this.definition(uri, position);
        case "completion":
          return await this.completion(uri, position);
        case "diagnostics":
          return await this.diagnostics(uri);
        default:
          return { contents: `Unknown operation: ${String(operation)}` };
      }
    } finally {
      this.didClose(uri);
    }
  }
}
