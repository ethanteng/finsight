"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, Sparkles, UserRound, X } from 'lucide-react';
import FinanceQA from '../../components/FinanceQA';
import SiteFooter from '../../components/SiteFooter';
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
    <div className="min-h-screen bg-[#f5f1e8] text-[#17372e]">
      {/* Demo notice */}
      <div className="border-b border-[#9d6a16]/20 bg-[#fff3ce] px-4 py-2 text-center text-sm text-[#76510f]">
        This is a fully functional demo using fictional accounts. Nothing here is tied to a real person.
      </div>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#123c2f]/10 bg-[#f5f1e8]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[#123c2f]"><span className="grid h-9 w-9 place-items-center rounded-[10px_10px_10px_3px] bg-[#123c2f] text-[#c9f46b]">L</span>Ask Linc <span className="rounded-full bg-[#fff3ce] px-2 py-1 text-[10px] uppercase tracking-wider text-[#76510f]">Demo</span></Link>
          <div className="flex items-center gap-2">
            <button onClick={() => handleBuyClick('premium')} disabled={isCheckoutLoading} className="hidden rounded-full bg-[#c9f46b] px-5 py-2.5 text-sm font-semibold text-[#123c2f] transition hover:bg-[#b9e55e] sm:inline-flex">{isCheckoutLoading ? 'Opening…' : <><Sparkles className="mr-2" size={16} />Get started</>}</button>
            <Link href="/profile?demo=true" className="rounded-full border border-[#123c2f]/15 p-2.5 text-[#123c2f]" aria-label="View demo profile"><UserRound size={18} /></Link>
            <button onClick={() => setShowSidebar(!showSidebar)} className="rounded-full border border-[#123c2f]/15 p-2.5 lg:hidden" aria-label="Toggle decision history">{showSidebar ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-7xl">
        {/* Sidebar - Hidden on mobile, visible on desktop */}
        {showSidebar && (
          <div className={`${showSidebar ? 'block' : 'hidden'} w-72 shrink-0 overflow-y-auto border-r border-[#123c2f]/10 bg-[#123c2f] text-white lg:block`}>
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">Prompt History</h2>
              {promptHistory.length === 0 ? (
                <p className="text-sm text-white/65">No prompts yet. Start asking questions!</p>
              ) : (
                <div className="space-y-2">
                  {promptHistory.map((prompt) => (
                    <div
                      key={prompt.id}
                      onClick={() => handleHistorySelect(prompt)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedPrompt?.id === prompt.id
                          ? 'bg-[#c9f46b] text-[#123c2f] shadow-sm'
                          : 'bg-white/8 text-white/85 hover:bg-white/14'
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {truncateText(prompt.question)}
                      </div>
                      <div className={`text-xs ${selectedPrompt?.id === prompt.id ? 'text-[#315a3e]' : 'text-white/55'}`}>
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
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-4 md:p-8">
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
            <div>
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
      <SiteFooter variant="auth" />
    </div>
  );
}
