/* eslint-disable @typescript-eslint/no-explicit-any */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

const SCRIPT_LOAD_TIMEOUT_MS = 30_000;
const OVERALL_LOAD_TIMEOUT_MS = 120_000;

export type PyodideInterface = any;

let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;

export type LoadingStatus = {
  stage: "idle" | "loading-pyodide" | "loading-packages" | "ready" | "error";
  message: string;
};

const progressSubscribers = new Set<(status: LoadingStatus) => void>();

function notifyProgress(status: LoadingStatus) {
  for (const cb of progressSubscribers) cb(status);
}

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((globalThis as any).loadPyodide) {
      resolve();
      return;
    }

    const scriptUrl = `${PYODIDE_CDN}pyodide.js`;

    const existing = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existing) {
      const timeout = setTimeout(() => {
        reject(new Error("Pyodide script load timed out after 30s"));
      }, SCRIPT_LOAD_TIMEOUT_MS);

      existing.addEventListener("load", () => { clearTimeout(timeout); resolve(); });
      existing.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Failed to load Pyodide from CDN")); });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;

    const timeout = setTimeout(() => {
      reject(new Error("Pyodide script load timed out after 30s"));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load Pyodide from CDN")); };
    document.head.appendChild(script);
  });
}

export async function getPyodide(
  onProgress?: (status: LoadingStatus) => void
): Promise<PyodideInterface> {
  if (onProgress) progressSubscribers.add(onProgress);

  try {
    if (pyodideInstance) {
      notifyProgress({ stage: "ready", message: "Python ready" });
      return pyodideInstance;
    }

    if (loadingPromise) return await loadingPromise;

    loadingPromise = Promise.race([
      (async () => {
        notifyProgress({
          stage: "loading-pyodide",
          message: "Loading Python runtime...",
        });

        await loadPyodideScript();

        const loadPyodide = (globalThis as any).loadPyodide;
        if (!loadPyodide) {
          throw new Error("loadPyodide not found on globalThis after script load");
        }

        const pyodide = await loadPyodide({
          indexURL: PYODIDE_CDN,
        });

        notifyProgress({
          stage: "loading-packages",
          message: "Loading scientific packages...",
        });
        await pyodide.loadPackage(["micropip", "numpy", "pandas", "scipy", "statsmodels"]);

        // loadPackage can silently skip packages — verify and fallback to micropip
        const missing: string = await pyodide.runPythonAsync(`
missing = []
for pkg in ["numpy", "pandas", "scipy", "statsmodels"]:
    try:
        __import__(pkg)
    except ImportError:
        missing.append(pkg)
",".join(missing)
`);
        if (missing) {
          notifyProgress({
            stage: "loading-packages",
            message: `Installing ${missing} via micropip...`,
          });
          await pyodide.runPythonAsync(`
import micropip
await micropip.install([${missing.split(",").map((p: string) => `"${p.trim()}"`).join(",")}])
`);
        }

        pyodideInstance = pyodide;
        notifyProgress({ stage: "ready", message: "Python ready" });
        return pyodide;
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Pyodide loading timed out after 2 minutes")),
          OVERALL_LOAD_TIMEOUT_MS
        )
      ),
    ]);

    loadingPromise.catch(() => {
      loadingPromise = null;
    });

    return await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    notifyProgress({ stage: "error", message: String(error) });
    throw error;
  } finally {
    if (onProgress) progressSubscribers.delete(onProgress);
  }
}
