import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatShell } from '../ChatShell';
import { useSession } from '../AuthProvider';

vi.mock('../AuthProvider', () => ({
  useSession: vi.fn(),
}));

vi.mock('../AIChat', () => ({
  AIChat: () => (
    <div data-testid="ai-chat">AI Chat</div>
  ),
}));

describe('ChatShell', () => {
  const mockedUseSession = vi.mocked(useSession);

  it('renders nothing while loading', () => {
    mockedUseSession.mockReturnValue({ session: null, user: null, loading: true });
    const { container } = render(<ChatShell />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when unauthenticated', () => {
    mockedUseSession.mockReturnValue({ session: null, user: null, loading: false });
    const { container } = render(<ChatShell />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens and closes the floating chat panel for authenticated users', async () => {
    mockedUseSession.mockReturnValue({
      session: {} as never,
      user: { id: 'user-1' } as never,
      loading: false,
    });

    render(<ChatShell />);
    const user = userEvent.setup();

    expect(screen.getByTitle('Open Kelvin AI')).toBeInTheDocument();
    await user.click(screen.getByTitle('Open Kelvin AI'));

    expect(screen.getByTestId('ai-chat')).toHaveTextContent('AI Chat');
    expect(screen.getByTitle('Close chat')).toBeInTheDocument();

    await user.click(screen.getByTitle('Close chat'));
    expect(screen.queryByTestId('ai-chat')).not.toBeInTheDocument();
    expect(screen.getByTitle('Open Kelvin AI')).toBeInTheDocument();
  });

  it('toggles fullscreen mode', async () => {
    mockedUseSession.mockReturnValue({
      session: {} as never,
      user: { id: 'user-1' } as never,
      loading: false,
    });

    render(<ChatShell />);
    const user = userEvent.setup();

    await user.click(screen.getByTitle('Open Kelvin AI'));
    expect(screen.getByTitle('Fullscreen')).toBeInTheDocument();

    await user.click(screen.getByTitle('Fullscreen'));
    expect(screen.getByTitle('Exit fullscreen')).toBeInTheDocument();

    await user.click(screen.getByTitle('Exit fullscreen'));
    expect(screen.getByTitle('Fullscreen')).toBeInTheDocument();
  });
});
