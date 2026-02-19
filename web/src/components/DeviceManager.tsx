'use client';

import { useState, useEffect } from 'react';
import { createDevice, updateDevice } from '@/lib/supabase';
import { useDevices } from '@/contexts/DevicesContext';

interface DeviceManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEVICE_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

const COLOR_PALETTE = [
  '#0075ff',
  '#01b574',
  '#ffb547',
  '#e31a1a',
  '#21d4fd',
  '#a855f7',
  '#f97316',
  '#ec4899',
];

export function DeviceManager({ isOpen, onClose }: DeviceManagerProps) {
  const { allDevices, refresh } = useDevices();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0]);

  const resetAddForm = () => {
    setNewId('');
    setNewName('');
    setNewColor(COLOR_PALETTE[0]);
  };

  const startEditing = (id: string, displayName: string, color: string) => {
    setEditingId(id);
    setEditName(displayName);
    setEditColor(color);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateDevice(editingId, { display_name: editName.trim(), color: editColor });
      await refresh();
      cancelEditing();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update device.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      setConfirmDeactivate(id);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateDevice(id, { is_active: true });
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate device.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeactivate = async (id: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await updateDevice(id, { is_active: false });
      await refresh();
      setConfirmDeactivate(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate device.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMonitor = async (id: string, currentValue: boolean) => {
    setIsSaving(true);
    setError(null);
    try {
      await updateDevice(id, { monitor_enabled: !currentValue });
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle monitoring.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDevice = async () => {
    const trimmedId = newId.trim();
    const trimmedName = newName.trim();

    if (!trimmedId || !trimmedName) return;

    if (!DEVICE_ID_PATTERN.test(trimmedId)) {
      setError('Device ID must be 1-32 characters: lowercase letters, numbers, hyphens, or underscores.');
      return;
    }

    if (allDevices.some(d => d.id === trimmedId)) {
      setError(`Device ID "${trimmedId}" already exists.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const maxOrder = allDevices.reduce((max, d) => Math.max(max, d.sort_order), 0);
      await createDevice({
        id: trimmedId,
        display_name: trimmedName,
        color: newColor,
        sort_order: maxOrder + 1,
      });
      await refresh();
      resetAddForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create device.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const isNewIdValid = newId.trim() === '' || DEVICE_ID_PATTERN.test(newId.trim());

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Manage Devices</h2>
          <button onClick={onClose} className="text-[#a0aec0] hover:text-white transition-colors p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#e31a1a]/10 border border-[#e31a1a]/30">
            <p className="text-sm text-[#e31a1a]">{error}</p>
          </div>
        )}

        <div className="space-y-3 mb-6">
          {allDevices.map((device) => (
            <div key={device.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
              {editingId === device.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-[#a0aec0] mb-1">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-[#0075ff]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#a0aec0] mb-1">Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className="w-7 h-7 rounded-full transition-all"
                          style={{
                            backgroundColor: c,
                            outline: editColor === c ? '2px solid white' : '2px solid transparent',
                            outlineOffset: '2px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving || !editName.trim()}
                      className="btn-glass px-4 py-2 text-sm font-semibold text-[#01b574] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-medium text-[#a0aec0] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: device.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{device.display_name}</p>
                    <p className="text-xs text-[#a0aec0]">{device.id}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      device.is_active
                        ? 'bg-[#01b574]/20 text-[#01b574]'
                        : 'bg-white/10 text-[#a0aec0]'
                    }`}
                  >
                    {device.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => handleToggleMonitor(device.id, device.monitor_enabled)}
                    disabled={isSaving}
                    className="flex-shrink-0"
                    title={device.monitor_enabled ? 'Monitoring on' : 'Monitoring off'}
                  >
                    <div
                      className={`w-9 h-5 rounded-full relative transition-colors ${
                        device.monitor_enabled ? 'bg-[#01b574]' : 'bg-white/20'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          device.monitor_enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                  </button>
                  <button
                    onClick={() => startEditing(device.id, device.display_name, device.color)}
                    disabled={isSaving}
                    className="text-[#a0aec0] hover:text-white transition-colors flex-shrink-0"
                    title="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleToggleActive(device.id, device.is_active)}
                    disabled={isSaving}
                    className={`text-sm font-medium transition-colors flex-shrink-0 ${
                      device.is_active
                        ? 'text-[#e31a1a] hover:text-[#ff4444]'
                        : 'text-[#01b574] hover:text-[#02d48a]'
                    }`}
                    title={device.is_active ? 'Deactivate' : 'Reactivate'}
                  >
                    {device.is_active ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {confirmDeactivate === device.id && (
                <div className="mt-3 p-3 rounded-lg bg-[#e31a1a]/10 border border-[#e31a1a]/30">
                  <p className="text-sm text-white mb-2">Deactivate <span className="font-semibold">{device.display_name}</span>? It will be hidden from the dashboard.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleConfirmDeactivate(device.id)}
                      disabled={isSaving}
                      className="btn-glass px-4 py-2 text-sm font-semibold text-[#e31a1a] disabled:opacity-50"
                    >
                      {isSaving ? 'Deactivating...' : 'Yes, Deactivate'}
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(null)}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm text-[#a0aec0] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-4">
          <h3 className="text-lg font-semibold text-white mb-3">Add Device</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[#a0aec0] mb-1">Device ID</label>
              <input
                type="text"
                value={newId}
                onChange={(e) => {
                  setNewId(e.target.value.toLowerCase());
                  setError(null);
                }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-[#0075ff]/50"
                placeholder="e.g., node3"
              />
              {!isNewIdValid && (
                <p className="text-xs text-[#e31a1a] mt-1">
                  Only lowercase letters, numbers, hyphens, underscores (1-32 chars).
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-[#a0aec0] mb-1">Display Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-[#0075ff]/50"
                placeholder="e.g., Node 3"
              />
            </div>
            <div>
              <label className="block text-sm text-[#a0aec0] mb-1">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      backgroundColor: c,
                      outline: newColor === c ? '2px solid white' : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleAddDevice}
              disabled={isSaving || !newId.trim() || !newName.trim() || !isNewIdValid}
              className="btn-glass w-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Adding...' : 'Add Device'}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
