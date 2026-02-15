"use client";
import { useEffect, useState, useRef } from 'react';
import Typewriter from 'typewriter-effect';

interface AnimatedPromptProps {
  /** When true, renders as div instead of anchor (use when nested inside a Link) */
  nestedInLink?: boolean;
  /** Ref to receive a function that returns the currently displayed question (for hero click) */
  getCurrentQuestionRef?: React.MutableRefObject<(() => string) | null>;
}

const AnimatedPrompt = ({ nestedInLink = false, getCurrentQuestionRef }: AnimatedPromptProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const typewriterRef = useRef<{ state: { elements: { wrapper: HTMLElement } } } | null>(null);

  useEffect(() => {
    // Delay the animation to start after the page loads
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Expose getter for current question text (wrapper has text only, cursor is separate)
  // Must be before any early return to satisfy Rules of Hooks
  useEffect(() => {
    if (getCurrentQuestionRef) {
      getCurrentQuestionRef.current = () => {
        const wrapper = typewriterRef.current?.state?.elements?.wrapper;
        return wrapper?.textContent?.trim() || '';
      };
      return () => { getCurrentQuestionRef.current = null; };
    }
  }, [getCurrentQuestionRef, isVisible]);

  const questions = [
    "What breaks first if interest rates stay high longer than expected?",
    "If markets underperform for 5 years, can my retirement plan still hold?",
    "Am I taking more risk than I realize by staying in cash right now?",
    "What happens to my plan if inflation never really goes back to 2%?",
    "Assuming today’s rates, what’s the smartest thing to do with excess cash?",
    "If I stop increasing contributions now, what does that cost me later?",
    "Which matters more right now: paying down debt or staying liquid?",
    "How exposed am I to a recession if it hits next year?",
    "What assumptions in my plan matter most if they’re wrong?",
    "Given everything going on right now, am I actually doing okay?"
  ];  

  if (!isVisible) {
    return (
      <div className="w-full h-20 bg-gray-700 rounded-lg animate-pulse"></div>
    );
  }

  const className = "block w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 hover:border-gray-500 transition-all duration-200 cursor-pointer group";

  return nestedInLink ? (
    <div className={className}>
      <div className="flex items-center space-x-2 mb-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Ask Linc</span>
      </div>
      <div className="text-white text-lg h-16 flex items-center justify-center group-hover:text-gray-100 transition-colors" data-hero-question>
        <Typewriter
          onInit={(tw) => { (typewriterRef as React.MutableRefObject<unknown>).current = tw; }}
          options={{
            strings: questions,
            autoStart: true,
            loop: true,
            delay: 15,
            deleteSpeed: 1,
            cursor: '|',
            wrapperClassName: 'text-white text-lg group-hover:text-gray-100 transition-colors text-center',
            cursorClassName: 'text-green-500'
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
      <div className="text-white text-lg h-16 flex items-center justify-center group-hover:text-gray-100 transition-colors">
        <Typewriter
          onInit={(tw) => { (typewriterRef as React.MutableRefObject<unknown>).current = tw; }}
          options={{
            strings: questions,
            autoStart: true,
            loop: true,
            delay: 15,
            deleteSpeed: 1,
            cursor: '|',
            wrapperClassName: 'text-white text-lg group-hover:text-gray-100 transition-colors text-center',
            cursorClassName: 'text-green-500'
          }}
        />
      </div>
    </a>
  );
};

export default AnimatedPrompt; 