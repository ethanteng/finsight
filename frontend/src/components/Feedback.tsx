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
  const [submittedThisSession, setSubmittedThisSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset feedback state when conversationId changes; check if already submitted for new conversation
  useEffect(() => {
    setRating(null);
    setSubmitting(false);
    setSubmittedThisSession(false);
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
        setSubmittedThisSession(true);
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

  // Show thank you only on initial submit; hide entirely when loaded from localStorage (e.g. after refresh)
  if (submittedThisSession) {
    return (
      <div role="status" className="mt-4 rounded-2xl border border-[#6f8f42]/25 bg-[#eef6da] p-3">
        <p className="text-center text-sm font-medium text-[#315a3e]">
          ✓ Thank you for your feedback!
        </p>
      </div>
    );
  }

  if (submitted) {
    return null;
  }

  return (
    <fieldset className="mt-4 rounded-2xl border border-[#102319]/15 bg-[#fffaf0] p-4 sm:p-5">
      <legend className="w-full px-2 text-center text-sm font-semibold text-[#102319]">
        How helpful was this response?
      </legend>
      <div className="mt-3 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <label
            key={score}
            className={`
              flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#102319] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[#fffaf0]
              ${rating === score
                ? 'border-[#102319] bg-[#d9ff6f] text-[#102319] shadow-sm'
                : 'border-[#527166] bg-[#fffdf5] text-[#102319] hover:border-[#102319] hover:bg-[#eef6da]'
              }
              ${submitting ? 'pointer-events-none opacity-50' : ''}
            `}
            title={`${score === 1 ? 'Not helpful at all' : score === 5 ? 'Extremely helpful' : `${score}/5`}`}
          >
            <input
              type="radio"
              name={`feedback-rating-${conversationId}`}
              value={score}
              checked={rating === score}
              onChange={() => handleRatingClick(score)}
              disabled={submitting}
              className="sr-only"
              aria-label={`${score} out of 5${score === 1 ? ', not helpful at all' : score === 5 ? ', extremely helpful' : ''}`}
            />
            {score}
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs font-medium text-[#526e65]">
        <span>Not helpful at all</span>
        <span>Extremely helpful</span>
      </div>
    </fieldset>
  );
}
