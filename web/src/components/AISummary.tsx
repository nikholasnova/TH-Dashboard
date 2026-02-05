'use client';

import { useState } from 'react';

export function AISummary() {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSummary = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to generate summary');
        return;
      }

      setSummary(data.summary);
    } catch {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Data Query</h2>
          <p className="text-sm text-[#a0aec0]">Powered by Gemini</p>
        </div>
        <button
          onClick={generateSummary}
          disabled={isLoading}
          className="btn-glass px-6 py-3 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Analyzing...' : 'Run Query'}
        </button>
      </div>

      {isLoading && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="space-y-3">
            <div className="skeleton h-4 w-full"></div>
            <div className="skeleton h-4 w-11/12"></div>
            <div className="skeleton h-4 w-4/5"></div>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="p-5 rounded-xl bg-[#e31a1a]/10 border border-[#e31a1a]/30">
          <p className="text-[#e31a1a] text-sm font-medium">{error}</p>
        </div>
      )}

      {summary && !error && !isLoading && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <p className="text-white/90 text-base leading-relaxed">{summary}</p>
        </div>
      )}

      {!summary && !error && !isLoading && (
        <div className="text-center py-6">
          <p className="text-[#a0aec0] text-base">
            Click the button to query the last 24 hours of sensor data.
          </p>
        </div>
      )}

      <p className="mt-6 text-sm text-[#a0aec0]/60">
        Limited to one request per 15 minutes to manage API costs.
      </p>
    </div>
  );
}
