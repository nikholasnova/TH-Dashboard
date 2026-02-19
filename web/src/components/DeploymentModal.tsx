'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Deployment,
  Reading,
  getActiveDeployment,
  createDeployment,
  endDeployment,
  updateDeployment,
  deleteDeployment,
} from '@/lib/supabase';
import { isValidOptionalUsZipCode, normalizeUsZipCode } from '@/lib/weatherZip';
import { useDevices } from '@/contexts/DevicesContext';

interface DeploymentModalProps {
  deviceId: string;
  deviceName: string;
  reading?: Reading | null;
  isDeviceConnected?: boolean;
  existingDeployment?: Deployment | null; // If provided, manage this specific deployment
  isOpen: boolean;
  onClose: () => void;
  onDeploymentChange: () => void;
}

interface FormData {
  name: string;
  location: string;
  notes: string;
  device_id: string;
  zip_code: string;
}

interface EditFormData {
  name: string;
  location: string;
  notes: string;
  zip_code: string;
  started_at: string;
  ended_at: string;
}

function utcToDatetimeLocal(utcIso: string): string {
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DeploymentModal({
  deviceId,
  deviceName,
  reading,
  isDeviceConnected: isDeviceConnectedProp,
  existingDeployment,
  isOpen,
  onClose,
  onDeploymentChange,
}: DeploymentModalProps) {
  const { devices } = useDevices();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isDeviceConnected = isDeviceConnectedProp ?? Boolean(reading);
  const isViewingSpecific = !!existingDeployment;
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', location: '', notes: '', device_id: deviceId, zip_code: '' });
  const [editFormData, setEditFormData] = useState<EditFormData>({ name: '', location: '', notes: '', zip_code: '', started_at: '', ended_at: '' });
  const isCreateZipValid = isValidOptionalUsZipCode(formData.zip_code);
  const isEditZipValid = isValidOptionalUsZipCode(editFormData.zip_code);

  const fetchDeployment = useCallback(async () => {
    setIsLoading(true);
    if (existingDeployment) {
      setCurrentDeployment(existingDeployment);
      setEditFormData({
        name: existingDeployment.name,
        location: existingDeployment.location,
        notes: existingDeployment.notes || '',
        zip_code: existingDeployment.zip_code || '',
        started_at: utcToDatetimeLocal(existingDeployment.started_at),
        ended_at: existingDeployment.ended_at ? utcToDatetimeLocal(existingDeployment.ended_at) : '',
      });
      setIsLoading(false);
      return;
    }
    const deployment = await getActiveDeployment(deviceId);
    setCurrentDeployment(deployment);
    if (deployment) {
      setEditFormData({
        name: deployment.name,
        location: deployment.location,
        notes: deployment.notes || '',
        zip_code: deployment.zip_code || '',
        started_at: utcToDatetimeLocal(deployment.started_at),
        ended_at: deployment.ended_at ? utcToDatetimeLocal(deployment.ended_at) : '',
      });
    }
    setIsLoading(false);
  }, [deviceId, existingDeployment]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void fetchDeployment();
      setIsEditing(false);
      setShowDeleteConfirm(false);
      setActionError(null);
      setFormData({ name: '', location: '', notes: '', device_id: deviceId, zip_code: '' });
    }, 0);
    return () => clearTimeout(timer);
  }, [deviceId, fetchDeployment, isOpen]);

  const handleEndDeployment = async () => {
    if (!currentDeployment) return;
    setActionError(null);
    setIsSaving(true);
    const ended = await endDeployment(currentDeployment.id);
    if (!ended) {
      setActionError('Could not end deployment. Please try again.');
      setIsSaving(false);
      return;
    }
    setCurrentDeployment(isViewingSpecific ? ended : null);
    setIsEditing(false);
    onDeploymentChange();
    setIsSaving(false);
  };

  const handleStartDeployment = async () => {
    if (!formData.device_id || !formData.name.trim() || !formData.location.trim()) return;
    if (!isCreateZipValid) return;
    setActionError(null);
    setIsSaving(true);

    const targetDeviceId = formData.device_id;
    const activeForTarget = await getActiveDeployment(targetDeviceId);
    if (activeForTarget) {
      const ended = await endDeployment(activeForTarget.id);
      if (!ended) {
        setActionError(`Could not end the active deployment for ${targetDeviceId}.`);
        setIsSaving(false);
        return;
      }
    }

    const newDeployment = await createDeployment({
      device_id: targetDeviceId,
      name: formData.name.trim(),
      location: formData.location.trim(),
      notes: formData.notes.trim() || undefined,
      zip_code: normalizeUsZipCode(formData.zip_code) || undefined,
    });

    if (!newDeployment) {
      setActionError('Could not start deployment. Please try again.');
      setIsSaving(false);
      return;
    }

    setCurrentDeployment(newDeployment);
    setEditFormData({
      name: newDeployment.name,
      location: newDeployment.location,
      notes: newDeployment.notes || '',
      zip_code: newDeployment.zip_code || '',
      started_at: utcToDatetimeLocal(newDeployment.started_at),
      ended_at: newDeployment.ended_at ? utcToDatetimeLocal(newDeployment.ended_at) : '',
    });
    setFormData({ name: '', location: '', notes: '', device_id: deviceId, zip_code: '' });
    onDeploymentChange();
    setIsSaving(false);
  };

  const isEditTimeValid = !editFormData.ended_at || new Date(editFormData.started_at) < new Date(editFormData.ended_at);

  const handleSaveEdit = async () => {
    if (!currentDeployment) return;
    if (!editFormData.name.trim() || !editFormData.location.trim()) return;
    if (!editFormData.started_at || !isEditTimeValid) return;
    if (!isEditZipValid) return;
    setActionError(null);
    setIsSaving(true);

    const updated = await updateDeployment(currentDeployment.id, {
      name: editFormData.name.trim(),
      location: editFormData.location.trim(),
      notes: editFormData.notes.trim() || null,
      zip_code: normalizeUsZipCode(editFormData.zip_code),
      started_at: new Date(editFormData.started_at).toISOString(),
      ended_at: editFormData.ended_at ? new Date(editFormData.ended_at).toISOString() : null,
    });

    if (!updated) {
      setActionError('Could not save deployment changes. Please try again.');
      setIsSaving(false);
      return;
    }

    setCurrentDeployment(updated);
    setIsEditing(false);
    onDeploymentChange();
    setIsSaving(false);
  };

  const handleDeleteDeployment = async () => {
    if (!currentDeployment) return;
    setActionError(null);
    setIsSaving(true);
    const deleted = await deleteDeployment(currentDeployment.id);
    if (!deleted) {
      setActionError('Could not delete deployment. Please try again.');
      setIsSaving(false);
      return;
    }
    setCurrentDeployment(null);
    setShowDeleteConfirm(false);
    onDeploymentChange();
    setIsSaving(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    if (diffHours > 0) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    if (diffMins > 0) return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
    return 'just now';
  };

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-8 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Manage Deployment</h2>
            <p className="text-sm text-[#a0aec0]">{deviceName} ({deviceId})</p>
          </div>
          <button onClick={onClose} className="text-[#a0aec0] hover:text-white transition-colors p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {reading && !isDeviceConnected && !isViewingSpecific && (
          <div className="mb-6 p-4 rounded-xl bg-[#ffb547]/10 border border-[#ffb547]/30">
            <p className="text-sm text-[#ffb547]">
              <span className="font-semibold">Device offline.</span> You can still create a deployment, but no data will be collected until the device reconnects.
            </p>
          </div>
        )}
        {actionError && (
          <div className="mb-6 p-4 rounded-xl bg-[#e31a1a]/10 border border-[#e31a1a]/30">
            <p className="text-sm text-[#e31a1a]">{actionError}</p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-6 w-3/4"></div>
            <div className="skeleton h-4 w-1/2"></div>
            <div className="skeleton h-4 w-2/3"></div>
          </div>
        ) : (
          <>
            {currentDeployment && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  {currentDeployment.ended_at ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-[#a0aec0]/40" />
                      <h3 className="text-lg font-semibold text-white">Ended Deployment</h3>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-[#01b574] animate-pulse" />
                      <h3 className="text-lg font-semibold text-white">Active Deployment</h3>
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-4 p-5 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <label className="block text-sm text-[#a0aec0] mb-2">Name</label>
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                        placeholder="Deployment name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#a0aec0] mb-2">Location</label>
                      <input
                        type="text"
                        value={editFormData.location}
                        onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                        placeholder="Location"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#a0aec0] mb-2">Notes</label>
                      <textarea
                        value={editFormData.notes}
                        onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors resize-none"
                        rows={3}
                        placeholder="Optional notes..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#a0aec0] mb-2">Zip Code (for weather)</label>
                      <input
                        type="text"
                        value={editFormData.zip_code}
                        onChange={(e) => setEditFormData({ ...editFormData, zip_code: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                        placeholder="e.g., 85142"
                      />
                      {!isEditZipValid && (
                        <p className="text-xs text-[#e31a1a] mt-2">
                          Enter a valid US ZIP (12345 or 12345-6789).
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-[#a0aec0] mb-2">Start Time</label>
                        <input
                          type="datetime-local"
                          value={editFormData.started_at}
                          onChange={(e) => setEditFormData({ ...editFormData, started_at: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white focus:outline-none focus:border-white/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[#a0aec0] mb-2">End Time</label>
                        <input
                          type="datetime-local"
                          value={editFormData.ended_at}
                          onChange={(e) => setEditFormData({ ...editFormData, ended_at: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white focus:outline-none focus:border-white/40 transition-colors"
                          placeholder="Leave empty for active"
                        />
                      </div>
                    </div>
                    {!isEditTimeValid && editFormData.ended_at && (
                      <div className="p-3 rounded-lg bg-[#e31a1a]/10 border border-[#e31a1a]/30">
                        <p className="text-xs text-[#e31a1a]">
                          End time must be after start time.
                        </p>
                      </div>
                    )}
                    <div className="p-3 rounded-lg bg-[#ffb547]/10 border border-[#ffb547]/30">
                      <p className="text-xs text-[#ffb547]">
                        Changing time bounds may cause some readings to become unassigned until another deployment covers them.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSaving || !editFormData.name.trim() || !editFormData.location.trim() || !editFormData.started_at || !isEditTimeValid || !isEditZipValid}
                        className="btn-glass px-4 py-2 text-sm font-semibold text-[#01b574] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setActionError(null);
                          setIsEditing(false);
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-[#a0aec0] hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xl font-semibold text-white mb-1">{currentDeployment.name}</p>
                    <p className="text-[#a0aec0] mb-3">{currentDeployment.location}</p>
                    {currentDeployment.notes && (
                      <p className="text-sm text-[#a0aec0]/80 mb-3 italic">{currentDeployment.notes}</p>
                    )}
                    <p className="text-sm text-[#a0aec0]">Started: {formatDate(currentDeployment.started_at)}</p>
                    {currentDeployment.ended_at && (
                      <p className="text-sm text-[#a0aec0]">Ended: {formatDate(currentDeployment.ended_at)}</p>
                    )}
                    {!currentDeployment.ended_at && (
                      <p className="text-xs text-[#a0aec0]/60 mt-1">({getTimeAgo(currentDeployment.started_at)})</p>
                    )}

                    <div className="flex flex-wrap gap-3 mt-4">
                      {!currentDeployment.ended_at && (
                        <button
                          onClick={handleEndDeployment}
                          disabled={isSaving}
                          className="btn-glass px-4 py-2 text-sm font-semibold text-[#ffb547] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSaving ? 'Ending...' : 'End Deployment'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActionError(null);
                          setIsEditing(true);
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-[#a0aec0] hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-[#e31a1a] hover:text-[#ff4444] transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {showDeleteConfirm && (
                      <div className="mt-4 p-4 rounded-xl bg-[#e31a1a]/10 border border-[#e31a1a]/30">
                        <p className="text-sm text-white mb-3">Are you sure? This will permanently delete this deployment <span className="font-semibold">and all its sensor readings</span>. This cannot be undone.</p>
                        <div className="flex gap-3">
                          <button
                            onClick={handleDeleteDeployment}
                            disabled={isSaving}
                            className="btn-glass px-4 py-2 text-sm font-semibold text-[#e31a1a] disabled:opacity-50"
                          >
                            {isSaving ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm text-[#a0aec0] hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!currentDeployment && !isViewingSpecific && (
              <div className="mb-8 p-5 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-[#a0aec0]">No active deployment for this device.</p>
              </div>
            )}

            {!isViewingSpecific && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">
                {currentDeployment ? 'Start New Deployment' : 'Create Deployment'}
              </h3>
              {currentDeployment && (
                <p className="text-sm text-[#a0aec0] mb-4">
                  This will end the current deployment and start a new one.
                </p>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a0aec0] mb-2">Device</label>
                  <select
                    value={formData.device_id}
                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white focus:outline-none focus:border-white/40 transition-colors"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#a0aec0] mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                    placeholder="e.g., Kitchen Test Week 1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a0aec0] mb-2">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                    placeholder="e.g., Kitchen"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a0aec0] mb-2">Notes (optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors resize-none"
                    rows={3}
                    placeholder="Any additional context..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a0aec0] mb-2">Zip Code (for weather)</label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors"
                    placeholder="e.g., 85142"
                  />
                  {!isCreateZipValid && (
                    <p className="text-xs text-[#e31a1a] mt-2">
                      Enter a valid US ZIP (12345 or 12345-6789).
                    </p>
                  )}
                </div>
                <button
                  onClick={handleStartDeployment}
                  disabled={isSaving || !formData.device_id || !formData.name.trim() || !formData.location.trim() || !isCreateZipValid}
                  className="btn-glass w-full px-6 py-3 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Starting...' : currentDeployment ? 'End Current & Start New' : 'Start Deployment'}
                </button>
              </div>
            </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
