"use client";
import { useEffect, useState } from 'react';
import Typewriter from 'typewriter-effect';

const AnimatedPrompt = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Delay the animation to start after the page loads
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const questions = [
    "Should we refinance based on current mortgage rates?",
    "What's the average credit card APR vs ours?",
    "How much cash is just sitting in low-yield savings?",
    "Are Treasuries a better option than CDs right now?",
    "What asset mix gives us the right balance of safety and growth?",
    "How long can we last without touching our emergency fund?"
  ];

  if (!isVisible) {
    return (
      <div className="w-full h-12 bg-gray-700 rounded-lg animate-pulse"></div>
    );
  }

  return (
    <div className="w-full bg-gray-700 rounded-lg p-4 border border-gray-600">
      <div className="flex items-center space-x-2 mb-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400">Ask Linc</span>
      </div>
      <div className="text-white text-lg min-h-[1.5rem]">
        <Typewriter
          options={{
            strings: questions,
            autoStart: true,
            loop: true,
            delay: 25,
            deleteSpeed: 15,
            cursor: '|',
            wrapperClassName: 'text-white text-lg',
            cursorClassName: 'text-green-500'
          }}
        />
      </div>
    </div>
  );
};

export default AnimatedPrompt; 