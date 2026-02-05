import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '../UserMenu';
import { useSession } from '../AuthProvider';
import { signOut } from '@/lib/auth';

const push = vi.fn();

vi.mock('../AuthProvider', () => {
  return {
    useSession: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => {
  return {
    signOut: vi.fn(),
  };
});

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({ push }),
  };
});

describe('UserMenu', () => {
  const mockedUseSession = vi.mocked(useSession);
  const mockedSignOut = vi.mocked(signOut);

  it('renders sign-in link when unauthenticated', () => {
    mockedUseSession.mockReturnValue({ session: null, user: null, loading: false });

    render(<UserMenu />);

    const link = screen.getByText('Sign In').closest('a');
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('opens menu and signs out when authenticated', async () => {
    mockedUseSession.mockReturnValue({
      session: { user: { email: 'test@example.com' } } as never,
      user: { email: 'test@example.com' } as never,
      loading: false,
    });
    mockedSignOut.mockResolvedValue({ success: true });

    render(<UserMenu />);
    const user = userEvent.setup();

    const menuButton = screen.getByRole('button', { name: 'User menu' });
    await user.click(menuButton);

    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    const signOutButton = screen.getByRole('button', { name: 'Sign Out' });
    await user.click(signOutButton);

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/login');
  });
});
