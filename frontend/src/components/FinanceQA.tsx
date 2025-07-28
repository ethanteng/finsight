"use client";

import React, { useState, useEffect } from 'react';

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
}

export default function FinanceQA({ onNewAnswer, selectedPrompt, onNewQuestion, isDemo = false }: FinanceQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    setLoading(true);
    setError('');
    setAnswer('');
    
    // Clear selected prompt when asking a new question
    if (onNewQuestion) {
      onNewQuestion();
    }
    
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question,
          isDemo: isDemo // Pass demo flag to backend
        }),
      });
      const data = await res.json();
      if (data.answer) {
        setAnswer(data.answer);
        // Call onNewAnswer callback if provided
        if (onNewAnswer) {
          onNewAnswer(question, data.answer);
        }
      } else {
        setError('No answer returned.');
      }
    } catch {
      setError('Error contacting backend.');
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
                ? "How much am I saving each month? What's my emergency fund status? Should I move my savings to a higher-yield account?"
                : "How much did I spend on dining last month? What's my current asset allocation? Which accounts have the highest fees?"
              }
              required
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
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-line text-gray-200 leading-relaxed">
                {answer}
              </div>
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