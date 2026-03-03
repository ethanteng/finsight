"use client";
import { useState, useEffect } from 'react';
import FinanceQA from '../../components/FinanceQA';
import { pushBeginCheckout } from '@/lib/dataLayer';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export default function DemoPageClient() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [showSidebar, setShowSidebar] = useState(true); // Show by default on desktop
  const [sessionId, setSessionId] = useState<string>('');
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);

  // Read initial question from sessionStorage (set when clicking hero on homepage)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = sessionStorage.getItem('demo_initial_question');
      if (q) {
        sessionStorage.removeItem('demo_initial_question');
        setInitialQuestion(q);
      }
    }
  }, []);

  // Generate or retrieve session ID for demo mode from localStorage (client-side only)
  useEffect(() => {
    // Check if we already have a session ID in localStorage
    const existingSessionId = localStorage.getItem('demo_session_id');
    if (existingSessionId) {
      setSessionId(existingSessionId);
    } else {
      // Generate new session ID if none exists
      const newSessionId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('demo_session_id', newSessionId);
      setSessionId(newSessionId);
    }
  }, []);

  // Load demo prompt history from backend on mount
  useEffect(() => {
    if (!sessionId) return; // Don't load until we have a session ID
    
    const loadDemoHistory = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        const res = await fetch(`${API_URL}/demo/conversations`, {
          headers: {
            'x-session-id': sessionId
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          setPromptHistory(data.conversations);
          // Set the most recent prompt as selected if there are any
          if (data.conversations.length > 0) {
            setSelectedPrompt(data.conversations[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load demo prompt history:', error);
      }
    };
    
    loadDemoHistory();
  }, [sessionId]);

  const addToHistory = (question: string, answer: string) => {
    const newPrompt: PromptHistory = {
      id: Date.now().toString(),
      question,
      answer,
      timestamp: Date.now(),
    };
    setPromptHistory(prev => [newPrompt, ...prev.slice(0, 49)]); // Keep last 50 prompts
    setSelectedPrompt(newPrompt);
    // Note: Backend handles persistence via the /ask endpoint
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const truncateText = (text: string, maxLength: number = 60) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const handleHistorySelect = (prompt: PromptHistory) => {
    setSelectedPrompt(prompt);
  };

  const handleNewQuestion = () => {
    setSelectedPrompt(null);
  };

  const handleBuyClick = async (planId: string) => {
    pushBeginCheckout();
    setIsCheckoutLoading(true);
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      // Create checkout session for anyone (new or existing users)
      const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tier: planId,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=${planId}`,
          cancelUrl: `${window.location.origin}/demo`
        })
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const error = await response.json();
        console.error('Failed to create checkout session:', error);
        alert('Failed to create checkout session. Please try again.');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Demo notice */}
      <div className="bg-amber-900/80 border-b border-amber-700/50 px-4 py-2 text-center text-sm text-amber-100">
        This is a fully functional demo using fictional accounts. Nothing here is tied to a real person.
      </div>
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white">Ask Linc</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleBuyClick('premium')}
              disabled={isCheckoutLoading}
              className={`relative bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 hover:scale-105 shadow-lg shadow-green-500/40 hover:shadow-xl hover:shadow-green-500/50 ${!isCheckoutLoading ? 'animate-pulse-glow' : ''}`}
            >
              {isCheckoutLoading ? (
                'Loading...'
              ) : (
                <>
                  <span className="inline-block animate-sparkle mr-1.5">✨</span>
                  Get Started
                </>
              )}
            </button>
            <a 
              href="/contact" 
              className="hidden md:inline text-blue-300 hover:text-blue-200 text-sm transition-colors font-medium"
            >
              Give Feedback
            </a>
            <a 
              href="/profile?demo=true" 
              className="hidden md:inline text-gray-300 hover:text-white text-sm transition-colors"
            >
              Profile
            </a>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="hidden lg:flex items-center bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
            >
              {showSidebar ? 'Hide' : 'Show'} History
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-116px)]">
        {/* Sidebar - Hidden on mobile, visible on desktop */}
        {showSidebar && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto hidden lg:block">
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">Prompt History</h2>
              {promptHistory.length === 0 ? (
                <p className="text-gray-400 text-sm">No prompts yet. Start asking questions!</p>
              ) : (
                <div className="space-y-2">
                  {promptHistory.map((prompt) => (
                    <div
                      key={prompt.id}
                      onClick={() => handleHistorySelect(prompt)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedPrompt?.id === prompt.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {truncateText(prompt.question)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatTimestamp(prompt.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6">
            {/* Demo Info Banner - hidden by default on all platforms */}
            <div className="hidden bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <h3 className="text-lg font-semibold text-blue-100">Demo Mode Active</h3>
              </div>
              <p className="text-blue-200 text-sm mb-3">
                You're exploring Linc with realistic demo data including 60 investment holdings, 
                20+ transactions, and enhanced merchant data. All features work normally, 
                but no real data is stored.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Monthly Income</div>
                  <div className="text-white font-medium">$4,250</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Monthly Savings</div>
                  <div className="text-white font-medium">$1,247</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Investment Portfolio</div>
                  <div className="text-white font-medium">$421,701</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Total Holdings</div>
                  <div className="text-white font-medium">60</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Emergency Fund</div>
                  <div className="text-white font-medium">$28,450</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Total Assets</div>
                  <div className="text-white font-medium">$1,247,450</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Net Worth</div>
                  <div className="text-white font-medium">$1,247,450</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Accounts</div>
                  <div className="text-white font-medium">10</div>
                </div>
              </div>
            </div>

            {/* Q&A Interface */}
            <div className="bg-gray-800 rounded-lg p-4 md:p-6">
              <FinanceQA 
                onNewAnswer={addToHistory}
                selectedPrompt={selectedPrompt}
                onNewQuestion={handleNewQuestion}
                isDemo={true}
                sessionId={sessionId}
                initialQuestion={initialQuestion}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
