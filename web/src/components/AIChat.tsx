'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const downloadMarkdown = useCallback((content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      if (reader) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
            return updated;
          });
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input.trim());
  };

  const suggestedQuestions = [
    'Compare the temperature across all deployments',
    'Which location has the highest humidity?',
    'Show me stats for active deployments',
    'Generate a report for my paper',
  ];

  return (
    <div className="glass-card p-6">
      <h3 className="text-2xl font-bold text-white mb-4 text-center">Kelvin AI</h3>

      <div
        className="h-[29rem] overflow-y-auto mb-4 flex flex-col pr-3 scrollbar-thin"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <p className="text-[#a0aec0] mb-6 sm:mb-8 text-xl sm:text-3xl font-medium text-center">Ask about your data</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 justify-center w-full sm:w-auto">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-white/5 text-[#a0aec0] hover:bg-white/10 hover:text-white transition-colors text-center"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1" />
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <p className="text-xs text-[#a0aec0] mb-1">{msg.role === 'user' ? 'You' : 'Kelvin'}</p>
                    {msg.role === 'user' ? (
                      <p className="text-base text-white whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : (
                      <div className="text-base text-white leading-relaxed prose prose-invert prose-sm max-w-none prose-headings:text-white prose-headings:font-bold prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1 prose-p:my-1 prose-li:my-0 prose-strong:text-white prose-code:text-[#a0aec0] prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2">
                                <table className="text-xs border-collapse w-full">{children}</table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="border border-white/20 px-2 py-1 text-left bg-white/5 text-white text-xs">{children}</th>
                            ),
                            td: ({ children }) => (
                              <td className="border border-white/10 px-2 py-1 text-xs">{children}</td>
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.content && (
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => copyToClipboard(msg.content, i)}
                          className="flex items-center gap-1 text-xs text-[#a0aec0]/50 hover:text-[#a0aec0] transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedIndex === i ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              Copy
                            </>
                          )}
                        </button>
                        {msg.content.length > 500 && (
                          <button
                            onClick={() => downloadMarkdown(msg.content)}
                            className="flex items-center gap-1 text-xs text-[#a0aec0]/50 hover:text-[#a0aec0] transition-colors"
                            title="Download as Markdown"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Download .md
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="text-left">
                    <p className="text-xs text-[#a0aec0] mb-1">Kelvin</p>
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data..."
          disabled={isLoading}
          className="flex-1 px-6 py-3 rounded-full bg-white/5 border border-white/20 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/40 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="btn-glass px-6 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '...' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
