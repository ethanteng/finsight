"use client";
import { useState, useEffect } from 'react';
import FinanceQA from '../../components/FinanceQA';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export default function AppPage() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Load prompt history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('linc_prompt_history');
    if (saved) {
      try {
        const history = JSON.parse(saved);
        setPromptHistory(history);
        // Set the most recent prompt as selected if there are any
        if (history.length > 0) {
          setSelectedPrompt(history[0]);
        }
      } catch (error) {
        console.error('Failed to load prompt history:', error);
      }
    }
  }, []);

  // Save prompt history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('linc_prompt_history', JSON.stringify(promptHistory));
  }, [promptHistory]);

  const addToHistory = (question: string, answer: string) => {
    const newPrompt: PromptHistory = {
      id: Date.now().toString(),
      question,
      answer,
      timestamp: Date.now(),
    };
    setPromptHistory(prev => [newPrompt, ...prev.slice(0, 49)]); // Keep last 50 prompts
    setSelectedPrompt(newPrompt);
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
          <h1 className="text-2xl font-bold text-white">Ask Linc</h1>
          <div className="flex items-center space-x-3">
            <a 
              href="/privacy" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Privacy
            </a>
            <a 
              href="/profile" 
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
          <div className="max-w-4xl mx-auto p-6">
            {/* Q&A Interface */}
            <div className="bg-gray-800 rounded-lg p-6">
              <FinanceQA 
                onNewAnswer={addToHistory}
                selectedPrompt={selectedPrompt}
                onNewQuestion={handleNewQuestion}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 