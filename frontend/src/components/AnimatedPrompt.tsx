"use client";
import { useEffect, useState, useRef } from 'react';
import Typewriter from 'typewriter-effect';

const QUESTIONS = [
  "What part of my retirement plan breaks first if interest rates stay high longer than expected?",
  "If markets underperform for 5 years, can my retirement plan still hold?",
  "Am I taking more risk than I realize by staying in cash right now?",
  "What happens to my retirement plan if inflation never really goes back to 2%?",
  "Assuming today's rates, what's the smartest thing to do with excess cash?",
  "If I stop increasing my retirement contributions now, what does that cost me later?",
  "Which matters more right now: paying down debt or staying liquid?",
  "How exposed am I to a recession if it hits next year?",
  "What assumptions in my retirement plan matter most if they're wrong?",
  "Given everything going on right now, am I actually doing okay?"
];

interface AnimatedPromptProps {
  /** When true, renders as div instead of anchor (use when nested inside a Link) */
  nestedInLink?: boolean;
  /** Ref to receive a function that returns the currently displayed question (for hero click) */
  getCurrentQuestionRef?: React.MutableRefObject<(() => string) | null>;
  /** Optional custom questions to display (overrides default QUESTIONS) */
  questions?: string[];
  /** When true, uses 20% larger font for the carousel text */
  largerText?: boolean;
  /** Optional click handler (e.g. to navigate to demo with current question) */
  onClick?: () => void;
}

const AnimatedPrompt = ({ nestedInLink = false, getCurrentQuestionRef, questions: customQuestions, largerText = false, onClick }: AnimatedPromptProps) => {
  const questions = customQuestions ?? QUESTIONS;
  const [isVisible, setIsVisible] = useState(false);
  const typewriterRef = useRef<{ state: { elements: { wrapper: HTMLElement } } } | null>(null);

  useEffect(() => {
    // Delay the animation to start after the page loads
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);


  // Expose getter for current question text - resolves partial (mid-typing) text to full question
  // Must be before any early return to satisfy Rules of Hooks
  useEffect(() => {
    if (getCurrentQuestionRef) {
      getCurrentQuestionRef.current = () => {
        const wrapper = typewriterRef.current?.state?.elements?.wrapper;
        const displayedText = wrapper?.textContent?.trim() || '';
        // Find the full question that the displayed text is a prefix of (handles mid-typing)
        const fullQuestion = displayedText
          ? questions.find((q) => q.startsWith(displayedText) || displayedText.startsWith(q))
          : null;
        return fullQuestion ?? questions[0] ?? '';
      };
      return () => { getCurrentQuestionRef.current = null; };
    }
  }, [getCurrentQuestionRef, isVisible, questions]);

  if (!isVisible) {
    return (
      <div className="w-full h-20 bg-gray-700 rounded-lg animate-pulse"></div>
    );
  }

  const className = "block w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 hover:border-gray-500 transition-all duration-200 cursor-pointer group";
  const textSizeClass = largerText ? "text-[1.35rem]" : "text-lg";

  return nestedInLink ? (
    <div
      className={className}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center space-x-2 mb-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Ask Linc</span>
      </div>
      <div className={`text-white ${textSizeClass} h-16 w-full min-w-full flex items-center justify-center group-hover:text-gray-100 transition-colors`} data-hero-question>
        <Typewriter
          onInit={(tw) => { (typewriterRef as React.MutableRefObject<unknown>).current = tw; }}
          options={{
            strings: questions,
            autoStart: true,
            loop: true,
            delay: 15,
            deleteSpeed: 1,
            cursor: '',
            wrapperClassName: `text-white ${textSizeClass} group-hover:text-gray-100 transition-colors text-center w-full block`
          }}
        />
      </div>
    </div>
  ) : (
    <a href="/demo" className={className}>
      <div className="flex items-center space-x-2 mb-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Ask Linc</span>
      </div>
      <div className={`text-white ${textSizeClass} h-16 w-full min-w-full flex items-center justify-center group-hover:text-gray-100 transition-colors`}>
        <Typewriter
          onInit={(tw) => { (typewriterRef as React.MutableRefObject<unknown>).current = tw; }}
          options={{
            strings: questions,
            autoStart: true,
            loop: true,
            delay: 15,
            deleteSpeed: 1,
            cursor: '',
            wrapperClassName: `text-white ${textSizeClass} group-hover:text-gray-100 transition-colors text-center w-full block`
          }}
        />
      </div>
    </a>
  );
};

export default AnimatedPrompt; 