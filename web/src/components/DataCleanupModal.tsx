'use client';

import { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { supabase, DeploymentWithCount, getDeployments } from '@/lib/supabase';
import { useDevices } from '@/contexts/DevicesContext';
import { useSession } from './AuthProvider';

interface DataCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'scope' | 'confirm' | 'auth' | 'done';

export function DataCleanupModal({ isOpen, onClose, onComplete }: DataCleanupModalProps) {
  const { devices } = useDevices();
  const [step, setStep] = useState<Step>('scope');
  const [deploymentList, setDeploymentList] = useState<DeploymentWithCount[]>([]);

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [includeWeather, setIncludeWeather] = useState(true);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  const selectedDeployment = deploymentList.find(d => String(d.id) === selectedDeploymentId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    setStep('scope');
    setSelectedDeviceId('');
    setSelectedDeploymentId('');
    setCustomStart('');
    setCustomEnd('');
    setIncludeWeather(true);
    setPreviewCount(null);
    setPassword('');
    setAuthError('');
    setDeletedCount(0);
    getDeployments().then(setDeploymentList).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (selectedDeployment) {
      const depEnd = selectedDeployment.ended_at ? new Date(selectedDeployment.ended_at) : new Date();
      setCustomStart(new Date(selectedDeployment.started_at).toISOString().slice(0, 16));
      setCustomEnd(depEnd.toISOString().slice(0, 16));
      setSelectedDeviceId(selectedDeployment.device_id);
    }
  }, [selectedDeployment]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const scopeValid = !!selectedDeviceId && !!customStart && !!customEnd && new Date(customStart) < new Date(customEnd);

  const fetchCount = async () => {
    if (!supabase || !scopeValid) return;
    setIsCountLoading(true);
    try {
      const isoStart = new Date(customStart).toISOString();
      const isoEnd = new Date(customEnd).toISOString();
      const deviceIds = includeWeather
        ? [selectedDeviceId, `weather_${selectedDeviceId}`]
        : [selectedDeviceId];

      let total = 0;
      for (const did of deviceIds) {
        const { count, error } = await supabase
          .from('readings')
          .select('*', { count: 'exact', head: true })
          .eq('device_id', did)
          .gte('created_at', isoStart)
          .lte('created_at', isoEnd);
        if (!error && count != null) total += count;
      }
      setPreviewCount(total);
      setStep('confirm');
    } catch {
      setPreviewCount(null);
    } finally {
      setIsCountLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!supabase) return;
    setAuthError('');
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) { setAuthError('No active session.'); return; }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError('Incorrect password. Please try again.');
      return;
    }
    setStep('auth');
    await performDelete();
  };

  const { role } = useSession();

  const performDelete = async () => {
    if (!supabase) return;
    if (role !== 'admin') {
      setAuthError('Only admins can delete data. Contact your admin.');
      return;
    }
    setIsDeleting(true);
    try {
      const isoStart = new Date(customStart).toISOString();
      const isoEnd = new Date(customEnd).toISOString();

      const { data, error } = await supabase.rpc('delete_readings_range', {
        p_device_id: selectedDeviceId,
        p_start: isoStart,
        p_end: isoEnd,
        p_include_weather: includeWeather,
      });
      if (error) throw error;
      const count = typeof data === 'number' ? data : 0;
      setDeletedCount(count);
      posthog.capture('data_deleted', {
        device_id: selectedDeviceId,
        deleted_count: count,
        include_weather: includeWeather,
        deployment_id: selectedDeploymentId || null,
      });
      setStep('done');
    } catch {
      setAuthError('Deletion failed. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] w-full';
  const devName = devices.find(d => d.id === selectedDeviceId)?.display_name ?? selectedDeviceId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 sm:p-8 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Clean Up Data</h2>
            <button onClick={onClose} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {step === 'scope' && (
            <div className="space-y-5">
              {deploymentList.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Deployment (optional)</label>
                  <select value={selectedDeploymentId} onChange={e => { setSelectedDeploymentId(e.target.value); if (!e.target.value) { setSelectedDeviceId(''); setCustomStart(''); setCustomEnd(''); } }} className={inputClass}>
                    <option value="">Custom range</option>
                    {deploymentList.map(d => <option key={d.id} value={String(d.id)}>{d.name} ({d.device_id})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Device</label>
                <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)} className={inputClass} disabled={!!selectedDeployment} style={selectedDeployment ? { opacity: 0.6 } : undefined}>
                  <option value="">Select device</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.display_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-[var(--foreground-muted)] mb-1 block">Start</span>
                  <input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)} className={inputClass} disabled={!!selectedDeployment} style={selectedDeployment ? { opacity: 0.6 } : undefined} />
                </div>
                <div>
                  <span className="text-xs text-[var(--foreground-muted)] mb-1 block">End</span>
                  <input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={inputClass} disabled={!!selectedDeployment} style={selectedDeployment ? { opacity: 0.6 } : undefined} />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={includeWeather} onChange={e => setIncludeWeather(e.target.checked)} className="w-4 h-4 rounded accent-[var(--primary)]" />
                <span className="text-sm text-[var(--foreground-secondary)]">Also delete weather data for this device</span>
              </label>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={onClose} className="px-4 py-2.5 text-sm text-[var(--foreground-muted)]">Cancel</button>
                <button onClick={fetchCount} disabled={!scopeValid || isCountLoading} className="btn-glass px-6 py-2.5 text-sm font-semibold disabled:opacity-50">
                  {isCountLoading ? 'Counting...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30">
                <p className="text-sm font-medium text-[var(--error)] mb-2">This action cannot be undone</p>
                <p className="text-sm text-[var(--foreground)]">
                  You are about to delete <strong>{previewCount?.toLocaleString()}</strong> readings from <strong>{devName}</strong> between {new Date(customStart).toLocaleDateString()} and {new Date(customEnd).toLocaleDateString()}.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--foreground-secondary)] mb-2 block">Enter your password to confirm</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Dashboard password" autoComplete="current-password" />
                {authError && <p className="text-xs text-[var(--error)] mt-2">{authError}</p>}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setStep('scope')} className="px-4 py-2.5 text-sm text-[var(--foreground-muted)]">Back</button>
                <button onClick={handleAuth} disabled={!password || isDeleting} className="btn-glass px-6 py-2.5 text-sm font-semibold text-[var(--error)] disabled:opacity-50">
                  {isDeleting ? 'Deleting...' : `Delete ${previewCount?.toLocaleString()} Readings`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="mb-4 inline-flex p-3 rounded-full bg-[var(--success)]/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-lg font-medium text-[var(--foreground)] mb-2">Deleted {deletedCount.toLocaleString()} readings</p>
              <p className="text-sm text-[var(--foreground-muted)]">from {devName}</p>
              <button onClick={() => { onComplete(); onClose(); }} className="btn-glass px-6 py-2.5 text-sm font-semibold mt-6">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
