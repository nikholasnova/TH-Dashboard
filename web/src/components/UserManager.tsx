'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from './AuthProvider';

interface ManagedUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  last_sign_in_at: string | null;
}

interface UserManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserManager({ isOpen, onClose }: UserManagerProps) {
  const { user: currentUser } = useSession();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data.users);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch users.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchUsers();
  }, [isOpen, fetchUsers]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to invite user');
      }
      setInviteEmail('');
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to invite user.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setIsSaving(true);
    setError(null);
    setCopiedLink(false);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, linkOnly: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate invite link');
      }
      const data = await res.json();
      await navigator.clipboard.writeText(data.inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate link.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update role.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users?userId=${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove user');
      }
      setConfirmDelete(null);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove user.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              Manage Users
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2"
              aria-label="Close user manager"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 alert-accent text-[var(--error)]">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-[var(--foreground-muted)] text-center py-8">
              Loading users...
            </p>
          ) : (
            <div className="space-y-3 mb-6">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <div
                    key={u.id}
                    className="p-4 rounded-xl bg-[var(--hover-bg)] border border-[var(--divider)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--foreground)] font-medium truncate">
                          {u.email}
                          {isSelf && (
                            <span className="ml-2 text-xs text-[var(--foreground-muted)]">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {u.last_sign_in_at
                            ? `Last sign in: ${new Date(u.last_sign_in_at).toLocaleDateString()}`
                            : 'Never signed in'}
                        </p>
                      </div>

                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleRoleChange(
                            u.id,
                            e.target.value as 'admin' | 'user'
                          )
                        }
                        disabled={isSaving || isSelf}
                        className="px-2 py-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--input-focus-border)] disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                      </select>

                      {!isSelf && (
                        <button
                          onClick={() => setConfirmDelete(u.id)}
                          disabled={isSaving}
                          className="text-[var(--foreground-muted)] hover:text-[var(--error)] transition-colors flex-shrink-0"
                          title="Remove user"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>

                    {confirmDelete === u.id && (
                      <div className="mt-3 alert-accent text-[var(--error)]">
                        <p className="text-sm text-[var(--foreground)] mb-2">
                          Remove{' '}
                          <span className="font-semibold">{u.email}</span>?
                          This cannot be undone.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={isSaving}
                            className="btn-glass px-4 py-2 text-sm font-semibold text-[var(--error)] disabled:opacity-50"
                          >
                            {isSaving ? 'Removing...' : 'Yes, Remove'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-[var(--divider)] pt-4">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-3">
              Invite User
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--foreground-muted)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)]"
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleInvite}
                  disabled={isSaving || !inviteEmail.trim()}
                  className="btn-glass flex-1 px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Sending...' : 'Send Invite'}
                </button>
                <button
                  onClick={handleCopyLink}
                  disabled={isSaving || !inviteEmail.trim()}
                  className="btn-glass px-4 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate invite link and copy to clipboard"
                >
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
