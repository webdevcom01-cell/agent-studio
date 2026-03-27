/** Request payload sent to the Python executor (browser WebWorker or Node.js worker). */
export interface PythonRequest {
  code: string;
  variables: Record<string, unknown>;
  timeout?: number; // ms, default 10000
  /** Additional pip/micropip packages to install before execution (one per entry) */
  packages?: string[];
}

/** Response returned from the Python executor. */
export interface PythonResponse {
  success: boolean;
  /** Captured stdout from the execution */
  output: string;
  /** Value of `result` variable set in user code, or last expression */
  result: unknown;
  /** Error message if success=false */
  error?: string;
  /** Base64-encoded PNG data URLs for any matplotlib plots */
  plots: string[];
}
