"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CircleArrowUp, Calculator } from 'lucide-react';
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
  const [liveFeedExpanded, setLiveFeedExpanded] = useState(false);
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
    } catch (err) {
      setShowTheMathError('Failed to load pipeline data');
    } finally {
      setLoadingShowTheMath(false);
    }
  }, [showTheMathData, conversationId, isDemo, propSessionId, API_URL]);

  const hasShowTheMath = !!(showTheMathData || conversationId || (loading && Object.keys(liveShowTheMathData).length > 0));
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


  return (
    <div className="space-y-6">
      {/* Big Prompt Area */}
      <div className="bg-gray-700 rounded-lg p-6">
        <form id="finance-qa-form" onSubmit={askQuestion} className="space-y-4">
          <div>
            <textarea
              id="finance-question"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full h-32 p-4 bg-gray-600 border border-gray-500 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
              disabled={loading}
              placeholder={isDemo 
                ? demoPlaceholders[placeholderIndex]
                : userPlaceholders[placeholderIndex]
              }
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-between bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            {loading ? (
              <span className="flex flex-col items-center justify-center w-full gap-1">
                <span className="flex items-center">
                  <span>Generating response</span>
                  <span className="ml-1 flex">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                </span>
                {progressMessage && (
                  <span className="text-sm font-normal text-gray-400">{progressMessage}</span>
                )}
              </span>
            ) : (
              <>
                <span className="flex-1 text-center">Ask anything</span>
                <CircleArrowUp className="w-5 h-5 shrink-0" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Results Area - show during loading for live feed, or when we have answer */}
      {(answer || loading) && (
        <div className="bg-gray-700 rounded-lg p-6">
          {/* Show the math button - top of response box */}
          {hasShowTheMath && !loading && (
            <div className="mb-4">
              <button
                type="button"
                onClick={handleShowTheMathClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
              >
                <Calculator className="w-4 h-4" />
                Show the math
              </button>
            </div>
          )}
          {/* Live feed during loading */}
          {loading && Object.keys(liveShowTheMathData).length > 0 && (
            <div className="mb-4 border border-gray-600 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setLiveFeedExpanded(!liveFeedExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 text-left text-sm font-medium text-gray-200"
              >
                Live transparency
                <span className="text-gray-400">{liveFeedExpanded ? '−' : '+'}</span>
              </button>
              {liveFeedExpanded && modalData && (
                <div className="p-4 bg-gray-900 border-t border-gray-700 max-h-64 overflow-y-auto">
                  <ShowTheMathContent data={modalData} />
                  <div className="mt-2 text-xs text-gray-500">
                    Pipeline in progress. Data will update as each step completes.
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="bg-gray-800 rounded-lg p-4 space-y-4">
            {structuredResponse ? (
              <>
                <div className="text-gray-200 leading-relaxed">
                  <MarkdownRenderer>{structuredResponse.summary}</MarkdownRenderer>
                </div>
                {structuredResponse.key_numbers && Object.keys(structuredResponse.key_numbers).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(structuredResponse.key_numbers).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex items-center px-3 py-1 rounded-md bg-gray-700 text-gray-300 text-sm"
                      >
                        <span className="text-gray-400 mr-1">{key.replace(/_/g, ' ')}:</span>
                        <span className="font-medium">
                          {formatKeyNumberValue(key, value)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {structuredResponse.insights && structuredResponse.insights.length > 0 && (
                  <div>
                    <h4 className="text-gray-400 text-sm font-medium mb-2">Insights</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                      {structuredResponse.insights.map((insight, i) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {structuredResponse.suggested_actions && structuredResponse.suggested_actions.length > 0 && (
                  <div>
                    <h4 className="text-gray-400 text-sm font-medium mb-2">Suggested Actions</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                      {structuredResponse.suggested_actions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : streamingAnswer ? (
              <div className="text-gray-200 leading-relaxed">
                <MarkdownRenderer>{streamingAnswer}</MarkdownRenderer>
                <span className="inline-block w-2 h-4 ml-0.5 align-middle bg-gray-400 animate-pulse" aria-hidden="true" />
              </div>
            ) : loading && !answer ? null : (
              <div className="text-gray-200 leading-relaxed">
                <MarkdownRenderer>{answer}</MarkdownRenderer>
              </div>
            )}
          </div>
          
          {/* Feedback Component - only show once answer has arrived */}
          {conversationId && answer && !loading && (
            <Feedback
              conversationId={conversationId}
              isDemo={isDemo}
              onFeedbackSubmitted={(score) => {
                console.log('Feedback submitted:', score);
                // Track feedback submission
                trackEvent('feedback_submitted', {
                  score,
                  is_demo: isDemo,
                  user_tier: userTier
                });
              }}
            />
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <ShowTheMathModal
        isOpen={showTheMathModalOpen}
        onClose={() => setShowTheMathModalOpen(false)}
        data={modalData}
        loading={loadingShowTheMath}
        error={showTheMathError}
      />
    </div>
  );
} 