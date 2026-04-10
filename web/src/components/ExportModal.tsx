'use client';

import { useState, useEffect } from 'react';
import { getAllReadingsRange, getChartSamples, celsiusToFahrenheit, getDeployments, Deployment } from '@/lib/supabase';
import { useDevices } from '@/contexts/DevicesContext';
import posthog from 'posthog-js';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStart: string;
  defaultEnd: string;
  defaultDeviceId: string;
}

const BUCKET_OPTIONS = [
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: '2 hours', seconds: 7200 },
  { label: '6 hours', seconds: 21600 },
  { label: '1 day', seconds: 86400 },
] as const;

function csvSafe(value: string): string {
  if (/[,"\n\r]/.test(value) || /^[=+\-@\t\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportModal({ isOpen, onClose, defaultStart, defaultEnd, defaultDeviceId }: ExportModalProps) {
  const { devices } = useDevices();

  const [deploymentList, setDeploymentList] = useState<Deployment[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>('');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [dataMode, setDataMode] = useState<'raw' | 'aggregated'>('raw');
  const [bucketSeconds, setBucketSeconds] = useState(3600);
  const [selectedDeviceId, setSelectedDeviceId] = useState(defaultDeviceId);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedDeployment = deploymentList.find(d => String(d.id) === selectedDeploymentId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    setStart(defaultStart);
    setEnd(defaultEnd);
    setSelectedDeviceId(defaultDeviceId);
    setSelectedDeploymentId('');
    setExportError(null);
    setIsExporting(false);
    getDeployments().then(setDeploymentList).catch(() => {});
  }, [isOpen, defaultStart, defaultEnd, defaultDeviceId]);

  useEffect(() => {
    if (!selectedDeployment) return;
    const depStart = new Date(selectedDeployment.started_at);
    const depEnd = selectedDeployment.ended_at ? new Date(selectedDeployment.ended_at) : new Date();
    setStart(depStart.toISOString().slice(0, 16));
    setEnd(depEnd.toISOString().slice(0, 16));
    setSelectedDeviceId(selectedDeployment.device_id);
  }, [selectedDeployment]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const isRangeValid = !!start && !!end && new Date(start).getTime() < new Date(end).getTime();

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const isoStart = new Date(start).toISOString();
      const isoEnd = new Date(end).toISOString();
      const deviceId = selectedDeviceId || undefined;

      let csv: string;
      if (dataMode === 'raw') {
        let readings = await getAllReadingsRange({ start: isoStart, end: isoEnd, device_id: deviceId });
        if (!includeWeather) {
          readings = readings.filter(r => !r.device_id.startsWith('weather_'));
        }
        if (readings.length === 0) {
          setExportError('No data found for the selected range.');
          return;
        }
        const headers = ['timestamp', 'device_id', 'source', 'temperature_f', 'temperature_c', 'humidity'];
        const rows = readings.map(r => [
          csvSafe(r.created_at),
          csvSafe(r.device_id),
          csvSafe(r.source ?? ''),
          celsiusToFahrenheit(r.temperature).toFixed(2),
          r.temperature.toFixed(2),
          r.humidity.toFixed(2),
        ]);
        csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      } else {
        let samples = await getChartSamples({ start: isoStart, end: isoEnd, bucketSeconds, device_id: deviceId });
        if (!includeWeather) {
          samples = samples.filter(s => !s.device_id.startsWith('weather_'));
        }
        if (samples.length === 0) {
          setExportError('No data found for the selected range.');
          return;
        }
        const headers = ['bucket_timestamp', 'device_id', 'temperature_avg_f', 'temperature_avg_c', 'humidity_avg', 'reading_count'];
        const rows = samples.map(s => [
          csvSafe(s.bucket_ts),
          csvSafe(s.device_id),
          celsiusToFahrenheit(s.temperature_avg).toFixed(2),
          s.temperature_avg.toFixed(2),
          s.humidity_avg.toFixed(2),
          String(s.reading_count),
        ]);
        csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      }

      if (selectedDeployment) {
        const meta = [
          `# Deployment: ${selectedDeployment.name}`,
          `# Device: ${selectedDeployment.device_id}`,
          selectedDeployment.location ? `# Location: ${selectedDeployment.location}` : null,
          selectedDeployment.zip_code ? `# ZIP: ${selectedDeployment.zip_code}` : null,
          `# Period: ${new Date(selectedDeployment.started_at).toLocaleDateString()} to ${selectedDeployment.ended_at ? new Date(selectedDeployment.ended_at).toLocaleDateString() : 'ongoing'}`,
          `# Export date: ${new Date().toISOString()}`,
          '#',
        ].filter(Boolean).join('\n');
        csv = meta + '\n' + csv;
      }

      const deviceLabel = selectedDeviceId || 'all';
      const startDate = start.split('T')[0];
      const endDate = end.split('T')[0];
      const modeLabel = dataMode === 'raw' ? 'raw' : `agg-${BUCKET_OPTIONS.find(b => b.seconds === bucketSeconds)?.label.replace(/\s/g, '') ?? bucketSeconds}`;
      const depLabel = selectedDeployment ? selectedDeployment.name.replace(/\s+/g, '-').toLowerCase() : null;
      const filename = depLabel
        ? `${depLabel}-${modeLabel}-${startDate}_to_${endDate}.csv`
        : `readings-${modeLabel}-${deviceLabel}-${startDate}_to_${endDate}.csv`;

      posthog.capture('data_exported', {
        data_mode: dataMode,
        device_id: selectedDeviceId || 'all',
        include_weather: includeWeather,
        deployment_id: selectedDeployment ? selectedDeployment.id : null,
      });
      downloadCsv(csv, filename);
      onClose();
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] w-full';
  const toggleClass = (active: boolean) =>
    `nav-pill px-4 py-2 text-sm rounded-xl transition-all ${active ? 'nav-active text-[var(--foreground)] font-semibold' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 sm:p-8 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Export Data</h2>
            <button onClick={onClose} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2" aria-label="Close export modal">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-5">
            {/* Deployment selector */}
            {deploymentList.length > 0 && (
              <div>
                <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Deployment</label>
                <select
                  value={selectedDeploymentId}
                  onChange={e => {
                    setSelectedDeploymentId(e.target.value);
                    if (!e.target.value) {
                      setStart(defaultStart);
                      setEnd(defaultEnd);
                      setSelectedDeviceId(defaultDeviceId);
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">None (manual range)</option>
                  {deploymentList.map(d => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name} ({d.device_id}{d.location ? ` — ${d.location}` : ''})
                    </option>
                  ))}
                </select>
                {selectedDeployment && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    {selectedDeployment.location}{selectedDeployment.zip_code ? ` (${selectedDeployment.zip_code})` : ''} — dates and device auto-filled below
                  </p>
                )}
              </div>
            )}

            {/* Date range */}
            <div>
              <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Date Range</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-[var(--foreground-muted)] mb-1 block">Start</span>
                  <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={inputClass} disabled={!!selectedDeployment} style={selectedDeployment ? { opacity: 0.6 } : undefined} />
                </div>
                <div>
                  <span className="text-xs text-[var(--foreground-muted)] mb-1 block">End</span>
                  <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} disabled={!!selectedDeployment} style={selectedDeployment ? { opacity: 0.6 } : undefined} />
                </div>
              </div>
              {!isRangeValid && start && end && (
                <p className="text-xs text-[var(--warning)] mt-2">Start must be before end</p>
              )}
            </div>

            {/* Data mode */}
            <div>
              <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Data Mode</label>
              <div className="glass-card p-2 flex gap-1">
                <button onClick={() => setDataMode('raw')} data-label="Raw Readings" className={toggleClass(dataMode === 'raw')}>
                  Raw Readings
                </button>
                <button onClick={() => setDataMode('aggregated')} data-label="Aggregated" className={toggleClass(dataMode === 'aggregated')}>
                  Aggregated
                </button>
              </div>
            </div>

            {/* Bucket size (aggregated only) */}
            {dataMode === 'aggregated' && (
              <div>
                <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Bucket Size</label>
                <select
                  value={bucketSeconds}
                  onChange={e => setBucketSeconds(Number(e.target.value))}
                  className={inputClass}
                >
                  {BUCKET_OPTIONS.map(opt => (
                    <option key={opt.seconds} value={opt.seconds}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Device filter */}
            <div>
              <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Device</label>
              <select
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                className={inputClass}
                disabled={!!selectedDeployment}
                style={selectedDeployment ? { opacity: 0.6 } : undefined}
              >
                <option value="">All Devices</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.display_name}</option>
                ))}
              </select>
            </div>

            {/* Include weather */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWeather}
                onChange={e => setIncludeWeather(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--primary)]"
              />
              <span className="text-sm text-[var(--foreground-secondary)]">Include weather station data</span>
            </label>

            {/* Error */}
            {exportError && (
              <p className="text-sm text-[var(--warning)]">{exportError}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={!isRangeValid || isExporting}
              className="btn-glass px-6 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
