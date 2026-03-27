/**
 * Browser WebWorker for Pyodide Python execution.
 * Loaded from /pyodide-worker.js and communicated via postMessage.
 *
 * Message protocol:
 *   IN:  { type: "run", id: string, code: string, variables: object, timeout: number, packages?: string[] }
 *   OUT: { type: "result", id: string, success: bool, output: string, result: any, error?: string, plots: string[] }
 *   OUT: { type: "stdout", id: string, text: string }  (streaming stdout lines)
 */

/* global importScripts, loadPyodide */

let pyodideReady = null;
let pyodide = null;

/**
 * Pyodide built-in packages that can be loaded via loadPackage() (no micropip needed).
 * Source: https://pyodide.org/en/stable/usage/packages-in-pyodide.html
 */
const PYODIDE_BUILTINS = new Set([
  "numpy", "pandas", "matplotlib", "scipy", "scikit-learn",
  "seaborn", "sympy", "pillow", "statsmodels", "networkx",
  "sqlalchemy", "pyyaml", "lxml", "beautifulsoup4", "regex",
  "cryptography", "pytz", "six", "attrs", "packaging",
]);

/** Track packages already installed in this worker session (avoids redundant installs). */
const installedPackages = new Set(["numpy", "pandas"]);

async function initPyodide() {
  if (pyodide) return pyodide;
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.3/full/pyodide.js");
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.3/full/",
    stdout: (text) => {
      // Forward stdout lines to main thread
      self.postMessage({ type: "stdout", text });
    },
    stderr: (text) => {
      self.postMessage({ type: "stdout", text: "[stderr] " + text });
    },
  });
  // Pre-load numpy and pandas (they're bundled with pyodide)
  await pyodide.loadPackage(["numpy", "pandas"]);
  return pyodide;
}

// Kick off init immediately
pyodideReady = initPyodide();

/**
 * Install additional packages into the Pyodide runtime.
 * Uses loadPackage() for Pyodide built-ins, micropip.install() for pure-Python PyPI packages.
 * Packages already installed in this session are skipped.
 *
 * @param {object} py - Pyodide instance
 * @param {string[]} packages - package names (may include version specifiers like "scipy>=1.10")
 */
async function installPackages(py, packages) {
  if (!packages || packages.length === 0) return;

  // Strip version specifiers to check against the builtins set
  const nameOnly = (pkg) => pkg.split(/[<>=!~]/)[0].toLowerCase().trim();

  const builtins = packages.filter(
    (p) => PYODIDE_BUILTINS.has(nameOnly(p)) && !installedPackages.has(nameOnly(p))
  );
  const pypiPkgs = packages.filter(
    (p) => !PYODIDE_BUILTINS.has(nameOnly(p)) && !installedPackages.has(nameOnly(p))
  );

  if (builtins.length > 0) {
    self.postMessage({ type: "stdout", text: `[setup] Loading packages: ${builtins.join(", ")}\n` });
    await py.loadPackage(builtins);
    builtins.forEach((p) => installedPackages.add(nameOnly(p)));
  }

  if (pypiPkgs.length > 0) {
    self.postMessage({ type: "stdout", text: `[setup] Installing via micropip: ${pypiPkgs.join(", ")}\n` });
    await py.loadPackage("micropip");
    const micropip = py.pyimport("micropip");
    for (const pkg of pypiPkgs) {
      try {
        await micropip.install(pkg);
        installedPackages.add(nameOnly(pkg));
        self.postMessage({ type: "stdout", text: `[setup] Installed ${pkg}\n` });
      } catch (err) {
        self.postMessage({
          type: "stdout",
          text: `[warn] Could not install ${pkg}: ${err.message || String(err)}\n`,
        });
      }
    }
  }
}

// Python wrapper that captures output and plots
const WRAPPER_CODE = `
import sys, json, traceback, io, base64

def _execute_user_code(user_code, variables_json):
    variables = json.loads(variables_json)
    output_lines = []
    plots = []

    class _Capture(io.StringIO):
        def write(self, s):
            output_lines.append(s)
            return len(s)

    old_stdout = sys.stdout
    sys.stdout = _Capture()

    try:
        # Attempt matplotlib interception
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            def _capture_show(*args, **kwargs):
                buf = io.BytesIO()
                plt.savefig(buf, format="png", bbox_inches="tight", dpi=100)
                buf.seek(0)
                plots.append("data:image/png;base64," + base64.b64encode(buf.read()).decode())
                plt.clf()
                plt.close("all")

            plt.show = _capture_show
        except Exception:
            pass

        ns = dict(variables)
        exec(compile(user_code, "<python_code>", "exec"), {"__builtins__": __builtins__}, ns)
        result = ns.get("result", None)

        # Try JSON-serialise result; fall back to string
        try:
            json.dumps(result)
        except Exception:
            result = str(result)

        sys.stdout = old_stdout
        return json.dumps({
            "success": True,
            "output": "".join(output_lines),
            "result": result,
            "plots": plots,
        })
    except Exception:
        sys.stdout = old_stdout
        return json.dumps({
            "success": False,
            "output": "".join(output_lines),
            "result": None,
            "error": traceback.format_exc(),
            "plots": plots,
        })
`;

self.addEventListener("message", async (event) => {
  const { type, id, code, variables, timeout = 10000, packages } = event.data;
  if (type !== "run") return;

  let currentId = id;

  try {
    const py = await pyodideReady;

    // Install additional packages before running user code
    await installPackages(py, packages);

    // Attach wrapper if not already loaded
    py.runPython(WRAPPER_CODE);

    const varsJson = JSON.stringify(variables ?? {});

    // Execute with a timeout by wrapping in a promise race
    const execPromise = new Promise((resolve) => {
      const resultJson = py.runPython(
        `_execute_user_code(${JSON.stringify(code)}, ${JSON.stringify(varsJson)})`
      );
      resolve(JSON.parse(resultJson));
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Python execution timed out")), timeout)
    );

    const response = await Promise.race([execPromise, timeoutPromise]);
    self.postMessage({ type: "result", id: currentId, ...response });
  } catch (err) {
    self.postMessage({
      type: "result",
      id: currentId,
      success: false,
      output: "",
      result: null,
      error: err instanceof Error ? err.message : String(err),
      plots: [],
    });
  }
});
