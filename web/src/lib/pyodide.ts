/* eslint-disable @typescript-eslint/no-explicit-any */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

// Use `any` for the Pyodide instance — the real types come from the CDN script,
// not the npm package, so we can't get static types without bundler issues.
export type PyodideInterface = any;

// Module-level singleton — survives component remounts and navigation
let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;

// Swappable callback — when a new component mounts mid-load, it can
// replace this so progress events go to the current (mounted) component.
let currentProgressCallback: ((status: LoadingStatus) => void) | null = null;

export type LoadingStatus = {
  stage: "idle" | "loading-pyodide" | "loading-packages" | "ready" | "error";
  message: string;
};

/** Load the Pyodide script from CDN via a <script> tag (bypasses bundler). */
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

      // Load pyodide.js from CDN via script tag — NOT via import()
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
      await pyodide.loadPackage(["numpy", "pandas", "scipy", "statsmodels"]);

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
