'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { getDeployments } from '@/lib/supabase';
import { guestGetDeployments } from '@/lib/supabase/guestQueries';
import { useGuest } from '@/contexts/GuestContext';
import { useChatPageContext } from '@/lib/chatContext';
import { BounceDots } from './LoadingSpinner';
import { ReportOptionsModal, type ReportQuestionPayload } from './ReportOptionsModal';
import { ReportArtifactCard } from './ReportArtifactCard';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifactId?: string;
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

const REMARK_PLUGINS = [remarkGfm];

const MD_COMPONENTS = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-[var(--divider)] px-2 py-1 text-left bg-[var(--hover-bg)] text-[var(--foreground)] text-xs">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-[var(--divider)] px-2 py-1 text-xs">{children}</td>
  ),
} satisfies Components;

const ChatMessage = memo(function ChatMessage({
  msg,
  index,
  copiedIndex,
  onCopy,
  onDownload,
}: {
  msg: Message;
  index: number;
  copiedIndex: number | null;
  onCopy: (text: string, index: number) => void;
  onDownload: (content: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : 'text-left'} group`}>
        {msg.role === 'assistant' && (
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Kelvin</p>
        )}
        {msg.role === 'user' ? (
          <div className="bg-[var(--primary)] text-white dark:text-[var(--background-main)] px-4 py-2.5 rounded-2xl rounded-br-sm inline-block text-left">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
        ) : (
          <div className="text-base text-[var(--foreground)] leading-relaxed prose prose-sm max-w-none prose-headings:text-[var(--foreground)] prose-headings:font-bold prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2 prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1 prose-p:my-1 prose-li:my-0 prose-strong:text-[var(--foreground)] prose-code:text-[var(--foreground-muted)] prose-pre:bg-[var(--hover-bg)] prose-pre:border prose-pre:border-[var(--divider)]">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {msg.role === 'assistant' && msg.artifactId && (
          <ReportArtifactCard reportId={msg.artifactId} />
        )}
        {msg.role === 'assistant' && msg.content && (
          <div className={`mt-2 flex items-center gap-3 transition-opacity duration-200 ${
            copiedIndex === index ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'
          }`}>
            <button
              onClick={() => onCopy(msg.content, index)}
              className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]/50 hover:text-[var(--foreground-muted)] transition-colors"
              title="Copy to clipboard"
            >
              {copiedIndex === index ? (
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
                onClick={() => onDownload(msg.content)}
                className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]/50 hover:text-[var(--foreground-muted)] transition-colors"
                title="Download as HTML report"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download Report
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolStatus,
  copiedIndex,
  onCopy,
  onDownload,
}: {
  messages: Message[];
  isLoading: boolean;
  toolStatus: string | null;
  copiedIndex: number | null;
  onCopy: (text: string, index: number) => void;
  onDownload: (content: string) => void;
}) {
  return (
    <>
      <div className="space-y-4">
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            msg={msg}
            index={i}
            copiedIndex={copiedIndex}
            onCopy={onCopy}
            onDownload={onDownload}
          />
        ))}
        <AnimatePresence>
          {isLoading && !messages[messages.length - 1]?.content && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start mt-1 pl-1"
            >
              <div className="flex items-center gap-2">
                <BounceDots size="sm" />
                <span className={`text-xs animate-pulse transition-opacity duration-200 ${toolStatus ? 'text-[var(--foreground-muted)]/60 opacity-100' : 'opacity-0'}`}>
                  {toolStatus ? `${toolStatus}...` : '\u00A0'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});

export function AIChat() {
  const pageContext = useChatPageContext();
  const { isGuest } = useGuest();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<ReportQuestionPayload | null>(null);
  const [deploymentNames, setDeploymentNames] = useState<{ name: string; location: string }[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number>(0);
  const scrollTargetIndexRef = useRef<number | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    async function loadDeployments() {
      try {
        const fetchDeps = isGuest ? guestGetDeployments : getDeployments;
        const deps = await fetchDeps({ status: 'active' });
        setDeploymentNames(deps.map(d => ({ name: d.name, location: d.location })));
      } catch {
        setDeploymentNames([]);
      }
    }
    loadDeployments();
  }, [isGuest]);

  // Track whether content extends below the visible scroll area
  const updateScrollHint = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setShowScrollHint(!atBottom);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    return () => el.removeEventListener('scroll', updateScrollHint);
  }, [updateScrollHint]);

  // Re-check when content changes
  useEffect(() => {
    updateScrollHint();
  }, [messages, updateScrollHint]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
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

  // Animate scroll until the target user message is pinned at the top of the
  // scroll container, then stop. Runs every frame during streaming so it can't
  // be cancelled by DOM changes (unlike scrollTo with behavior:'smooth').
  const startScrollAnimation = useCallback((index: number) => {
    scrollTargetIndexRef.current = index;
    cancelAnimationFrame(scrollAnimRef.current);

    const tick = () => {
      const targetIdx = scrollTargetIndexRef.current;
      if (targetIdx == null) return;

      const container = scrollContainerRef.current;
      if (!container) return;
      const wrapper = container.querySelector('.space-y-4');
      if (!wrapper) return;
      const msgEl = wrapper.children[targetIdx] as HTMLElement | undefined;
      if (!msgEl) return;

      const containerRect = container.getBoundingClientRect();
      const msgRect = msgEl.getBoundingClientRect();
      const distance = msgRect.top - containerRect.top;

      if (distance <= 1 && distance >= -1) {
        // Close enough -- pinned at top, stop
        scrollTargetIndexRef.current = null;
        return;
      }

      // Ease toward target: move 18% of remaining distance each frame
      container.scrollTop += distance * 0.18;
      scrollAnimRef.current = requestAnimationFrame(tick);
    };

    // Wait for React to commit the new DOM nodes before starting
    setTimeout(() => {
      scrollAnimRef.current = requestAnimationFrame(tick);
    }, 30);
  }, []);

  // Stop scroll animation on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(scrollAnimRef.current);
      abortControllerRef.current?.abort();
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, []);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setInput('');
    setToolStatus(null);
    // Reset textarea height after clearing input
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.style.height = 'auto';
    });

    const scrollTarget = messages.length; // index where the new user message will be
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: message },
      { id: crypto.randomUUID(), role: 'assistant', content: '' },
    ]);
    startScrollAnimation(scrollTarget);
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
      let rawAccumulated = '';
      let targetContent = ''; // full cleaned text received so far
      let displayedLen = 0;  // how many chars we've shown
      let dripRafId = 0;
      let streamDone = false;

      // Drip loop: feeds words to React at a steady rate, decoupled from
      // network chunk sizes. Time-based so it's frame-rate independent.
      const WORDS_PER_SEC = 48;
      let lastDripTime = 0;
      let wordDebt = 0;

      const dripLoop = (timestamp: number) => {
        if (displayedLen >= targetContent.length) {
          if (!streamDone) dripRafId = requestAnimationFrame(dripLoop);
          return;
        }

        if (!lastDripTime) lastDripTime = timestamp;
        const dt = timestamp - lastDripTime;
        lastDripTime = timestamp;
        wordDebt += (dt / 1000) * WORDS_PER_SEC;

        const wordsToRelease = Math.floor(wordDebt);
        if (wordsToRelease < 1) {
          dripRafId = requestAnimationFrame(dripLoop);
          return;
        }
        wordDebt -= wordsToRelease;

        let end = displayedLen;
        let words = 0;
        while (end < targetContent.length && words < wordsToRelease) {
          end++;
          if (end < targetContent.length && (targetContent[end] === ' ' || targetContent[end] === '\n')) {
            words++;
          }
        }
        // If nearly caught up, show the rest to avoid lingering partial words
        if (targetContent.length - end < 15) end = targetContent.length;

        displayedLen = end;
        const displayText = targetContent.slice(0, displayedLen);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: displayText };
          return updated;
        });

        dripRafId = requestAnimationFrame(dripLoop);
      };

      if (reader) {
        // Start the drip loop
        dripRafId = requestAnimationFrame(dripLoop);

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          rawAccumulated += decoder.decode(value, { stream: true });

          // Extract complete __STATUS__ lines
          const statusRegex = /__STATUS__(.+?)\n/g;
          let statusMatch;
          while ((statusMatch = statusRegex.exec(rawAccumulated)) !== null) {
            setToolStatus(statusMatch[1]);
          }

          // Extract complete __QUESTION__ payloads (for report options modal)
          const questionRegex = /__QUESTION__(.+?)\n/g;
          let questionMatch;
          while ((questionMatch = questionRegex.exec(rawAccumulated)) !== null) {
            try {
              const payload = JSON.parse(questionMatch[1]) as ReportQuestionPayload;
              setPendingQuestion(payload);
            } catch (err) {
              console.warn('Failed to parse __QUESTION__ payload:', err);
            }
          }

          // Build display content: strip complete marker lines
          let displayContent = rawAccumulated
            .replace(/__STATUS__.+?\n/g, '')
            .replace(/__QUESTION__.+?\n/g, '');

          // Hide any trailing partial markers
          for (const marker of ['__STATUS__', '__QUESTION__']) {
            const idx = displayContent.lastIndexOf(marker);
            if (idx !== -1 && !displayContent.substring(idx).includes('\n')) {
              displayContent = displayContent.substring(0, idx);
            }
          }

          // Feed to the drip loop (it will release word-by-word)
          targetContent = displayContent;
        }

        // Stream finished -- let drip loop drain remaining text
        streamDone = true;

        // Wait for drip to finish, then do final cleanup
        await new Promise<void>((resolve) => {
          const waitForDrip = () => {
            if (displayedLen >= targetContent.length) {
              cancelAnimationFrame(dripRafId);
              resolve();
              return;
            }
            requestAnimationFrame(waitForDrip);
          };
          requestAnimationFrame(waitForDrip);
        });

        // Final content
        let finalContent = rawAccumulated
          .replace(/__STATUS__.+?\n/g, '')
          .replace(/__QUESTION__.+?\n/g, '');
        const trailingStatus = finalContent.match(/__STATUS__(.+)$/);
        if (trailingStatus) {
          setToolStatus(trailingStatus[1]);
          finalContent = finalContent.replace(/__STATUS__.+$/, '');
        }
        finalContent = finalContent.replace(/__QUESTION__.+$/, '');

        finalContent = finalContent.trim() || 'Sorry, the response was empty. Please try again or rephrase your question.';
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: finalContent };
          return updated;
        });
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
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
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: errorMsg };
          } else {
            updated.push({ id: crypto.randomUUID(), role: 'assistant', content: errorMsg });
          }
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
      setToolStatus(null);
      scrollTargetIndexRef.current = null;
      cancelAnimationFrame(scrollAnimRef.current);
      abortControllerRef.current = null;
      readerRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input.trim());
  };

  const handleReportGenerated = useCallback(
    (res: { report_id: string; filename: string; byte_size: number }) => {
      setPendingQuestion(null);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Your report is ready.',
          artifactId: res.report_id,
        },
      ]);
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) sendMessage(input.trim());
    }
  };

  const suggestedQuestions = useMemo(() => {
    if (!deploymentNames) return null;

    const questions: string[] = ['Generate a report'];

    if (deploymentNames.length >= 2) {
      questions.push(`Compare ${deploymentNames[0].name} and ${deploymentNames[1].name}`);
    }

    if (deploymentNames.length >= 1) {
      questions.push(`What's the temperature at ${deploymentNames[0].location}?`);
    }

    const fallbacks = [
      'How accurate are my sensors vs. official weather?',
      'Show me temperature trends for the last 7 days',
      'Which location has the highest humidity?',
    ];
    while (questions.length < 3 && fallbacks.length > 0) {
      questions.push(fallbacks.shift()!);
    }

    return questions.slice(0, 3);
  }, [deploymentNames]);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 p-4 sm:p-6">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto mb-0 flex flex-col pr-3 pb-6 scrollbar-thin scrollbar-hide-mobile"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--scrollbar-thumb) transparent',
          overscrollBehavior: 'contain',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 fade-in">
            <p className="text-[var(--foreground-muted)] mb-2 sm:mb-3 text-xl sm:text-3xl font-medium text-center">Ask about your data</p>
            <p className="text-[var(--foreground-muted)]/60 mb-6 sm:mb-8 text-xs sm:text-sm text-center max-w-md">
              Check live readings, validate sensor accuracy against official weather, spot trends, or generate a full report for your paper.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 justify-center w-full sm:w-auto">
              {suggestedQuestions ? suggestedQuestions.map((q, i) => (
                <motion.button
                  key={q}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  onClick={() => sendMessage(q)}
                  className="text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[var(--hover-bg)] text-[var(--foreground-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)] transition-colors text-center"
                >
                  {q}
                </motion.button>
              )) : (
                <>
                  {['w-64', 'w-72', 'w-80', 'w-56'].map((w, i) => (
                    <div key={i} className={`skeleton h-10 ${w} rounded-full`} />
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolStatus={toolStatus}
            copiedIndex={copiedIndex}
            onCopy={copyToClipboard}
            onDownload={downloadReport}
          />
        )}
      </div>

      {/* Bottom fade gradient -- text fades into the input area */}
      <div className="pointer-events-none h-16 -mt-12 relative z-[1] shrink-0" style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--surface-1) 75%)' }} />

      <AnimatePresence>
        {showScrollHint && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors shadow-md backdrop-blur-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Scroll for more
          </motion.button>
        )}
      </AnimatePresence>

      <ReportOptionsModal
        payload={pendingQuestion}
        onClose={() => setPendingQuestion(null)}
        onGenerated={handleReportGenerated}
      />

      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your data..."
          disabled={isLoading}
          rows={1}
          className="flex-1 px-5 py-3 rounded-2xl bg-[var(--input-bg)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none transition-colors disabled:opacity-50 resize-none h-12 min-h-12 max-h-32 leading-6"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={() => abortControllerRef.current?.abort()}
            className="btn-glass px-6 h-12 !rounded-2xl text-sm font-semibold text-red-400 shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-glass px-6 h-12 !rounded-2xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
