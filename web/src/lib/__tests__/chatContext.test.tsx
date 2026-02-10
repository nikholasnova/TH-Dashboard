import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ChatPageContextProvider,
  useChatPageContext,
  useSetChatPageContext,
} from '../chatContext';

function ContextHarness() {
  const pageContext = useChatPageContext();
  const setPageContext = useSetChatPageContext();

  return (
    <div>
      <pre data-testid="ctx">{JSON.stringify(pageContext)}</pre>
      <button
        type="button"
        onClick={() =>
          setPageContext({
            page: 'charts',
            timeRange: '24h',
            deviceFilter: 'node1',
            deploymentId: 12,
          })
        }
      >
        Update
      </button>
    </div>
  );
}

describe('chatContext', () => {
  it('starts empty and updates via provider setter', async () => {
    render(
      <ChatPageContextProvider>
        <ContextHarness />
      </ChatPageContextProvider>
    );

    expect(screen.getByTestId('ctx')).toHaveTextContent('{}');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(screen.getByTestId('ctx')).toHaveTextContent('"page":"charts"');
    expect(screen.getByTestId('ctx')).toHaveTextContent('"timeRange":"24h"');
    expect(screen.getByTestId('ctx')).toHaveTextContent('"deviceFilter":"node1"');
    expect(screen.getByTestId('ctx')).toHaveTextContent('"deploymentId":12');
  });
});
