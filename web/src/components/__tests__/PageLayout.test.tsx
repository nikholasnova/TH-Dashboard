import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-gate">{children}</div>,
}));

vi.mock('@/components/Navbar', () => ({
  Navbar: () => <nav data-testid="navbar">Navbar</nav>,
}));

vi.mock('@/components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">UserMenu</div>,
}));

import { PageLayout } from '../PageLayout';

describe('PageLayout', () => {
  it('renders children inside AuthGate', () => {
    render(<PageLayout>Content</PageLayout>);
    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title in mobile header', () => {
    render(<PageLayout title="Dashboard">Content</PageLayout>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders manage nodes button when prop provided', () => {
    const onManage = vi.fn();
    render(<PageLayout onManageNodes={onManage}>Content</PageLayout>);
    expect(screen.getByLabelText('Manage nodes')).toBeInTheDocument();
  });

  it('omits manage nodes button when prop absent', () => {
    render(<PageLayout>Content</PageLayout>);
    expect(screen.queryByLabelText('Manage nodes')).not.toBeInTheDocument();
  });
});
