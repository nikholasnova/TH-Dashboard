'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface PageContext {
  page?: string;
  timeRange?: string;
  deviceFilter?: string;
  deploymentId?: number;
  customStart?: string;
  customEnd?: string;
}

interface ChatPageContextValue {
  pageContext: PageContext;
  setPageContext: (ctx: PageContext) => void;
}

const ChatPageCtx = createContext<ChatPageContextValue>({
  pageContext: {},
  setPageContext: () => {},
});

export function ChatPageContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext>({});

  const setPageContext = useCallback((ctx: PageContext) => {
    setPageContextState(ctx);
  }, []);

  return (
    <ChatPageCtx.Provider value={{ pageContext, setPageContext }}>
      {children}
    </ChatPageCtx.Provider>
  );
}

export const useChatPageContext = () => useContext(ChatPageCtx).pageContext;
export const useSetChatPageContext = () => useContext(ChatPageCtx).setPageContext;
