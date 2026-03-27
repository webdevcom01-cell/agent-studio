/**
 * Node.js worker_threads worker for Python execution.
 * Uses python3 subprocess to run user code safely.
 *
 * Message protocol (via parentPort):
 *   IN:  { id: string, code: string, variables: object, timeout: number, packages?: string[] }
 *   OUT: { id: string, success: bool, output: string, result: any, error?: string, plots: string[] }
 */

"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { parentPort } = require("worker_threads");
const { spawnSync } = require("child_process");

// Minimal Python wrapper script sent via stdin
// Reads { code, variables } as JSON from stdin, executes, returns JSON result to stdout
const PYTHON_WRAPPER = `
import sys, json, traceback, io, base64

def main():
    data = json.loads(sys.stdin.read())
    code = data['code']
    variables = data.get('variables', {})
    output_parts = []
    plots = []

    class _Capture(io.StringIO):
        def write(self, s):
            output_parts.append(s)
            return len(s)
        def flush(self):
            pass

    old_stdout = sys.stdout
    sys.stdout = _Capture()

    try:
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt

            def _capture_show(*args, **kwargs):
                buf = io.BytesIO()
                plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                buf.seek(0)
                plots.append('data:image/png;base64,' + base64.b64encode(buf.read()).decode())
                plt.clf()
                plt.close('all')

            plt.show = _capture_show
        except Exception:
            pass

        ns = dict(variables)
        exec(compile(code, '<python_code>', 'exec'), {'__builtins__': __builtins__}, ns)
        result = ns.get('result', None)

        try:
            json.dumps(result)
        except Exception:
            result = str(result)

        sys.stdout = old_stdout
        print(json.dumps({
            'success': True,
            'output': ''.join(output_parts),
            'result': result,
            'plots': plots,
        }))
    except Exception:
        sys.stdout = old_stdout
        print(json.dumps({
            'success': False,
            'output': ''.join(output_parts),
            'result': None,
            'error': traceback.format_exc(),
            'plots': plots,
        }))

main()
`;

// Safe environment for Python subprocess — strips all secrets
function buildSafeEnv() {
  return {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    LANG: "en_US.UTF-8",
  };
}

/** Packages installed in this worker session — avoids redundant pip calls. */
const installedNodePackages = new Set();

/**
 * Install pip packages before executing user code.
 * Silently skips packages already installed in this session.
 * Returns any install warnings as a string (does not throw).
 *
 * @param {string[]} packages
 * @returns {string} warning output (empty string if all OK)
 */
function installPipPackages(packages) {
  if (!packages || packages.length === 0) return "";

  const nameOnly = (pkg) => pkg.split(/[<>=!~]/)[0].toLowerCase().trim();
  const toInstall = packages.filter((p) => !installedNodePackages.has(nameOnly(p)));
  if (toInstall.length === 0) return "";

  const result = spawnSync(
    "pip3",
    ["install", "--quiet", "--user", "--no-warn-script-location", ...toInstall],
    {
      encoding: "utf8",
      timeout: 55_000, // 55s — handler gives 60s for package installs
      env: buildSafeEnv(),
    }
  );

  if (!result.error && result.status === 0) {
    toInstall.forEach((p) => installedNodePackages.add(nameOnly(p)));
    return "";
  }

  // Non-fatal: return a warning string that will be prepended to output
  const reason = result.error
    ? result.error.message
    : result.stderr || `pip3 exited with status ${result.status}`;
  return `[warn] Package install issues: ${reason.trim()}\n`;
}

parentPort.on("message", ({ id, code, variables, timeout = 10000, packages }) => {
  try {
    // Install additional packages first (if any)
    const installWarnings = installPipPackages(packages);

    const input = JSON.stringify({ code, variables: variables ?? {} });

    const result = spawnSync("python3", ["-c", PYTHON_WRAPPER], {
      input,
      encoding: "utf8",
      timeout,
      env: buildSafeEnv(),
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });

    if (result.error) {
      const isTimeout =
        result.error.code === "ETIMEDOUT" ||
        (result.error.message && result.error.message.includes("timed out"));
      parentPort.postMessage({
        id,
        success: false,
        output: "",
        result: null,
        error: isTimeout ? "Python execution timed out" : result.error.message,
        plots: [],
      });
      return;
    }

    if (result.status !== 0) {
      parentPort.postMessage({
        id,
        success: false,
        output: result.stdout || "",
        result: null,
        error: result.stderr || "Python process exited with non-zero status",
        plots: [],
      });
      return;
    }

    // Parse the JSON output from the Python wrapper
    const stdout = (result.stdout || "").trim();
    const lastLine = stdout.split("\n").pop() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      parentPort.postMessage({
        id,
        success: false,
        output: stdout,
        result: null,
        error: "Failed to parse Python output",
        plots: [],
      });
      return;
    }

    // Prepend any install warnings to the output
    if (installWarnings && parsed.output !== undefined) {
      parsed.output = installWarnings + parsed.output;
    }
    parentPort.postMessage({ id, ...parsed });
  } catch (err) {
    parentPort.postMessage({
      id,
      success: false,
      output: "",
      result: null,
      error: err instanceof Error ? err.message : String(err),
      plots: [],
    });
  }
});
