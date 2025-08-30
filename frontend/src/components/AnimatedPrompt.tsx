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
    "Given today’s mortgage rates, should I pay extra on my loan or invest instead?",
    "Are CDs still better than Treasuries with current yields?",
    "How much can I safely spend each month without risking retirement?",
    "If inflation stays at 3%, is my emergency fund losing value?",
    "Does my portfolio need more bonds now that yields are higher?",
    "Should I move some cash out of savings into short-term Treasuries?",
    "Am I on track to retire at 62 if I keep saving at this pace?",
    "How much would a Fed rate cut change my interest income?",
    "What happens to my retirement plan if stocks stay flat for 3 years?"
  ];

  if (!isVisible) {
    return (
      <div className="w-full h-20 bg-gray-700 rounded-lg animate-pulse"></div>
    );
  }

  return (
    <a 
      href="/demo" 
      className="block w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 hover:border-gray-500 transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-center space-x-2 mb-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Ask Linc</span>
      </div>
      <div className="text-white text-lg h-16 flex items-center justify-center group-hover:text-gray-100 transition-colors">
        <Typewriter
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