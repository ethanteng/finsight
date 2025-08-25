"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import FinanceQA from '../../components/FinanceQA';
import TierBanner from '../../components/TierBanner';
import FinancialOverview from '../../components/FinancialOverview';
import { resetPlaidLinkInitialization } from '../../components/PlaidLinkButton';
import PageMeta from '../../components/PageMeta';

interface PromptHistory {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

interface SubscriptionStatus {
  status: string;
  tier: string;
  message: string;
  isActive: boolean;
  accessLevel: 'full' | 'none';
  upgradeRequired: boolean;
  expiresAt?: string;
}

export default function AppPage() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [showSidebar, setShowSidebar] = useState(true); // Show by default on desktop
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const router = useRouter();

  // Check subscription status
  const checkSubscriptionStatus = useCallback(async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      console.log('🔍 API_URL:', API_URL);
      console.log('🔍 Full URL:', `${API_URL}/api/stripe/subscription-status`);
      
      const res = await fetch(`${API_URL}/api/stripe/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.status === 401) {
        // Session expired - redirect to login
        console.log('Session expired while checking subscription status, redirecting to login');
        localStorage.removeItem('auth_token');
        router.push('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        console.log('🔍 Frontend received subscription status response:', data);
        
        // Check if user has access
        if (data.accessLevel !== 'full') {
          // Access denied - redirect to login with message
          localStorage.removeItem('auth_token');
          router.push(`/login?message=${encodeURIComponent(data.message)}`);
          return;
        }
        
        setSubscriptionStatus({
          status: data.status,
          tier: data.tier,
          message: data.message || '',
          isActive: data.status === 'active',
          accessLevel: data.accessLevel || 'none',
          upgradeRequired: data.upgradeRequired || false,
          expiresAt: data.expiresAt
        });
        console.log('🔍 Frontend set subscription status:', {
          status: data.status,
          tier: data.tier,
          message: data.message || '',
          isActive: data.status === 'active',
          accessLevel: data.accessLevel || 'none',
          upgradeRequired: data.upgradeRequired || false,
          expiresAt: data.expiresAt
        });
      } else if (res.status === 403) {
        // Access denied - redirect to login
        const errorData = await res.json();
        localStorage.removeItem('auth_token');
        router.push(`/login?message=${encodeURIComponent(errorData.message)}`);
      } else {
        console.error('Failed to check subscription status:', res.status);
      }
    } catch (error) {
      console.error('Failed to check subscription status:', error);
    }
  }, [router]);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          // No token, redirect to login
          router.push('/login');
          return;
        }

        // Verify token with backend
        const res = await fetch(`${API_URL}/auth/verify`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(true);
          setUserEmail(data.user.email);
          setIsLoading(false);
          
          // Check subscription status after authentication
          checkSubscriptionStatus(token);
        } else {
          // Token invalid, redirect to login
          localStorage.removeItem('auth_token');
          router.push('/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('auth_token');
        router.push('/login');
      }
    };

    checkAuth();
  }, [router, checkSubscriptionStatus]);

  // Load prompt history from backend on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const loadConversationHistory = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}/conversations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.status === 401) {
          // Session expired - redirect to login
          console.log('Session expired while loading conversation history, redirecting to login');
          localStorage.removeItem('auth_token');
          router.push('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
          return;
        }
        
        if (res.ok) {
          const data = await res.json();
          console.log('Backend response:', data);
          const history: PromptHistory[] = data.conversations.map((conv: { id: string; question: string; answer: string; timestamp: number }) => ({
            id: conv.id,
            question: conv.question,
            answer: conv.answer,
            timestamp: conv.timestamp
          }));
          
          setPromptHistory(history);
          if (history.length > 0) {
            setSelectedPrompt(history[0]);
          }
          
          console.log(`Loaded ${history.length} conversations from backend`);
        } else {
          console.error('Failed to load conversation history:', res.status);
        }
      } catch (error) {
        console.error('Failed to load conversation history:', error);
      }
    };
    
    loadConversationHistory();
  }, [isAuthenticated, router]);

  // Note: Conversation history is now stored in the backend, not localStorage

  const addToHistory = (_question: string, _answer: string) => {
    // Note: Conversations are now stored in the backend via the /ask endpoint
    // Reload conversation history from backend to show the new conversation
    console.log('Conversation saved to backend via /ask endpoint, reloading history...');
    
    const loadConversationHistory = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}/conversations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.status === 401) {
          // Session expired - redirect to login
          console.log('Session expired while reloading conversation history, redirecting to login');
          localStorage.removeItem('auth_token');
          router.push('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
          return;
        }
        
        if (res.ok) {
          const data = await res.json();
          const history: PromptHistory[] = data.conversations.map((conv: { id: string; question: string; answer: string; timestamp: number }) => ({
            id: conv.id,
            question: conv.question,
            answer: conv.answer,
            timestamp: conv.timestamp
          }));
          
          setPromptHistory(history);
          if (history.length > 0) {
            setSelectedPrompt(history[0]);
          }
          
          console.log(`Reloaded ${history.length} conversations from backend`);
        } else {
          console.error('Failed to reload conversation history:', res.status);
        }
      } catch (error) {
        console.error('Failed to reload conversation history:', error);
      }
    };
    
    loadConversationHistory();
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

  const handleAddAccounts = () => {
    // Set a flag in localStorage to indicate user wants to connect accounts
    localStorage.setItem('wants_to_connect_accounts', 'true');
    // Navigate to profile page
    router.push('/profile');
  };

  const handleLogout = () => {
    // Reset Plaid Link initialization flag when logging out
    resetPlaidLinkInitialization();
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  // No subscription warning banner needed - access is controlled at login level

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render the app if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // No subscription warning needed

  return (
    <>
      <PageMeta 
        title="Personal Financial Dashboard | Ask Linc - AI-Powered Money Management" 
        description="Access your personal financial command center with Ask Linc. View real-time account balances, analyze spending patterns, and get AI-powered recommendations for your financial goals."
      />
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-white">Ask Linc</h1>
              {/* Hide TierBanner on mobile */}
              <div className="hidden md:block">
                <TierBanner />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Hide email on mobile */}
              {userEmail && (
                <span className="hidden md:block text-gray-400 text-sm">
                  {userEmail}
                </span>
              )}
              <a 
                href="/contact" 
                className="text-blue-300 hover:text-blue-200 text-sm transition-colors font-medium"
              >
                Give Feedback
              </a>
              <a 
                href="/profile" 
                className="text-gray-300 hover:text-white text-sm transition-colors"
              >
                Profile
              </a>
              <button 
                onClick={handleLogout}
                className="text-gray-300 hover:text-white text-sm transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* No subscription warning banner - access controlled at login level */}

        <div className="flex h-[calc(100vh-80px)]">
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
              {/* Financial Overview */}
              <FinancialOverview />
              
              {/* Q&A Interface */}
              <div className="bg-gray-800 rounded-lg p-4 md:p-6">
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
    </>
  );
} 