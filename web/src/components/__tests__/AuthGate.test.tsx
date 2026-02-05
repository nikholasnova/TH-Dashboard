import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthGate } from '../AuthGate';
import { useSession } from '../AuthProvider';

vi.mock('../AuthProvider', () => {
  return {
    useSession: vi.fn(),
  };
});

vi.mock('next/link', () => {
  return {
    default: ({ href, children }: { href: string; children: ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  };
});

describe('AuthGate', () => {
  const mockedUseSession = vi.mocked(useSession);

  it('shows loading state when auth is loading', () => {
    mockedUseSession.mockReturnValue({ session: null, user: null, loading: true });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows login prompt when unauthenticated', () => {
    mockedUseSession.mockReturnValue({ session: null, user: null, loading: false });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );

    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    expect(screen.getByText('Log In')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockedUseSession.mockReturnValue({ session: {} as never, user: {} as never, loading: false });

    render(
      <AuthGate>
        <div>Protected Content</div>
      </AuthGate>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
