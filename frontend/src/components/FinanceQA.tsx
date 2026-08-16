"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, Calculator, CheckCircle2, Database, Download, FileText, LoaderCircle, MessageSquarePlus, Sparkles } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useAnalytics } from './Analytics';
import Feedback from './Feedback';
import { ShowTheMathContent, DatabaseSourceSection, downloadShowTheMathAsText, type ShowTheMathData } from './ShowTheMathModal';
import { formatKeyNumberValue, type DisplayKeyNumber } from '@/lib/formatKeyNumber';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  threadId?: string | null;
  timestamp: number;
}

interface FinanceQAProps {
  onNewAnswer?: (question: string, answer: string) => void;
  selectedPrompt?: PromptHistory | null;
  /** Bumped every time "New decision" is clicked, including when nothing is selected. */
  newDecisionNonce?: number;
}

/** randomUUID needs a secure context; the fallback keeps non-HTTPS dev working. */
function newThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PLACEHOLDER_QUESTIONS = [
  "What part of my retirement plan breaks first if interest rates stay high longer than expected?",
  "If markets underperform for 5 years, can my retirement plan still hold?",
  "Am I taking more risk than I realize by staying in cash right now?",
  "What happens to my retirement plan if inflation never really goes back to 2%?",
  "Assuming today’s rates, what’s the smartest thing to do with excess cash?",
  "If I stop increasing my retirement contributions now, what does that cost me later?",
  "Which matters more right now: paying down debt or staying liquid?",
  "How exposed am I to a recession if it hits next year?",
  "What assumptions in my retirement plan matter most if they’re wrong?",
  "Given everything going on right now, am I actually doing okay?"
];

