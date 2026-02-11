'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getDeployments } from '@/lib/supabase';
import { useChatPageContext } from '@/lib/chatContext';
import { BounceDots } from './LoadingSpinner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}


function markdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/\|/g, '\t')
    .replace(/^[\t\s-]+$/gm, '')
    .replace(/^\t+|\t+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function simpleMarkdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(
    /^(\|.+\|)\n(\|[-|\s:]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  html = html.replace(/\n/g, '<br>');

  html = html.replace(/<p><\/p>/g, '');

  return html;
}

export function AIChat() {
  const pageContext = useChatPageContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [deploymentNames, setDeploymentNames] = useState<{ name: string; location: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    async function loadDeployments() {
      try {
        const deps = await getDeployments({ status: 'active' });
        setDeploymentNames(deps.map(d => ({ name: d.name, location: d.location })));
      } catch {}
    }
    loadDeployments();
  }, []);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(markdownToPlainText(text));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const downloadReport = useCallback((content: string) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kelvin AI Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    h1, h2, h3 { margin-top: 1.5em; color: #111; }
    h1 { font-size: 1.8em; }
    h2 { font-size: 1.4em; }
    h3 { font-size: 1.15em; }
    ul { padding-left: 1.5em; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    strong { font-weight: 600; }
  </style>
</head>
<body>${simpleMarkdownToHtml(content)}</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.html`;
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
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, []);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setInput('');
    setToolStatus(null);
    setMessages((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages, pageContext }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMsg = 'Sorry, something went wrong. Please try again.';
        try {
          const errorData = await response.json();
          if (response.status === 401) {
            errorMsg = 'Your session has expired. Please refresh the page and log in again.';
          } else if (response.status === 429) {
            errorMsg = 'Too many requests — please wait a moment and try again.';
          } else if (response.status === 500 && errorData?.error?.includes('API key')) {
            errorMsg = 'The AI service is not configured. Please contact the administrator.';
          }
        } catch {
          // Response wasn't JSON, use default message
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      readerRef.current = reader || null;
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines for status markers, pass rest through as content
          const lines = buffer.split('\n');
          // Keep the last element as buffer (may be incomplete)
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('__STATUS__')) {
              setToolStatus(line.slice('__STATUS__'.length));
            } else {
              assistantContent += line + '\n';
            }
          }

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
            return updated;
          });
        }

        // Process any remaining buffer
        if (buffer) {
          if (buffer.startsWith('__STATUS__')) {
            setToolStatus(buffer.slice('__STATUS__'.length));
          } else {
            assistantContent += buffer;
          }
        }

        // Final message update — fallback if stream ended with no content
        const finalContent = assistantContent.trim() || 'Sorry, the response was empty. Please try again or rephrase your question.';
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: finalContent };
          return updated;
        });
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Remove the empty placeholder assistant message left by abort
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } else {
        const errorMsg = (error as Error).message || 'Sorry, something went wrong. Please try again.';
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
            updated[updated.length - 1] = { role: 'assistant', content: errorMsg };
          } else {
            updated.push({ role: 'assistant', content: errorMsg });
          }
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
      setToolStatus(null);
      abortControllerRef.current = null;
      readerRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input.trim());
  };

  const suggestedQuestions = useMemo(() => {
    const questions: string[] = [];

    if (deploymentNames.length >= 2) {
      questions.push(`Compare ${deploymentNames[0].name} and ${deploymentNames[1].name}`);
    }

    if (deploymentNames.length >= 1) {
      questions.push(`What's the temperature at ${deploymentNames[0].location}?`);
    }

    questions.push('How accurate are my sensors vs. official weather?');
    questions.push('Generate a report for my paper');

    const fallbacks = [
      'Show me temperature trends for the last 7 days',
      'Which location has the highest humidity?',
      'Show me stats for active deployments',
    ];
    while (questions.length < 4 && fallbacks.length > 0) {
      questions.push(fallbacks.shift()!);
    }

    return questions.slice(0, 4);
  }, [deploymentNames]);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-6">
      <div
        className="flex-1 min-h-0 overflow-y-auto mb-4 flex flex-col pr-3 scrollbar-thin"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <p className="text-[#a0aec0] mb-2 sm:mb-3 text-xl sm:text-3xl font-medium text-center">Ask about your data</p>
            <p className="text-[#a0aec0]/60 mb-6 sm:mb-8 text-xs sm:text-sm text-center max-w-md">
              Check live readings, validate sensor accuracy against official weather, spot trends, or generate a full report for your paper.
            </p>
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
                            onClick={() => downloadReport(msg.content)}
                            className="flex items-center gap-1 text-xs text-[#a0aec0]/50 hover:text-[#a0aec0] transition-colors"
                            title="Download as HTML report"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Download Report
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && !messages[messages.length - 1]?.content && (
                <div className="flex justify-start -mt-3">
                  <div className="flex items-center gap-2">
                    <BounceDots size="sm" />
                    {toolStatus && (
                      <span className="text-xs text-[#a0aec0]/60 animate-pulse">{toolStatus}...</span>
                    )}
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
        {isLoading ? (
          <button
            type="button"
            onClick={() => abortControllerRef.current?.abort()}
            className="btn-glass px-6 py-3 text-sm font-semibold text-red-400"
            style={{ borderColor: 'rgba(248, 113, 113, 0.3)' }}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-glass px-6 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
