import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data yet" />);
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<EmptyState title="Empty" subtitle="Try adding some data" />);
    expect(screen.getByText('Try adding some data')).toBeInTheDocument();
  });

  it('omits subtitle when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
  });
});
