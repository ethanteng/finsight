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
    "Is now a good time to refinance our mortgage?",
    "Are we paying too much in credit card interest?",
    "Do we have money sitting in savings that could be earning more?",
    "Should we go with a Treasury or a CD right now?",
    "Is our money invested the right way — not too risky, not too safe?",
    "If we lost income, how long could we cover our expenses?",
    "How much am I really saving each month?",
    "Are we doing the right things to hit our goals?",
    "What happens if interest rates go up again?"
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