export default function FinanceQA({ onNewAnswer, selectedPrompt, newDecisionNonce = 0 }: FinanceQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userTier, setUserTier] = useState<string>('starter');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // The line of questioning this composer is in. "New decision" clears it and
  // the next question mints a fresh one; a follow-up keeps it. That single value
  // is what tells the server which turns count as context, so it never has to
  // guess from the wording whether "$125K" belongs to this question.
  const [threadId, setThreadId] = useState<string | null>(null);
  // Bumped when a decision is abandoned so a late answer cannot resurrect its
  // thread after "New decision" lands during analysis.
  const askEpochRef = useRef(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [structuredResponse, setStructuredResponse] = useState<{
    summary: string;
    key_numbers?: Record<string, DisplayKeyNumber | number>;
    insights?: string[];
    suggested_actions?: string[];
  } | null>(null);
  const [showTheMathData, setShowTheMathData] = useState<ShowTheMathData | null>(null);
  const [loadingShowTheMath, setLoadingShowTheMath] = useState(false);
  const [showTheMathError, setShowTheMathError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'answer' | 'math' | 'sources'>('answer');
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);
  const { trackEvent } = useAnalytics();

  // Rotate placeholder every 4 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_QUESTIONS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Fetch current user tier on component mount
  useEffect(() => {
    const fetchUserTier = async () => {
      try {
        const response = await fetch(`${API_URL}/test/current-tier`);
        if (response.ok) {
          const data = await response.json();
          setUserTier(data.backendTier);
        }
      } catch (error) {
        console.error('Error fetching user tier:', error);
      }
    };

    fetchUserTier();
  }, [API_URL]);

  /**
   * Leave nothing of the last decision behind.
   *
   * The composer is pre-filled with a past question whenever a turn is opened,
   * so without clearing it the previous question sits in the box waiting to be
   * re-submitted. The placeholder rotation takes over again once it is empty.
   * Dropping the thread is what makes the next question start clean instead of
   * inheriting the last one's assumptions.
   */
  const startNewDecision = useCallback(() => {
    askEpochRef.current += 1;
    setLoading(false);
    setProgressMessage(null);
    setQuestion('');
    setAnswer('');
    setStreamingAnswer('');
    setStructuredResponse(null);
    setShowTheMathData(null);
    setShowTheMathError(null);
    setConversationId(null);
    setThreadId(null);
    setError('');
  }, []);

  // Update question and answer when selectedPrompt changes
  useEffect(() => {
    if (selectedPrompt) {
      setQuestion(selectedPrompt.question);
      setAnswer(selectedPrompt.answer);
      setConversationId(selectedPrompt.id);
      // Opening a past turn resumes its line of questioning, so a follow-up
      // continues where that decision left off. Turns written before threads
      // existed are back-filled to their own id, so resuming one still puts
      // that turn in scope.
      // Rows written before threads, or by a client that predates them, may still
      // have no threadId in storage. The row's own id is the effective thread key.
      setThreadId(selectedPrompt.threadId ?? selectedPrompt.id);
      setStructuredResponse(null);
      setShowTheMathData(null);
      setError('');
      setActiveView('answer');
      setSelectedSourceKey(null);
    } else {
      startNewDecision();
    }
  }, [selectedPrompt, startNewDecision]);

  /**
   * "New decision" clicked while nothing was selected.
   *
   * Clearing the selection is not enough on its own: when it is already null the
   * prop never changes, the effect above never reruns, and the previous thread
   * stays active — so the next supposedly fresh question inherits the old
   * decision's context. Reachable whenever the post-answer history reload fails
   * or is still in flight. The counter makes the reset an explicit signal rather
   * than a side effect of a value transition.
   */
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    startNewDecision();
  }, [newDecisionNonce, startNewDecision]);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const questionToAsk = question.trim() || PLACEHOLDER_QUESTIONS[placeholderIndex];
    const epoch = ++askEpochRef.current;
    const isStale = () => epoch !== askEpochRef.current;

    setLoading(true);
    setProgressMessage(null);
    setError('');
    setAnswer('');
    setStreamingAnswer('');
    setStructuredResponse(null);
    setShowTheMathData(null);
    setShowTheMathError(null);
    setConversationId(null);
    setActiveView('answer');
    setSelectedSourceKey(null);

    // Track question submission
    trackEvent('question_asked', {
      question_length: questionToAsk.length,
      user_tier: userTier
    });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        console.log('No auth token found for ask request');
      }

      const endpoint = '/ask/display-real';
      // Mint on the first question of a decision so even that turn is already in
      // a thread; every follow-up reuses it until "New decision" clears it.
      const activeThreadId = threadId ?? newThreadId();
      if (activeThreadId !== threadId) setThreadId(activeThreadId);
      const requestBody = { question: questionToAsk, threadId: activeThreadId };

      headers['Accept'] = 'text/event-stream';

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      // Check for authentication errors first
      if (res.status === 401) {
        // Session expired - redirect to login
        console.log('Session expired, redirecting to login');
        localStorage.removeItem('auth_token');
        window.location.href = '/login?message=' + encodeURIComponent('Your session has expired. Please log in again.');
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      const isSSE = contentType.includes('text/event-stream');

      if (isSSE && res.body) {
        // Parse SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        const processLine = (line: string) => {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            try {
              const data = JSON.parse(currentData);
              if (isStale()) {
                // A newer decision started while this stream was in flight.
              } else if (currentEvent === 'progress' && data.message) {
                setProgressMessage(data.message);
              } else if (currentEvent === 'answerDelta' && typeof data.delta === 'string') {
                setStreamingAnswer((prev) => prev + data.delta);
              } else if (currentEvent === 'answerReset') {
                // Validation triggered a regeneration; discard the streamed first pass.
                setStreamingAnswer('');
              } else if (currentEvent === 'result') {
                if (data.answer) {
                  setAnswer(data.answer);
                  setStreamingAnswer('');
                  if (data.structuredResponse) setStructuredResponse(data.structuredResponse);
                  if (data.conversationId) setConversationId(data.conversationId);
                  if (data.threadId) setThreadId(data.threadId);
                  if (onNewAnswer) onNewAnswer(questionToAsk, data.answer);
                  trackEvent('answer_received', { answer_length: data.answer.length, user_tier: userTier });
                } else {
                  setError('No answer returned.');
                  trackEvent('question_error', { error: 'No answer returned', user_tier: userTier });
                }
              } else if (currentEvent === 'error' && data.error) {
                setError(data.error);
                trackEvent('question_error', { error: data.error, user_tier: userTier });
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
            currentEvent = '';
            currentData = '';
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            processLine(line);
          }
        }
        if (buffer) {
          buffer.split('\n').forEach(processLine);
        }
      } else {
        // JSON response from a non-streaming backend configuration.
        const data = await res.json();

        if (isStale()) return;
        if (!res.ok && data.error) {
          setError(data.error);
          return;
        }
        if (data.error && !data.answer) {
          setError(data.error);
          return;
        }
        if (data.answer) {
          setAnswer(data.answer);
          if (data.structuredResponse) setStructuredResponse(data.structuredResponse);
          if (data.conversationId) setConversationId(data.conversationId);
          if (data.threadId) setThreadId(data.threadId);
          if (onNewAnswer) onNewAnswer(questionToAsk, data.answer);
          trackEvent('answer_received', { answer_length: data.answer.length, user_tier: userTier });
        } else {
          setError('No answer returned.');
          trackEvent('question_error', { error: 'No answer returned', user_tier: userTier });
        }
      }
    } catch (error) {
      if (!isStale()) {
        setError('Error contacting backend.');
        console.error('Error:', error);

        // Track error
        trackEvent('question_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          user_tier: userTier
        });
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        setProgressMessage(null);
      }
    }
  };

  const loadShowTheMathData = useCallback(async () => {
    if (showTheMathData || loadingShowTheMath) return;
    if (!conversationId) return;
    setLoadingShowTheMath(true);
    setShowTheMathError(null);
    try {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('auth_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const endpoint = `/conversations/${conversationId}/show-the-math`;
      const res = await fetch(`${API_URL}${endpoint}`, { headers });
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login?message=' + encodeURIComponent('Your session has expired. Please log in again.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setShowTheMathData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setShowTheMathError(err.error || 'No pipeline data available for this conversation');
      }
    } catch (_err) {
      setShowTheMathError('Failed to load pipeline data');
    } finally {
      setLoadingShowTheMath(false);
    }
  }, [showTheMathData, loadingShowTheMath, conversationId, API_URL]);

  const showTheMathViewData: Partial<ShowTheMathData> | null = showTheMathData;


  const sourceEntries = Object.entries(showTheMathViewData?.databaseData || {}).filter(([, value]) => value != null);
  const selectedSourceEntry = selectedSourceKey
    ? sourceEntries.find(([key]) => key === selectedSourceKey) ?? null
    : null;
  const hasResult = Boolean(answer || streamingAnswer || loading);
  const canDownloadMath = !loadingShowTheMath && !showTheMathError && showTheMathViewData && Object.keys(showTheMathViewData).length > 0;

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#102319]/10 bg-[#fffdf5] shadow-[0_20px_60px_rgba(18,60,47,0.08)]" aria-label="Decision analysis">
      <div className="border-b border-[#102319]/10 px-5 py-5 sm:px-8 sm:py-7">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#49725a]"><Sparkles size={14} />Ask Linc</div>
        <form id="finance-qa-form" onSubmit={askQuestion}>
          <label htmlFor="finance-question" className="sr-only">Your financial question</label>
          <textarea
            id="finance-question"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            className="min-h-24 w-full resize-none bg-transparent text-xl font-medium leading-8 text-[#102319] outline-none placeholder:text-[#7a857e] sm:text-2xl"
            disabled={loading}
            placeholder={PLACEHOLDER_QUESTIONS[placeholderIndex]}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#102319]/10 pt-4">
            <p className="text-xs text-[#5e6b63]">Uses connected accounts, calculations, and current context when available.</p>
            <button type="submit" disabled={loading} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-full bg-[#102319] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173c2c] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <><LoaderCircle className="animate-spin" size={17} />Analyzing</> : <>{hasResult ? 'Ask follow-up' : 'Analyze decision'}<ArrowUp size={17} /></>}
            </button>
          </div>
        </form>
      </div>

      {!hasResult && !error && (
        <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
          <div className="max-w-md"><div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-[#d9ff6f] text-[#102319]"><MessageSquarePlus /></div><h2 className="text-xl font-semibold text-[#102319]">Start with the decision in front of you</h2><p className="mt-2 text-sm leading-6 text-[#5e6b63]">Ask a specific question. Linc will lead with an answer, then keep the assumptions, calculations, and evidence close by.</p></div>
        </div>
      )}

      {error && (
        <div role="alert" className="m-5 rounded-2xl border border-[#b84a3d]/25 bg-[#fff2ed] p-5 sm:m-8"><h2 className="font-semibold text-[#8b3027]">We couldn’t complete this analysis</h2><p className="mt-1 text-sm text-[#8b3027]/80">{error}</p><p className="mt-3 text-xs text-[#8b3027]/70">Your question is still here. Check your connection and try again.</p></div>
      )}

      {hasResult && (
        <div>
          <div className="flex overflow-x-auto border-b border-[#102319]/10 px-5 sm:px-8" role="tablist" aria-label="Decision details">
            {(['answer', 'math', 'sources'] as const).map(view => (
              <button key={view} type="button" role="tab" aria-selected={activeView === view} onClick={() => { setActiveView(view); if (view !== 'sources') setSelectedSourceKey(null); if (view !== 'answer' && conversationId && !loading) loadShowTheMathData(); }} className={`border-b-2 px-4 py-4 text-sm font-semibold capitalize transition ${activeView === view ? 'border-[#102319] text-[#102319]' : 'border-transparent text-[#66736b] hover:text-[#102319]'}`}>{view}</button>
            ))}
          </div>

          <div className="p-5 sm:p-8">
            {activeView === 'answer' && (
              <div className="space-y-7">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#49725a]">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} {loading ? (progressMessage || 'Building your answer') : 'Current answer'}</div>
                {structuredResponse?.key_numbers && Object.keys(structuredResponse.key_numbers).length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Key numbers">{Object.entries(structuredResponse.key_numbers).map(([key, value]) => <div key={key} className="rounded-2xl bg-[#f3f2e9] p-4"><div className="text-xs font-semibold uppercase tracking-wider text-[#5e6b63]">{key.replace(/_/g, ' ')}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-[#102319]">{formatKeyNumberValue(key, value)}</div>{typeof value === 'object' && value.provenance && <div className="mt-2 break-all text-[10px] text-[#66736b]">Source: {value.provenance}</div>}</div>)}</div>
                )}
                <div className="decision-answer prose prose-slate max-w-none text-[#48574e] prose-headings:text-[#102319] prose-a:text-[#397052]">{structuredResponse ? <MarkdownRenderer>{structuredResponse.summary}</MarkdownRenderer> : streamingAnswer ? <><MarkdownRenderer>{streamingAnswer}</MarkdownRenderer><span className="inline-block h-4 w-1.5 animate-pulse bg-[#102319]" /></> : answer ? <MarkdownRenderer>{answer}</MarkdownRenderer> : <div className="space-y-3" aria-label="Answer loading"><div className="h-4 w-11/12 animate-pulse rounded bg-[#dfe6d4]" /><div className="h-4 w-4/5 animate-pulse rounded bg-[#dfe6d4]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[#dfe6d4]" /></div>}</div>
                {structuredResponse?.insights && structuredResponse.insights.length > 0 && <section className="rounded-2xl border border-[#102319]/10 p-5"><h3 className="mb-3 font-semibold text-[#102319]">Key assumptions and decision factors</h3><ul className="space-y-3 text-sm leading-6 text-[#48675e]">{structuredResponse.insights.map((insight, index) => <li key={index} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#49725a]" />{insight}</li>)}</ul></section>}
                {structuredResponse?.suggested_actions && structuredResponse.suggested_actions.length > 0 && <section><h3 className="mb-3 font-semibold text-[#102319]">Ways to move forward</h3><div className="grid gap-3 sm:grid-cols-2">{structuredResponse.suggested_actions.map((action, index) => <div key={index} className="rounded-2xl bg-[#e2edff] p-4 text-sm leading-6 text-[#254b75]">{action}</div>)}</div><p className="mt-3 text-xs text-[#66736b]">Interactive scenario comparison is not yet available in the current product API.</p></section>}
                {conversationId && answer && !loading && <Feedback conversationId={conversationId} onFeedbackSubmitted={(score) => trackEvent('feedback_submitted', { score, user_tier: userTier })} />}
              </div>
            )}

            {activeView === 'math' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-[#102319]"><Calculator size={19} />Calculations and pipeline</h2>
                    <p className="mt-1 text-sm text-[#5e6b63]">Inspect the context, intermediate work, and validation behind this answer.</p>
                  </div>
                  {canDownloadMath && (
                    <button
                      type="button"
                      onClick={() => downloadShowTheMathAsText(showTheMathViewData!)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#102319]/15 px-3.5 py-2 text-sm font-semibold text-[#486657] transition hover:bg-[#f3f2e9] hover:text-[#102319]"
                      aria-label="Download calculation details as text file"
                    >
                      <Download size={16} />
                      Download
                    </button>
                  )}
                </div>
                {loadingShowTheMath ? (
                  <div className="flex items-center gap-2 py-10 text-sm text-[#5e6b63]"><LoaderCircle className="animate-spin" size={18} />Loading calculation details…</div>
                ) : showTheMathError ? (
                  <div role="alert" className="rounded-2xl bg-[#fff2ed] p-4 text-sm text-[#8b3027]">{showTheMathError}</div>
                ) : showTheMathViewData ? (
                  <ShowTheMathContent data={showTheMathViewData} />
                ) : (
                  <p className="rounded-2xl bg-[#f3f2e9] p-5 text-sm text-[#5e6b63]">Calculation details will appear when the analysis is complete.</p>
                )}
              </div>
            )}

            {activeView === 'sources' && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Evidence bundle</p>
                <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-[-.035em] text-[#102319]"><Database size={20} />Supporting evidence</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b63]">These are the real data groups recorded with this answer.</p>
                {loadingShowTheMath ? (
                  <div className="flex items-center gap-2 py-10 text-sm text-[#5e6b63]"><LoaderCircle className="animate-spin" size={18} />Loading sources…</div>
                ) : sourceEntries.length > 0 ? (
                  <div className="mt-6 space-y-6">
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {sourceEntries.map(([key, value], index) => {
                        const isSelected = selectedSourceKey === key;
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => setSelectedSourceKey(isSelected ? null : key)}
                              aria-expanded={isSelected}
                              className={`group w-full rounded-2xl border p-5 text-left transition ${
                                isSelected
                                  ? 'border-[#397052] bg-[#eef4ea] shadow-[0_10px_30px_rgba(16,35,25,0.08)]'
                                  : 'border-[#102319]/12 bg-[#f9f8f0] hover:border-[#49725a]/45'
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isSelected ? 'bg-[#d9e8d4] text-[#28543a]' : 'bg-[#e0eadf] text-[#397052]'}`}><FileText size={17} /></span>
                                <div className="min-w-0">
                                  <div className="mb-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#7a857e]">Source {String(index + 1).padStart(2, '0')}</div>
                                  <div className="font-semibold capitalize text-[#102319]">{key.replace(/_/g, ' ')}</div>
                                  <div className="mt-1 text-xs text-[#66736b]">{Array.isArray(value) ? `${value.length} recorded item${value.length === 1 ? '' : 's'}` : 'Recorded analysis context'}</div>
                                  <div className="mt-3 text-xs font-semibold text-[#397052]">{isSelected ? 'Hide source data' : 'View source data'}</div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {selectedSourceEntry && (
                      <DatabaseSourceSection
                        sourceKey={selectedSourceEntry[0]}
                        value={selectedSourceEntry[1]}
                        defaultOpen
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-[#102319]/10 bg-[#f3f2e9] p-5 text-sm leading-6 text-[#5e6b63]">No supporting source bundle is available for this conversation. The answer remains visible, but its underlying evidence cannot be inspected.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </section>
  );
}
