import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
}));

import { AuthProvider, useSession } from '../AuthProvider';

function Consumer() {
  const { session, user, loading } = useSession();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email || 'none'}</span>
      <span data-testid="session">{session ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue(vi.fn());
  });

  it('starts with loading=true', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('provides session after getSession resolves', async () => {
    const session = { user: { email: 'test@example.com' } };
    mockGetSession.mockResolvedValue(session);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    expect(screen.getByTestId('session').textContent).toBe('yes');
  });

  it('provides user derived from session', async () => {
    mockGetSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('updates session on auth state change', async () => {
    mockGetSession.mockResolvedValue(null);

    let stateChangeCallback: (session: unknown) => void;
    mockOnAuthStateChange.mockImplementation((cb: (session: unknown) => void) => {
      stateChangeCallback = cb;
      return vi.fn();
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    act(() => {
      stateChangeCallback({ user: { email: 'new@example.com' } });
    });

    expect(screen.getByTestId('user').textContent).toBe('new@example.com');
  });

  it('calls unsubscribe on unmount', async () => {
    mockGetSession.mockResolvedValue(null);
    const unsubscribe = vi.fn();
    mockOnAuthStateChange.mockReturnValue(unsubscribe);

    const { unmount } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('handles onAuthStateChange returning null', async () => {
    mockGetSession.mockResolvedValue(null);
    mockOnAuthStateChange.mockReturnValue(null);

    const { unmount } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // should not throw on unmount
    unmount();
  });
});
