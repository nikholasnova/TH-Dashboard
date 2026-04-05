import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('../UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">UserMenu</div>,
}));

import { Navbar } from '../Navbar';

describe('Navbar', () => {
  it('renders all nav links', () => {
    mockPathname = '/';
    render(<Navbar />);
    expect(screen.getAllByText('Live')).toHaveLength(2); // desktop + mobile
    expect(screen.getAllByText('Charts')).toHaveLength(2);
    expect(screen.getAllByText('Compare')).toHaveLength(2);
    expect(screen.getAllByText('Analysis')).toHaveLength(2);
    expect(screen.getAllByText('Deploy')).toHaveLength(1); // mobile only
    expect(screen.getAllByText('Deployments')).toHaveLength(1); // desktop only
  });

  it('marks exact "/" as active', () => {
    mockPathname = '/';
    render(<Navbar />);
    const liveLinks = screen.getAllByText('Live');
    expect(liveLinks[0].closest('a')?.className).toContain('nav-active');
  });

  it('marks prefix match as active for non-root routes', () => {
    mockPathname = '/charts/export';
    render(<Navbar />);
    const chartLinks = screen.getAllByText('Charts');
    expect(chartLinks[0].closest('a')?.className).toContain('nav-active');
  });

  it('does not mark "/" active when on other routes', () => {
    mockPathname = '/charts';
    render(<Navbar />);
    const liveLinks = screen.getAllByText('Live');
    expect(liveLinks[0].closest('a')?.className).not.toContain('nav-active');
  });

  it('renders UserMenu', () => {
    mockPathname = '/';
    render(<Navbar />);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });
});
