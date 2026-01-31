'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup on unmount
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

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Stream the response
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
  ];

  return (
    <div className="glass-card p-6">
      <h3 className="text-2xl font-bold text-white mb-4 text-center">Kelvin AI</h3>

      {/* Messages */}
      <div
        className="h-[32rem] overflow-y-auto mb-4 flex flex-col pr-3 scrollbar-thin"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-[#a0aec0] mb-8 text-3xl font-medium">Ask me about your sensor data</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-sm px-5 py-2.5 rounded-full bg-white/5 text-[#a0aec0] hover:bg-white/10 hover:text-white transition-colors"
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
                    <p className="text-base text-white whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your sensor data..."
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
