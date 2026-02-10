/* eslint-disable @typescript-eslint/no-explicit-any */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

export type PyodideInterface = any;

let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;
let currentProgressCallback: ((status: LoadingStatus) => void) | null = null;

export type LoadingStatus = {
  stage: "idle" | "loading-pyodide" | "loading-packages" | "ready" | "error";
  message: string;
};

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((globalThis as any).loadPyodide) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide from CDN"));
    document.head.appendChild(script);
  });
}

export async function getPyodide(
  onProgress?: (status: LoadingStatus) => void
): Promise<PyodideInterface> {
  if (onProgress) currentProgressCallback = onProgress;

  if (pyodideInstance) {
    currentProgressCallback?.({ stage: "ready", message: "Python ready" });
    return pyodideInstance;
  }

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      currentProgressCallback?.({
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

      currentProgressCallback?.({
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
        currentProgressCallback?.({
          stage: "loading-packages",
          message: `Installing ${missing} via micropip...`,
        });
        await pyodide.runPythonAsync(`
import micropip
await micropip.install([${missing.split(",").map((p: string) => `"${p.trim()}"`).join(",")}])
`);
      }

      pyodideInstance = pyodide;
      currentProgressCallback?.({ stage: "ready", message: "Python ready" });
      return pyodide;
    } catch (error) {
      loadingPromise = null;
      currentProgressCallback?.({ stage: "error", message: String(error) });
      throw error;
    }
  })();

  return loadingPromise;
}
