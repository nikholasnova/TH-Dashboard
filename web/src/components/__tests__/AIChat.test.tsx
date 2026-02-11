import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIChat } from '../AIChat';
import { useChatPageContext } from '@/lib/chatContext';

vi.mock('@/lib/chatContext', () => ({
  useChatPageContext: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getDeployments: vi.fn(async () => []),
}));

describe('AIChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();

    vi.mocked(useChatPageContext).mockReturnValue({ page: 'dashboard' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends page context and strips status markers from streamed content', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('__STATUS__Fetching readings\n'));
        controller.enqueue(encoder.encode('Hello from Kelvin'));
        controller.close();
      },
    });

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(stream, { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AIChat />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Ask about your data...'), 'What is the latest temp?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) throw new Error('Expected fetch init payload');
    const payload = JSON.parse((init.body as string) || '{}') as {
      pageContext?: { page?: string };
    };
    expect(payload.pageContext).toEqual({ page: 'dashboard' });

    expect(await screen.findByText('Hello from Kelvin')).toBeInTheDocument();
    expect(screen.queryByText(/__STATUS__/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fetching readings/)).not.toBeInTheDocument();
  });

  it('shows friendly error text for 429 responses', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a few minutes.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AIChat />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Ask about your data...'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(
      await screen.findByText('Too many requests — please wait a moment and try again.')
    ).toBeInTheDocument();
  });
});
