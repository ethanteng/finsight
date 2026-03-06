"use client";

import React, { useState, useEffect } from 'react';
import { CircleArrowUp } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useAnalytics } from './Analytics';
import Feedback from './Feedback';
import { ViewAIContext } from './debug/ViewAIContext';

/** Format key_number for display: % for percent keys, plain number for years, $ for dollar amounts */
function formatKeyNumberValue(key: string, value: number | unknown): string {
  if (typeof value !== 'number') return String(value);
  const keyLower = key.toLowerCase();
  if (keyLower.includes('years')) return value.toLocaleString();
  if (keyLower.includes('percent')) return `${value}%`;
  return value >= 1000 ? `$${value.toLocaleString()}` : `$${value}`;
}

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
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showContextModal, setShowContextModal] = useState(false);
  const [structuredResponse, setStructuredResponse] = useState<{
    summary: string;
    key_numbers?: Record<string, number>;
    insights?: string[];
    suggested_actions?: string[];
  } | null>(null);
  // ✅ Streaming disabled - removed streaming state variables
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

  // Fun loading messages that rotate
  const loadingMessages = [
    "Crunching numbers",
    "Consulting the financial oracle",
    "Reading tea leaves",
    "Asking my crystal ball",
    "Channeling Warren Buffett",
    "Doing the math",
    "Consulting the money gods",
    "Running the numbers",
    "Summoning financial wisdom",
    "Decoding your finances"
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

  // Rotate loading messages every 2 seconds while loading
  useEffect(() => {
    if (!loading) return;
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [loading, loadingMessages.length]);

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
      setStructuredResponse(null); // Previous answers don't have structured data
      setError('');
    } else {
      setAnswer('');
      setStructuredResponse(null);
      setError('');
    }
  }, [selectedPrompt]);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    // Use initial question from hero click, then typed question, then placeholder
    const questionToAsk = initialQuestionRef.current || question.trim() || (isDemo ? demoPlaceholders[placeholderIndex] : userPlaceholders[placeholderIndex]);
    if (initialQuestionRef.current) initialQuestionRef.current = null;

    setLoading(true);
    setLoadingMessageIndex(0); // Reset to first message
    setError('');
    setAnswer('');
    setStructuredResponse(null);
    
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

      const data = await res.json();

      // Handle error responses (4xx, 5xx) - show backend message when available
      if (!res.ok && data.error) {
        setError(data.error);
        return;
      }

      // Handle 200 with error but no answer (e.g. validation rejected after response started)
      if (data.error && !data.answer) {
        setError(data.error);
        return;
      }

      if (data.answer) {
        setAnswer(data.answer);
        if (data.structuredResponse) {
          setStructuredResponse(data.structuredResponse);
        }
        // Store conversation ID for feedback
        if (data.conversationId) {
          setConversationId(data.conversationId);
        } else if (isDemo) {
          // Generate a demo conversation ID if none is provided
          const demoConversationId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          setConversationId(demoConversationId);
        }
        // Call onNewAnswer callback if provided
        if (onNewAnswer) {
          onNewAnswer(questionToAsk, data.answer);
        }
        
        // Track successful answer
        trackEvent('answer_received', {
          answer_length: data.answer.length,
          user_tier: userTier,
          is_demo: isDemo
        });
      } else {
        setError('No answer returned.');
        // Track error
        trackEvent('question_error', {
          error: 'No answer returned',
          user_tier: userTier,
          is_demo: isDemo
        });
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
    }
  };
  // ✅ Streaming disabled - removed useEffect that was simulating streaming


  return (
    <div className="space-y-6">
      {/* Big Prompt Area */}
      <div className="bg-gray-700 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-gray-300 text-sm font-medium">Ask Your Question</h3>
          {!isDemo && process.env.NEXT_PUBLIC_PERSIST_GPT_CONTEXT === 'true' && (
            <button
              type="button"
              onClick={() => setShowContextModal(true)}
              className="text-xs text-gray-400 hover:text-gray-200 underline"
            >
              View AI Context
            </button>
          )}
        </div>
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
              <span className="flex items-center justify-center w-full">
                <span>{loadingMessages[loadingMessageIndex]}</span>
                <span className="ml-1 flex">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
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

      {/* Results Area */}
      {answer && (
        <div className="bg-gray-700 rounded-lg p-6">
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
            ) : (
              <div className="text-gray-200 leading-relaxed">
                <MarkdownRenderer>{answer}</MarkdownRenderer>
              </div>
            )}
          </div>
          
          {/* Feedback Component */}
          {conversationId && (
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
      
      {/* View AI Context Modal */}
      <ViewAIContext 
        isOpen={showContextModal} 
        onClose={() => setShowContextModal(false)} 
      />
    </div>
  );
} 