"use client";

import React, { useState, useEffect } from 'react';

const FEEDBACK_STORAGE_KEY = 'finsight-feedback-submitted';

function getSubmittedConversations(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markConversationFeedbackSubmitted(conversationId: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = getSubmittedConversations();
    set.add(conversationId);
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Ignore localStorage errors
  }
}

interface FeedbackProps {
  conversationId: string;
  isDemo: boolean;
  onFeedbackSubmitted?: (score: number) => void;
}

export default function Feedback({ conversationId, isDemo, onFeedbackSubmitted }: FeedbackProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(() => getSubmittedConversations().has(conversationId));
  const [submitting, setSubmitting] = useState(false);

  // Reset feedback state when conversationId changes; check if already submitted for new conversation
  useEffect(() => {
    setRating(null);
    setSubmitting(false);
    setSubmitted(getSubmittedConversations().has(conversationId));
  }, [conversationId]);

  const handleRatingClick = async (score: number) => {
    if (submitted || submitting) return;
    
    setRating(score);
    setSubmitting(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          score,
          isDemo,
        }),
      });

      if (response.ok) {
        markConversationFeedbackSubmitted(conversationId);
        setSubmitted(true);
        onFeedbackSubmitted?.(score);
      } else {
        console.error('Failed to submit feedback');
        setRating(null);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setRating(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
      <p className="text-gray-300 text-sm mb-3 text-center">
        How helpful was this response?
      </p>
      <div className="flex justify-center space-x-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            onClick={() => handleRatingClick(score)}
            disabled={submitting}
            className={`
              w-10 h-10 rounded-lg border-2 transition-all duration-200 flex items-center justify-center text-sm font-medium
              ${rating === score
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }
              ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={`${score === 1 ? 'Not helpful at all' : score === 5 ? 'Extremely helpful' : `${score}/5`}`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>Not helpful at all</span>
        <span>Extremely helpful</span>
      </div>
    </div>
  );
}
