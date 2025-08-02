"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import FinanceQA from '../../components/FinanceQA';
import TierBanner from '../../components/TierBanner';
// import { demoData, getDemoDataAnalysis } from '../../data/demo-data';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export default function DemoPage() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sessionId, setSessionId] = useState<string>('');

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white">Ask Linc</h1>
            <TierBanner isDemoPage={true} />
            <div className="px-3 py-1 bg-yellow-500 text-yellow-900 rounded-full text-xs font-medium">
              DEMO MODE
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Link 
              href="/#waitlist" 
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Join the Waitlist
            </Link>
            <a 
              href="/profile?demo=true" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Profile
            </a>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
            >
              {showSidebar ? 'Hide' : 'Show'} History
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">Prompt History</h2>
              {promptHistory.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">No prompts yet. Start asking questions!</p>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <h3 className="text-sm font-medium text-white mb-2">Demo Data Available:</h3>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li>• 7 accounts (checking, savings, investments, credit, mortgage)</li>
                      <li>• 6 months of transaction history</li>
                      <li>• 4 financial goals</li>
                      <li>• Real market data integration</li>
                    </ul>
                  </div>
                </div>
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
          <div className="max-w-4xl mx-auto p-6">
            {/* Demo Info Banner */}
            <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <h3 className="text-lg font-semibold text-blue-100">Demo Mode Active</h3>
              </div>
              <p className="text-blue-200 text-sm mb-3">
                You're exploring Linc with realistic demo data. 
                All features work normally, but no real data is stored.
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
                  <div className="text-blue-300">Net Worth</div>
                  <div className="text-white font-medium">$312,450</div>
                </div>
                <div className="bg-blue-800 rounded p-2">
                  <div className="text-blue-300">Emergency Fund</div>
                  <div className="text-white font-medium">$28,450</div>
                </div>
              </div>
            </div>

            {/* Q&A Interface */}
            <div className="bg-gray-800 rounded-lg p-6">
              <FinanceQA 
                onNewAnswer={addToHistory}
                selectedPrompt={selectedPrompt}
                onNewQuestion={handleNewQuestion}
                isDemo={true}
                sessionId={sessionId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 