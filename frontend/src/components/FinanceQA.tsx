"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUp, Calculator, CheckCircle2, Database, FileText, LoaderCircle, MessageSquarePlus, Sparkles } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useAnalytics } from './Analytics';
import Feedback from './Feedback';
import ShowTheMathModal, { ShowTheMathContent, type ShowTheMathData } from './ShowTheMathModal';
import { formatKeyNumberValue } from '@/lib/formatKeyNumber';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

interface FinanceQAProps {
  onNewAnswer?: (question: string, answer: string) => void;
  selectedPrompt?: PromptHistory | null;
  onNewQuestion?: () => void;
  isDemo?: boolean;
  sessionId?: string;
  /** Pre-fill and auto-submit this question (e.g. from hero click on homepage) */
  initialQuestion?: string | null;
}

export default function FinanceQA({ onNewAnswer, selectedPrompt, onNewQuestion: _onNewQuestion, isDemo = false, sessionId: propSessionId, initialQuestion: propInitialQuestion }: FinanceQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userTier, setUserTier] = useState<string>('starter');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [structuredResponse, setStructuredResponse] = useState<{
    summary: string;
    key_numbers?: Record<string, number>;
    insights?: string[];
    suggested_actions?: string[];
  } | null>(null);
  const [showTheMathData, setShowTheMathData] = useState<ShowTheMathData | null>(null);
  const [liveShowTheMathData, setLiveShowTheMathData] = useState<Partial<ShowTheMathData>>({});
  const [showTheMathModalOpen, setShowTheMathModalOpen] = useState(false);
  const [loadingShowTheMath, setLoadingShowTheMath] = useState(false);
  const [showTheMathError, setShowTheMathError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'answer' | 'math' | 'sources'>('answer');
  const { trackEvent } = useAnalytics();

  // Demo placeholder questions that rotate
  const demoPlaceholders = [
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

  // Regular user placeholder questions that also rotate
  const userPlaceholders = [
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

  // Rotate placeholder every 4 seconds for all users
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDemo) {
        setPlaceholderIndex((prev) => (prev + 1) % demoPlaceholders.length);
      } else {
        setPlaceholderIndex((prev) => (prev + 1) % userPlaceholders.length);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isDemo, demoPlaceholders.length, userPlaceholders.length]);

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

  // Auto-submit initial question when coming from hero click (demo only)
  const initialQuestionRef = React.useRef<string | null>(null);
  const initialQuestionSubmitted = React.useRef(false);
  useEffect(() => {
    if (!isDemo || !propSessionId || !propInitialQuestion?.trim() || initialQuestionSubmitted.current) return;
    initialQuestionSubmitted.current = true;
    initialQuestionRef.current = propInitialQuestion.trim();
    setQuestion(propInitialQuestion.trim());
    const timer = setTimeout(() => {
      const form = document.querySelector<HTMLFormElement>('#finance-qa-form');
      form?.requestSubmit();
    }, 50);
    return () => clearTimeout(timer);
  }, [isDemo, propSessionId, propInitialQuestion]);

  // Update question and answer when selectedPrompt changes
  useEffect(() => {
    if (selectedPrompt) {
      setQuestion(selectedPrompt.question);
      setAnswer(selectedPrompt.answer);
      setConversationId(selectedPrompt.id);
      setStructuredResponse(null);
      setShowTheMathData(null);
      setLiveShowTheMathData({});
      setError('');
      setActiveView('answer');
    } else {
      setAnswer('');
      setStreamingAnswer('');
      setStructuredResponse(null);
      setShowTheMathData(null);
      setLiveShowTheMathData({});
      setError('');
    }
  }, [selectedPrompt]);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    // Use initial question from hero click, then typed question, then placeholder
    const questionToAsk = initialQuestionRef.current || question.trim() || (isDemo ? demoPlaceholders[placeholderIndex] : userPlaceholders[placeholderIndex]);
    if (initialQuestionRef.current) initialQuestionRef.current = null;

    setLoading(true);
    setProgressMessage(null);
    setError('');
    setAnswer('');
    setStreamingAnswer('');
    setStructuredResponse(null);
    setShowTheMathData(null);
    setLiveShowTheMathData({});
    setActiveView('answer');
    
    // Track question submission
    trackEvent('question_asked', {
      question_length: questionToAsk.length,
      user_tier: userTier,
      is_demo: isDemo
    });
    
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      // Add authentication header for non-demo users
      if (!isDemo) {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log('Sending auth token for ask:', token.substring(0, 20) + '...');
        } else {
          console.log('No auth token found for ask request');
        }
      }
      
      // Add session ID for demo mode
      if (propSessionId) {
        headers['x-session-id'] = propSessionId;
      }
      
      // Use different endpoints for demo vs production
      const endpoint = isDemo ? '/ask' : '/ask/display-real';
      const requestBody = isDemo ? {
        question: questionToAsk,
        userTier: 'premium', // Demo mode gets premium tier access
        isDemo: true
      } : {
        question: questionToAsk,
        isDemo: isDemo,
        sessionId: propSessionId
      };

      // Request SSE streaming for production (Ask Linc pipeline)
      if (!isDemo) {
        headers['Accept'] = 'text/event-stream';
      }

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
              if (currentEvent === 'progress' && data.message) {
                setProgressMessage(data.message);
              } else if (currentEvent === 'answerDelta' && typeof data.delta === 'string') {
                setStreamingAnswer((prev) => prev + data.delta);
              } else if (currentEvent === 'answerReset') {
                // Validation triggered a regeneration; discard the streamed first pass.
                setStreamingAnswer('');
              } else if (currentEvent === 'showTheMathProgress') {
                setLiveShowTheMathData((prev) => ({ ...prev, ...data }));
              } else if (currentEvent === 'result') {
                if (data.answer) {
                  setAnswer(data.answer);
                  setStreamingAnswer('');
                  if (data.structuredResponse) setStructuredResponse(data.structuredResponse);
                  if (data.conversationId) setConversationId(data.conversationId);
                  if (data.showTheMathData) {
                    setShowTheMathData(data.showTheMathData);
                    setLiveShowTheMathData({});
                  }
                  if (onNewAnswer) onNewAnswer(questionToAsk, data.answer);
                  trackEvent('answer_received', { answer_length: data.answer.length, user_tier: userTier, is_demo: isDemo });
                } else {
                  setError('No answer returned.');
                  trackEvent('question_error', { error: 'No answer returned', user_tier: userTier, is_demo: isDemo });
                }
              } else if (currentEvent === 'error' && data.error) {
                setError(data.error);
                trackEvent('question_error', { error: data.error, user_tier: userTier, is_demo: isDemo });
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
        // JSON response (demo or non-streaming backend)
        const data = await res.json();

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
          else if (isDemo) setConversationId(`demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
          if (data.showTheMathData) setShowTheMathData(data.showTheMathData);
          if (onNewAnswer) onNewAnswer(questionToAsk, data.answer);
          trackEvent('answer_received', { answer_length: data.answer.length, user_tier: userTier, is_demo: isDemo });
        } else {
          setError('No answer returned.');
          trackEvent('question_error', { error: 'No answer returned', user_tier: userTier, is_demo: isDemo });
        }
      }
    } catch (error) {
      setError('Error contacting backend.');
      console.error('Error:', error);
      
      // Track error
      trackEvent('question_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_tier: userTier,
        is_demo: isDemo
      });
    } finally {
      setLoading(false);
      setProgressMessage(null);
    }
  };

  const handleShowTheMathClick = useCallback(async () => {
    if (showTheMathData) {
      setShowTheMathModalOpen(true);
      setShowTheMathError(null);
      return;
    }
    if (!conversationId) return;
    setShowTheMathModalOpen(true);
    setLoadingShowTheMath(true);
    setShowTheMathError(null);
    try {
      const headers: Record<string, string> = {};
      if (!isDemo) {
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      if (isDemo && propSessionId) headers['x-session-id'] = propSessionId;
      const endpoint = isDemo
        ? `/demo/conversations/${conversationId}/show-the-math`
        : `/conversations/${conversationId}/show-the-math`;
      const res = await fetch(`${API_URL}${endpoint}`, { headers });
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
  }, [showTheMathData, conversationId, isDemo, propSessionId, API_URL]);

  const modalData: Partial<ShowTheMathData> | null = showTheMathData ?? (
    Object.keys(liveShowTheMathData).length > 0
      ? {
          claudeFirstCall: liveShowTheMathData.claudeFirstCall,
          databaseData: liveShowTheMathData.databaseData || {},
          ...(liveShowTheMathData.geminiValidation && { geminiValidation: liveShowTheMathData.geminiValidation }),
          ...(liveShowTheMathData.claudeRetry && { claudeRetry: liveShowTheMathData.claudeRetry })
        }
      : null
  );


  const sourceEntries = Object.entries(modalData?.databaseData || {}).filter(([, value]) => value != null);
  const hasResult = Boolean(answer || streamingAnswer || loading);

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#17372e]/10 bg-[#fffdf7] shadow-[0_20px_60px_rgba(18,60,47,0.08)]" aria-label="Decision analysis">
      <div className="border-b border-[#17372e]/10 px-5 py-5 sm:px-8 sm:py-7">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#477064]"><Sparkles size={14} />Ask Linc</div>
        <form id="finance-qa-form" onSubmit={askQuestion}>
          <label htmlFor="finance-question" className="sr-only">Your financial question</label>
          <textarea
            id="finance-question"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            className="min-h-24 w-full resize-none bg-transparent text-xl font-medium leading-8 text-[#123c2f] outline-none placeholder:text-[#82968f] sm:text-2xl"
            disabled={loading}
            placeholder={isDemo ? demoPlaceholders[placeholderIndex] : userPlaceholders[placeholderIndex]}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#17372e]/10 pt-4">
            <p className="text-xs text-[#607b72]">Uses connected accounts, calculations, and current context when available.</p>
            <button type="submit" disabled={loading} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-full bg-[#123c2f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1a5140] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <><LoaderCircle className="animate-spin" size={17} />Analyzing</> : <>{hasResult ? 'Ask follow-up' : 'Analyze decision'}<ArrowUp size={17} /></>}
            </button>
          </div>
        </form>
      </div>

      {!hasResult && !error && (
        <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
          <div className="max-w-md"><div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-[#dff4b2] text-[#123c2f]"><MessageSquarePlus /></div><h2 className="text-xl font-semibold text-[#123c2f]">Start with the decision in front of you</h2><p className="mt-2 text-sm leading-6 text-[#607b72]">Ask a specific question. Linc will lead with an answer, then keep the assumptions, calculations, and evidence close by.</p></div>
        </div>
      )}

      {error && (
        <div role="alert" className="m-5 rounded-2xl border border-[#b84a3d]/25 bg-[#fff2ed] p-5 sm:m-8"><h2 className="font-semibold text-[#8b3027]">We couldn’t complete this analysis</h2><p className="mt-1 text-sm text-[#8b3027]/80">{error}</p><p className="mt-3 text-xs text-[#8b3027]/70">Your question is still here. Check your connection and try again.</p></div>
      )}

      {hasResult && (
        <div>
          <div className="flex overflow-x-auto border-b border-[#17372e]/10 px-5 sm:px-8" role="tablist" aria-label="Decision details">
            {(['answer', 'math', 'sources'] as const).map(view => (
              <button key={view} type="button" role="tab" aria-selected={activeView === view} onClick={() => { setActiveView(view); if (view !== 'answer' && !showTheMathData && conversationId && !loading) handleShowTheMathClick(); }} className={`border-b-2 px-4 py-4 text-sm font-semibold capitalize transition ${activeView === view ? 'border-[#123c2f] text-[#123c2f]' : 'border-transparent text-[#71857f] hover:text-[#123c2f]'}`}>{view}</button>
            ))}
          </div>

          <div className="p-5 sm:p-8">
            {activeView === 'answer' && (
              <div className="space-y-7">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#477064]">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} {loading ? (progressMessage || 'Building your answer') : 'Current answer'}</div>
                {structuredResponse?.key_numbers && Object.keys(structuredResponse.key_numbers).length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Key numbers">{Object.entries(structuredResponse.key_numbers).map(([key, value]) => <div key={key} className="rounded-2xl bg-[#eef1e8] p-4"><div className="text-xs font-semibold uppercase tracking-wider text-[#607b72]">{key.replace(/_/g, ' ')}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-[#123c2f]">{formatKeyNumberValue(key, value)}</div></div>)}</div>
                )}
                <div className="decision-answer prose prose-slate max-w-none text-[#29483f] prose-headings:text-[#123c2f] prose-a:text-[#175cce]">{structuredResponse ? <MarkdownRenderer>{structuredResponse.summary}</MarkdownRenderer> : streamingAnswer ? <><MarkdownRenderer>{streamingAnswer}</MarkdownRenderer><span className="inline-block h-4 w-1.5 animate-pulse bg-[#123c2f]" /></> : answer ? <MarkdownRenderer>{answer}</MarkdownRenderer> : <div className="space-y-3" aria-label="Answer loading"><div className="h-4 w-11/12 animate-pulse rounded bg-[#dfe5db]" /><div className="h-4 w-4/5 animate-pulse rounded bg-[#dfe5db]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[#dfe5db]" /></div>}</div>
                {structuredResponse?.insights && structuredResponse.insights.length > 0 && <section className="rounded-2xl border border-[#17372e]/10 p-5"><h3 className="mb-3 font-semibold text-[#123c2f]">Key assumptions and decision factors</h3><ul className="space-y-3 text-sm leading-6 text-[#48675e]">{structuredResponse.insights.map((insight, index) => <li key={index} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7cb342]" />{insight}</li>)}</ul></section>}
                {structuredResponse?.suggested_actions && structuredResponse.suggested_actions.length > 0 && <section><h3 className="mb-3 font-semibold text-[#123c2f]">Ways to move forward</h3><div className="grid gap-3 sm:grid-cols-2">{structuredResponse.suggested_actions.map((action, index) => <div key={index} className="rounded-2xl bg-[#e9f0fb] p-4 text-sm leading-6 text-[#254b75]">{action}</div>)}</div><p className="mt-3 text-xs text-[#71857f]">Interactive scenario comparison is not yet available in the current product API.</p></section>}
                {conversationId && answer && !loading && <Feedback conversationId={conversationId} isDemo={isDemo} onFeedbackSubmitted={(score) => trackEvent('feedback_submitted', { score, is_demo: isDemo, user_tier: userTier })} />}
              </div>
            )}

            {activeView === 'math' && (
              <div className="space-y-5"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-[#123c2f]"><Calculator size={19} />Calculations and pipeline</h2><p className="mt-1 text-sm text-[#607b72]">Inspect the context, intermediate work, and validation behind this answer.</p></div>{loadingShowTheMath ? <div className="flex items-center gap-2 py-10 text-sm text-[#607b72]"><LoaderCircle className="animate-spin" size={18} />Loading calculation details…</div> : showTheMathError ? <div role="alert" className="rounded-2xl bg-[#fff2ed] p-4 text-sm text-[#8b3027]">{showTheMathError}</div> : modalData ? <ShowTheMathContent data={modalData} /> : <p className="rounded-2xl bg-[#eef1e8] p-5 text-sm text-[#607b72]">Calculation details will appear when the analysis is complete.</p>}</div>
            )}

            {activeView === 'sources' && (
              <div><h2 className="flex items-center gap-2 text-lg font-semibold text-[#123c2f]"><Database size={19} />Supporting evidence</h2><p className="mt-1 text-sm text-[#607b72]">These are the real data groups recorded with this answer.</p>{loadingShowTheMath ? <div className="flex items-center gap-2 py-10 text-sm text-[#607b72]"><LoaderCircle className="animate-spin" size={18} />Loading sources…</div> : sourceEntries.length > 0 ? <ul className="mt-6 grid gap-3 sm:grid-cols-2">{sourceEntries.map(([key, value]) => <li key={key} className="rounded-2xl border border-[#17372e]/10 p-4"><div className="flex items-start gap-3"><FileText className="mt-0.5 text-[#175cce]" size={18} /><div><div className="font-semibold capitalize text-[#123c2f]">{key.replace(/_/g, ' ')}</div><div className="mt-1 text-xs text-[#71857f]">{Array.isArray(value) ? `${value.length} recorded item${value.length === 1 ? '' : 's'}` : 'Recorded analysis context'}</div></div></div></li>)}</ul> : <div className="mt-6 rounded-2xl bg-[#eef1e8] p-5 text-sm leading-6 text-[#607b72]">No supporting source bundle is available for this conversation. The answer remains visible, but its underlying evidence cannot be inspected.</div>}</div>
            )}
          </div>
        </div>
      )}

      <ShowTheMathModal isOpen={showTheMathModalOpen} onClose={() => setShowTheMathModalOpen(false)} data={modalData} loading={loadingShowTheMath} error={showTheMathError} />
    </section>
  );
}
