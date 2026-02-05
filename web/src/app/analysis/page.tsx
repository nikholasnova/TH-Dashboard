'use client';

import { useEffect, useState, useCallback } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';
import { DeploymentWithCount, getDeployments } from '@/lib/supabase';
import { getPyodide, LoadingStatus, PyodideInterface } from '@/lib/pyodide';
import {
  runAnalyses,
  AnalysisType,
  AnalysisResults,
} from '@/lib/analysisRunner';
import { DescriptiveResults } from '@/components/analysis/DescriptiveResults';
import { CorrelationResults } from '@/components/analysis/CorrelationResults';
import { HypothesisTestResults } from '@/components/analysis/HypothesisTestResults';
import { SeasonalResults } from '@/components/analysis/SeasonalResults';
import { ForecastResults } from '@/components/analysis/ForecastResults';

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: 'Custom', hours: -1 },
];

const ANALYSIS_TYPES = [
  { id: 'descriptive', label: 'Descriptive Stats' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'hypothesis_test', label: 'Hypothesis Test' },
  { id: 'seasonal_decomposition', label: 'Seasonal Decomposition' },
  { id: 'forecasting', label: 'Forecasting' },
];

function isError(result: unknown): result is { error: string } {
  return typeof result === 'object' && result !== null && 'error' in result;
}

function areAllResultsEmpty(r: AnalysisResults): boolean {
  const keys: (keyof AnalysisResults)[] = [
    'descriptive',
    'correlation',
    'hypothesis_test',
    'seasonal_decomposition',
    'forecasting',
  ];
  return keys.every((k) => {
    const v = r[k];
    if (!v) return true;
    if (isError(v)) return false; // errors count as "has content"
    return Array.isArray(v) && v.length === 0;
  });
}

