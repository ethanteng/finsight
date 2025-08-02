"use client";

import React, { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { useAnalytics } from './Analytics';

// Declare Hotjar global type
declare global {
  interface Window {
    hj?: (command: string, ...args: unknown[]) => void;
  }
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
}

export default function FinanceQA({ onNewAnswer, selectedPrompt, onNewQuestion: _onNewQuestion, isDemo = false, sessionId: propSessionId }: FinanceQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userTier, setUserTier] = useState<string>('starter');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const { trackEvent } = useAnalytics();

  // Demo placeholder questions that rotate
  const demoPlaceholders = [
    "How much am I saving each month? What's my emergency fund status? Should I move my savings to a higher-yield account?",
    "What's my current asset allocation? Am I on track for retirement? Should I rebalance my 401k?",
    "What's my debt-to-income ratio? How much am I spending on housing vs other expenses? Should I pay off my credit card first?"
  ];

  // Rotate placeholder every 4 seconds for demo mode
  useEffect(() => {
    if (!isDemo) return;
    
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % demoPlaceholders.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isDemo, demoPlaceholders.length]);

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

  // Update question and answer when selectedPrompt changes
  useEffect(() => {
    if (selectedPrompt) {
      setQuestion(selectedPrompt.question);
      setAnswer(selectedPrompt.answer);
      setError('');
    } else {
      // Only clear if not currently showing a selected prompt
      if (!selectedPrompt) {
        setAnswer('');
        setError('');
      }
      // Don't clear the question - keep it in the textarea
    }
  }, [selectedPrompt]);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError('');
    
    // Track question submission
    trackEvent('question_asked', {
      question_length: question.length,
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
      
      const res = await fetch(`${API_URL}/ask/display-real`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          question,
          isDemo: isDemo, // Pass demo flag to backend
          sessionId: propSessionId // Pass session ID for demo mode
        }),
      });
      const data = await res.json();
      if (data.answer) {
        setAnswer(data.answer);
        // Call onNewAnswer callback if provided
        if (onNewAnswer) {
          onNewAnswer(question, data.answer);
        }
        
        // Track successful answer
        trackEvent('answer_received', {
          answer_length: data.answer.length,
          user_tier: userTier,
          is_demo: isDemo
        });
        
        // Trigger Hotjar event for demo feedback survey
        if (isDemo && typeof window !== 'undefined' && window.hj) {
          window.hj('event', 'gpt_response_completed');
        }
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

  return (
    <div className="space-y-6">
      {/* Big Prompt Area */}
      <div className="bg-gray-700 rounded-lg p-6">
        <form onSubmit={askQuestion} className="space-y-4">
          <div>
            <textarea
              id="finance-question"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full h-32 p-4 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
              placeholder={isDemo 
                ? demoPlaceholders[placeholderIndex]
                : "How much did I spend on dining last month? What's my current asset allocation? Which accounts have the highest fees?"
              }
              required
              data-hj-allow
            />
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            {loading ? 'Analyzing...' : 'Ask Linc'}
          </button>
        </form>
      </div>

      {/* Results Area */}
      {answer && (
        <div className="bg-gray-700 rounded-lg p-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-200 leading-relaxed">
              <MarkdownRenderer>{answer}</MarkdownRenderer>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
} 