export default function AnalysisPage() {
  const [pyodideStatus, setPyodideStatus] = useState<LoadingStatus>({
    stage: 'idle',
    message: '',
  });
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideRef, setPyodideRef] = useState<PyodideInterface | null>(null);

  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState('');

  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [selectedDeployments, setSelectedDeployments] = useState<number[]>([]);

  const [selectedRange, setSelectedRange] = useState(24);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);

  const isCustom = selectedRange === -1;
  const isCustomValid =
    !!customStart &&
    !!customEnd &&
    new Date(customStart).getTime() < new Date(customEnd).getTime();

  const canRun =
    pyodideReady &&
    selectedDeployments.length > 0 &&
    selectedAnalyses.length > 0 &&
    (!isCustom || isCustomValid);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const instance = await getPyodide((status) => {
          if (!cancelled) setPyodideStatus(status);
        });
        if (!cancelled) {
          setPyodideReady(true);
          setPyodideRef(instance);
        }
      } catch {
        // Error state set by onProgress callback
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getDeployments().then(setDeployments);
  }, []);

  const handleRetryPyodide = useCallback(() => {
    setPyodideStatus({ stage: 'idle', message: '' });
    setPyodideReady(false);
    setPyodideRef(null);

    async function reload() {
      try {
        const instance = await getPyodide((status) => setPyodideStatus(status));
        setPyodideReady(true);
        setPyodideRef(instance);
      } catch {
        // handled by onProgress
      }
    }
    reload();
  }, []);

  const toggleDeployment = (id: number) => {
    setSelectedDeployments((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const toggleAnalysis = (id: string) => {
    setSelectedAnalyses((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleRunAnalysis = useCallback(async () => {
    if (!pyodideRef || !canRun) return;

    setIsRunning(true);
    setResults(null);
    setRunProgress('Starting analysis...');

    try {
      const end = isCustom
        ? new Date(customEnd).toISOString()
        : new Date().toISOString();
      const start = isCustom
        ? new Date(customStart).toISOString()
        : new Date(Date.now() - selectedRange * 60 * 60 * 1000).toISOString();

      const analysisResults = await runAnalyses(
        pyodideRef,
        {
          deploymentIds: selectedDeployments,
          start,
          end,
          analyses: selectedAnalyses as AnalysisType[],
        },
        (msg) => setRunProgress(msg)
      );

      setResults(analysisResults);
    } catch (error) {
      setResults(null);
      setRunProgress(`Error: ${String(error)}`);
    } finally {
      setIsRunning(false);
    }
  }, [pyodideRef, canRun, selectedDeployments, selectedAnalyses, selectedRange, isCustom, customStart, customEnd]);

  const renderPyodideStatus = () => {
    const { stage, message } = pyodideStatus;

    if (stage === 'ready') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#01b574]" />
          <span className="text-[#01b574] text-sm font-medium">
            Python ready
          </span>
        </div>
      );
    }

    if (stage === 'error') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#e31a1a]" />
          <span className="text-[#e31a1a] text-sm">{message}</span>
          <button
            onClick={handleRetryPyodide}
            className="btn-glass px-4 py-1.5 text-sm"
          >
            Retry
          </button>
        </div>
      );
    }

    if (stage === 'loading-pyodide' || stage === 'loading-packages') {
      return (
        <div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span
                className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span className="text-[#a0aec0] text-sm">
              {stage === 'loading-pyodide'
                ? 'Loading Python runtime...'
                : 'Loading scientific packages (numpy, pandas, scipy, statsmodels)...'}
            </span>
          </div>
          <p className="text-xs text-[#a0aec0]/60 mt-2">
            First load downloads ~15MB of Python packages. Subsequent visits use browser cache.
          </p>
        </div>
      );
    }

    // idle — initial state before loading begins
    return (
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          <span
            className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <span className="text-[#a0aec0] text-sm">
          Initializing Python environment...
        </span>
      </div>
    );
  };

  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          <div className="flex flex-col-reverse sm:flex-col">
            <header className="mb-6 sm:mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                Python Statistical Analysis
              </h1>
              <p className="text-base sm:text-lg text-[#a0aec0]">
                Run scientific analyses on sensor data using Python
              </p>
            </header>
            <Navbar />
          </div>

          <div className="glass-card p-4 sm:p-6 mb-6">{renderPyodideStatus()}</div>

          <div className="glass-card p-4 sm:p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Configuration
            </h2>

            <div className="mb-5">
              <label className="text-sm text-[#a0aec0] font-medium mb-2 block">
                Deployments
              </label>
              <div className="flex flex-wrap gap-2">
                {deployments.length === 0 ? (
                  <span className="text-sm text-[#a0aec0]/60">
                    No deployments found
                  </span>
                ) : (
                  deployments.map((dep) => (
                    <button
                      key={dep.id}
                      onClick={() => toggleDeployment(dep.id)}
                      disabled={!pyodideReady}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl transition-all ${
                        selectedDeployments.includes(dep.id)
                          ? 'nav-active text-white font-semibold'
                          : 'text-[#a0aec0] hover:text-white hover:bg-white/5 border border-white/10'
                      } ${!pyodideReady ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {dep.name}{' '}
                      <span className="text-[#a0aec0]/60 hidden sm:inline">
                        ({dep.device_id})
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-sm text-[#a0aec0] font-medium mb-2 block">
                Time Range
              </label>
              <div className="flex flex-wrap gap-2">
                <div className="glass-card p-2 flex flex-wrap gap-1">
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.hours}
                      onClick={() => setSelectedRange(range.hours)}
                      disabled={!pyodideReady}
                      className={`px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm rounded-xl transition-all ${
                        selectedRange === range.hours
                          ? 'nav-active text-white font-semibold'
                          : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
                      } ${!pyodideReady ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>

                {isCustom && (
                  <div className="glass-card p-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#a0aec0]">Start</label>
                      <input
                        type="datetime-local"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        disabled={!pyodideReady}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#a0aec0]">End</label>
                      <input
                        type="datetime-local"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        disabled={!pyodideReady}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-40"
                      />
                    </div>
                    {!isCustomValid && customStart && customEnd && (
                      <span className="text-xs text-[#ffb547]">
                        Pick a valid range
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-sm text-[#a0aec0] font-medium mb-2 block">
                Analysis Types
              </label>
              <div className="flex flex-wrap gap-2">
                {ANALYSIS_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => toggleAnalysis(type.id)}
                    disabled={!pyodideReady}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl transition-all ${
                      selectedAnalyses.includes(type.id)
                        ? 'nav-active text-white font-semibold'
                        : 'text-[#a0aec0] hover:text-white hover:bg-white/5 border border-white/10'
                    } ${!pyodideReady ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              {selectedAnalyses.includes('hypothesis_test') && selectedDeployments.length === 1 && (
                <p className="text-xs text-[#ffb547] mt-2">
                  Hypothesis test requires at least 2 deployments
                </p>
              )}
              {(selectedAnalyses.includes('seasonal_decomposition') || selectedAnalyses.includes('forecasting')) && (
                <p className="text-xs text-[#a0aec0]/60 mt-2">
                  Seasonal decomposition and forecasting need at least 2 days of continuous data
                </p>
              )}
            </div>

            <button
              onClick={handleRunAnalysis}
              disabled={!canRun || isRunning}
              className={`btn-glass px-6 py-3 text-sm font-semibold ${
                !canRun || isRunning ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              {isRunning ? runProgress || 'Running...' : 'Run Analysis'}
            </button>
          </div>

          <div className="glass-card p-4 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Results</h2>
              {results && !isRunning && (
                <button
                  onClick={() => setResults(null)}
                  className="text-xs text-[#a0aec0] hover:text-white transition-colors"
                >
                  Clear results
                </button>
              )}
            </div>

            {isRunning && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-[#0075ff] rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                  <span className="text-[#a0aec0] text-sm">{runProgress}</span>
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-card p-6 skeleton h-48" />
                ))}
              </div>
            )}

            {!isRunning && !results && (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-[#a0aec0] text-sm">
                  Run an analysis to see results
                </p>
              </div>
            )}

            {!isRunning && results && areAllResultsEmpty(results) && (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-[#a0aec0] text-sm">
                  No results — the selected deployments may not have enough data in the chosen time range.
                </p>
              </div>
            )}

            {!isRunning && results && !areAllResultsEmpty(results) && (
              <div className="space-y-8">
                {results.descriptive && (
                  <section>
                    <h3 className="text-md font-semibold text-white mb-3">Descriptive Statistics</h3>
                    {isError(results.descriptive) ? (
                      <div className="glass-card p-4 border-l-4 border-l-[#ffb547]">
                        <p className="text-[#ffb547] text-sm">{results.descriptive.error}</p>
                      </div>
                    ) : (
                      <DescriptiveResults results={results.descriptive} />
                    )}
                  </section>
                )}

                {results.correlation && (
                  <section>
                    <h3 className="text-md font-semibold text-white mb-3">Correlation Analysis</h3>
                    {isError(results.correlation) ? (
                      <div className="glass-card p-4 border-l-4 border-l-[#ffb547]">
                        <p className="text-[#ffb547] text-sm">{results.correlation.error}</p>
                      </div>
                    ) : (
                      <CorrelationResults results={results.correlation} />
                    )}
                  </section>
                )}

                {results.hypothesis_test && (
                  <section>
                    <h3 className="text-md font-semibold text-white mb-3">Hypothesis Testing</h3>
                    {isError(results.hypothesis_test) ? (
                      <div className="glass-card p-4 border-l-4 border-l-[#ffb547]">
                        <p className="text-[#ffb547] text-sm">{results.hypothesis_test.error}</p>
                      </div>
                    ) : (
                      <HypothesisTestResults results={results.hypothesis_test} />
                    )}
                  </section>
                )}

                {results.seasonal_decomposition && (
                  <section>
                    <h3 className="text-md font-semibold text-white mb-3">Seasonal Decomposition</h3>
                    {isError(results.seasonal_decomposition) ? (
                      <div className="glass-card p-4 border-l-4 border-l-[#ffb547]">
                        <p className="text-[#ffb547] text-sm">{results.seasonal_decomposition.error}</p>
                      </div>
                    ) : (
                      <SeasonalResults results={results.seasonal_decomposition} />
                    )}
                  </section>
                )}

                {results.forecasting && (
                  <section>
                    <h3 className="text-md font-semibold text-white mb-3">Forecasting</h3>
                    {isError(results.forecasting) ? (
                      <div className="glass-card p-4 border-l-4 border-l-[#ffb547]">
                        <p className="text-[#ffb547] text-sm">{results.forecasting.error}</p>
                      </div>
                    ) : (
                      <ForecastResults results={results.forecasting} />
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
