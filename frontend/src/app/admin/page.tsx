"use client";
import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '../../components/MarkdownRenderer';

interface DemoConversation {
  id: string;
  question: string;
  answer: string;
  sessionId: string;
  createdAt: string;
  session: {
    sessionId: string;
    userAgent?: string;
    createdAt: string;
  };
  feedback: Array<{
    id: string;
    score: number;
    createdAt: string;
  }>;
}

interface SessionStats {
  sessionId: string;
  conversationCount: number;
  firstQuestion: string;
  lastActivity: string;
  userAgent?: string;
}

interface ProductionUser {
  userId: string;
  email: string;
  tier: string;
  conversationCount: number;
  firstQuestion: string;
  lastActivity: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface ProductionConversation {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    tier: string;
  };
  feedback: Array<{
    id: string;
    score: number;
    createdAt: string;
  }>;
}

interface UserForManagement {
  id: string;
  email: string;
  tier: string;
  createdAt: string;
  lastLoginAt?: string;
  _count: {
    conversations: number;
  };
}

interface MarketNewsContext {
  contextText: string;
  dataSources: string[];
  keyEvents: string[];
  lastUpdate: string;
  tier: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'demo' | 'production' | 'users' | 'market-news'>('demo');
  
  // Demo data state
  const [demoConversations, setDemoConversations] = useState<DemoConversation[]>([]);
  const [demoSessions, setDemoSessions] = useState<SessionStats[]>([]);
  
  // Production data state
  const [productionUsers, setProductionUsers] = useState<ProductionUser[]>([]);
  const [productionConversations, setProductionConversations] = useState<ProductionConversation[]>([]);
  
  // User management state
  const [usersForManagement, setUsersForManagement] = useState<UserForManagement[]>([]);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  
  // Market news state
  const [marketNewsContexts, setMarketNewsContexts] = useState<Record<string, MarketNewsContext>>({});
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [refreshingContext, setRefreshingContext] = useState<string | null>(null);
  const [refreshingDemo, setRefreshingDemo] = useState(false);
  const [refreshingProduction, setRefreshingProduction] = useState(false);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [refreshingAllContexts, setRefreshingAllContexts] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'sessions' | 'conversations'>('sessions');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    console.log('Auth token:', token ? token.substring(0, 20) + '...' : 'none');
    
    // Decode JWT token to see user info
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('JWT payload:', payload);
        console.log('User email:', payload.email);
      } catch (err) {
        console.error('Error decoding JWT:', err);
      }
    }
    
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };

  const loadDemoData = useCallback(async () => {
    try {
      // Load demo sessions overview
      const sessionsRes = await fetch(`${API_URL}/admin/demo-sessions`, {
        headers: getAuthHeaders()
      });
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setDemoSessions(sessionsData.sessions);
      } else if (sessionsRes.status === 401 || sessionsRes.status === 403) {
        setError('Authentication required for admin access');
      }

      // Load demo conversations
      const conversationsRes = await fetch(`${API_URL}/admin/demo-conversations`, {
        headers: getAuthHeaders()
      });
      if (conversationsRes.ok) {
        const conversationsData = await conversationsRes.json();
        setDemoConversations(conversationsData.conversations);
      } else if (conversationsRes.status === 401 || conversationsRes.status === 403) {
        setError('Authentication required for admin access');
      }
    } catch (err) {
      console.error('Demo data load error:', err);
    }
  }, [API_URL]);

  const refreshDemoData = async () => {
    setRefreshingDemo(true);
    try {
      await loadDemoData();
    } catch (err) {
      console.error('Demo data refresh error:', err);
    } finally {
      setRefreshingDemo(false);
    }
  };

  const loadProductionData = useCallback(async () => {
    try {
      // Load production users overview
      const usersRes = await fetch(`${API_URL}/admin/production-sessions`, {
        headers: getAuthHeaders()
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setProductionUsers(usersData.users);
      } else if (usersRes.status === 401 || usersRes.status === 403) {
        setError('Authentication required for admin access');
      }

      // Load production conversations
      const conversationsRes = await fetch(`${API_URL}/admin/production-conversations`, {
        headers: getAuthHeaders()
      });
      if (conversationsRes.ok) {
        const conversationsData = await conversationsRes.json();
        setProductionConversations(conversationsData.conversations);
      } else if (conversationsRes.status === 401 || conversationsRes.status === 403) {
        setError('Authentication required for admin access');
      }
    } catch (err) {
      console.error('Production data load error:', err);
    }
  }, [API_URL]);

  const refreshProductionData = async () => {
    setRefreshingProduction(true);
    try {
      await loadProductionData();
    } catch (err) {
      console.error('Production data refresh error:', err);
    } finally {
      setRefreshingProduction(false);
    }
  };

  const loadUsersForManagement = useCallback(async () => {
    try {
      const usersRes = await fetch(`${API_URL}/admin/production-users`, {
        headers: getAuthHeaders()
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersForManagement(usersData.users);
      } else if (usersRes.status === 401 || usersRes.status === 403) {
        setError('Authentication required for admin access');
      }
    } catch (err) {
      console.error('Users management load error:', err);
    }
  }, [API_URL]);

  const refreshUsersData = async () => {
    setRefreshingUsers(true);
    try {
      await loadUsersForManagement();
    } catch (err) {
      console.error('Users data refresh error:', err);
    } finally {
      setRefreshingUsers(false);
    }
  };

  const loadMarketNewsContexts = useCallback(async () => {
    try {
      console.log('Loading market news contexts...');
      const tiers = ['starter', 'standard', 'premium'];
      const contexts: Record<string, MarketNewsContext> = {};
      
      for (const tier of tiers) {
        try {
          console.log(`Loading context for tier: ${tier}`);
          const response = await fetch(`${API_URL}/market-news/context/${tier}`, {
            headers: getAuthHeaders()
          });
          
          console.log(`Context response for ${tier}: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            contexts[tier] = data;
            console.log(`Loaded context for ${tier}:`, data);
          } else if (response.status === 404) {
            // No context found for this tier
            contexts[tier] = {
              contextText: '',
              dataSources: [],
              keyEvents: [],
              lastUpdate: '',
              tier
            };
            console.log(`No context found for ${tier}`);
          } else {
            console.error(`Error loading context for ${tier}: ${response.status}`);
          }
        } catch (err) {
          console.error(`Error loading market context for ${tier}:`, err);
          contexts[tier] = {
            contextText: '',
            dataSources: [],
            keyEvents: [],
            lastUpdate: '',
            tier
          };
        }
      }
      
      console.log('All contexts loaded:', contexts);
      setMarketNewsContexts(contexts);
    } catch (err) {
      console.error('Market news contexts load error:', err);
    }
  }, [API_URL]);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      await Promise.all([
        loadDemoData(),
        loadProductionData(),
        loadUsersForManagement(),
        loadMarketNewsContexts()
      ]);
    } catch (err) {
      setError('Failed to load admin data');
      console.error('Admin data load error:', err);
    } finally {
      setLoading(false);
    }
  }, [loadDemoData, loadProductionData, loadUsersForManagement, loadMarketNewsContexts]);

  const refreshAllData = async () => {
    setRefreshingAll(true);
    setError('');
    
    try {
      console.log('Starting refresh of all admin data...');
      await Promise.all([
        loadDemoData(),
        loadProductionData(),
        loadUsersForManagement(),
        loadMarketNewsContexts()
      ]);
      console.log('All admin data refresh completed');
    } catch (err) {
      setError('Failed to refresh admin data');
      console.error('Admin data refresh error:', err);
    } finally {
      setRefreshingAll(false);
    }
  };

  const refreshAllMarketContexts = async () => {
    setRefreshingAllContexts(true);
    console.log('Starting refresh of all market contexts...');
    const tiers = ['starter', 'standard', 'premium'];
    
    try {
      // Refresh all tiers in parallel
      await Promise.all(
        tiers.map(async (tier) => {
          console.log(`Refreshing market context for tier: ${tier}`);
          const response = await fetch(`${API_URL}/admin/market-news/refresh/${tier}`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          
          console.log(`Refresh response for ${tier}: ${response.status}`);
          
          if (response.ok) {
            console.log(`Successfully refreshed ${tier} tier`);
          } else {
            console.error(`Failed to refresh ${tier} tier: ${response.status}`);
          }
        })
      );
      
      // After refreshing, reload the contexts
      await loadMarketNewsContexts();
      console.log('All market contexts refresh completed');
    } catch (err) {
      console.error('Error refreshing all market contexts:', err);
    } finally {
      setRefreshingAllContexts(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const updateUserTier = async (userId: string, newTier: string) => {
    setUpdatingTier(userId);
    try {
      const response = await fetch(`${API_URL}/admin/update-user-tier`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, newTier }),
      });

      if (response.ok) {
        // Refresh the users list
        await loadUsersForManagement();
        // Also refresh production data to show updated tiers
        await loadProductionData();
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        console.error('Failed to update user tier');
      }
    } catch (err) {
      console.error('Error updating user tier:', err);
    } finally {
      setUpdatingTier(null);
    }
  };

  const refreshMarketContext = async (tier: string) => {
    setRefreshingContext(tier);
    try {
      console.log(`Refreshing market context for tier: ${tier}`);
      const response = await fetch(`${API_URL}/admin/market-news/refresh/${tier}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      console.log(`Refresh response status: ${response.status}`);
      
      if (response.ok) {
        console.log('Refresh successful, reloading context...');
        // Reload the specific context
        const contextResponse = await fetch(`${API_URL}/market-news/context/${tier}`, {
          headers: getAuthHeaders()
        });
        
        console.log(`Context reload status: ${contextResponse.status}`);
        
        if (contextResponse.ok) {
          const data = await contextResponse.json();
          console.log('Context data received:', data);
          setMarketNewsContexts(prev => ({
            ...prev,
            [tier]: data
          }));
        } else {
          console.error('Failed to reload context:', contextResponse.status, contextResponse.statusText);
        }
      } else if (response.status === 401 || response.status === 403) {
        console.error('Authentication error:', response.status, response.statusText);
        setError('Authentication required for admin access');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Refresh failed:', response.status, errorData);
      }
    } catch (err) {
      console.error(`Error refreshing market context for ${tier}:`, err);
    } finally {
      setRefreshingContext(null);
    }
  };

  const editMarketContext = (tier: string) => {
    const context = marketNewsContexts[tier];
    setEditingContext(tier);
    setEditingText(context?.contextText || '');
  };

  const saveMarketContext = async (tier: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/market-news/context/${tier}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ contextText: editingText })
      });
      
      if (response.ok) {
        setEditingContext(null);
        setEditingText('');
        // Reload the context
        await loadMarketNewsContexts();
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      }
    } catch (err) {
      console.error(`Error saving market context for ${tier}:`, err);
    }
  };

  const cancelEdit = () => {
    setEditingContext(null);
    setEditingText('');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const getQuestionCategories = (conversations: (DemoConversation | ProductionConversation)[]) => {
    const categories: { [key: string]: number } = {};
    
    conversations.forEach(conv => {
      const question = conv.question.toLowerCase();
      
      if (question.includes('spend') || question.includes('expense') || question.includes('cost')) {
        categories['Spending Analysis'] = (categories['Spending Analysis'] || 0) + 1;
      } else if (question.includes('save') || question.includes('emergency fund') || question.includes('savings')) {
        categories['Savings'] = (categories['Savings'] || 0) + 1;
      } else if (question.includes('invest') || question.includes('portfolio') || question.includes('asset')) {
        categories['Investments'] = (categories['Investments'] || 0) + 1;
      } else if (question.includes('debt') || question.includes('credit') || question.includes('loan')) {
        categories['Debt'] = (categories['Debt'] || 0) + 1;
      } else if (question.includes('budget') || question.includes('income') || question.includes('cash flow')) {
        categories['Budgeting'] = (categories['Budgeting'] || 0) + 1;
      } else if (question.includes('retirement') || question.includes('401k') || question.includes('ira')) {
        categories['Retirement'] = (categories['Retirement'] || 0) + 1;
      } else {
        categories['Other'] = (categories['Other'] || 0) + 1;
      }
    });
    
    return categories;
  };

  const renderDemoTab = () => {
    const questionCategories = getQuestionCategories(demoConversations);
    
    return (
      <div>
        {/* Header with refresh button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Demo Activity</h2>
          <button
            onClick={refreshDemoData}
            disabled={refreshingDemo}
            className={`px-4 py-2 rounded text-sm ${
              refreshingDemo 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title="Refresh demo data only"
          >
            {refreshingDemo ? 'Refreshing...' : 'Refresh Demo Data'}
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{demoSessions.length}</div>
            <div className="text-gray-400 text-sm">Active Sessions</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{demoConversations.length}</div>
            <div className="text-gray-400 text-sm">Total Conversations</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">
              {demoConversations.length > 0 ? Math.round(demoConversations.length / demoSessions.length) : 0}
            </div>
            <div className="text-gray-400 text-sm">Avg Conversations/Session</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-400">
              {demoSessions.length > 0 ? Math.round(demoSessions.filter(s => s.conversationCount > 1).length / demoSessions.length * 100) : 0}%
            </div>
            <div className="text-gray-400 text-sm">Multi-Question Sessions</div>
          </div>
        </div>

        {/* Question Categories */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Question Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(questionCategories)
              .sort(([,a], [,b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="bg-gray-700 rounded p-3">
                  <div className="text-lg font-semibold text-blue-400">{count}</div>
                  <div className="text-sm text-gray-400">{category}</div>
                </div>
              ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setViewMode('sessions')}
            className={`px-4 py-2 rounded text-sm ${
              viewMode === 'sessions' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Sessions Overview
          </button>
          <button
            onClick={() => setViewMode('conversations')}
            className={`px-4 py-2 rounded text-sm ${
              viewMode === 'conversations' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All Conversations
          </button>
        </div>

        {/* Sessions View */}
        {viewMode === 'sessions' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Demo Sessions</h2>
            <div className="space-y-4">
              {demoSessions.map((session) => (
                <div 
                  key={session.sessionId}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => setSelectedSession(selectedSession === session.sessionId ? null : session.sessionId)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-white mb-2">
                        Session: {session.sessionId.substring(0, 8)}...
                      </div>
                      <div className="text-sm text-gray-400 mb-2">
                        {session.conversationCount} conversations • {formatDate(session.lastActivity)}
                      </div>
                      <div className="text-sm text-gray-500 mb-2">
                        First question: {truncateText(session.firstQuestion)}
                      </div>
                      {session.userAgent && (
                        <div className="text-xs text-gray-600">
                          {session.userAgent.substring(0, 50)}...
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {session.conversationCount} Q&A
                      </div>
                    </div>
                  </div>
                  
                  {/* Show conversations for this session when expanded */}
                  {selectedSession === session.sessionId && (
                    <div className="mt-4 space-y-3">
                      {demoConversations
                        .filter(conv => conv.session.sessionId === session.sessionId)
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((conv) => (
                          <div key={conv.id} className="bg-gray-600 rounded p-3 ml-4">
                            <div className="text-sm font-medium text-blue-300 mb-1">Q:</div>
                            <div className="text-sm text-gray-300 mb-2">{conv.question}</div>
                            <div className="text-sm font-medium text-green-300 mb-1">A:</div>
                            <div className="text-sm text-gray-300">
                              <MarkdownRenderer>{truncateText(conv.answer, 200)}</MarkdownRenderer>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {formatDate(conv.createdAt)}
                            </div>
                            
                            {/* Feedback Display */}
                            {conv.feedback && conv.feedback.length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs font-medium text-yellow-300 mb-1">Feedback:</div>
                                <div className="flex items-center space-x-2">
                                  {conv.feedback.map((fb) => (
                                    <div key={fb.id} className="flex items-center space-x-1">
                                      <span className="text-xs text-gray-400">Score:</span>
                                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                                        fb.score >= 4 ? 'bg-green-600 text-white' :
                                        fb.score >= 3 ? 'bg-yellow-600 text-white' :
                                        'bg-red-600 text-white'
                                      }`}>
                                        {fb.score}/5
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        ({formatDate(fb.createdAt)})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversations View */}
        {viewMode === 'conversations' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">All Demo Conversations</h2>
            <div className="space-y-4">
              {demoConversations
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((conv) => (
                  <div key={conv.id} className="bg-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="text-sm text-gray-400">
                        Session: {conv.session.sessionId.substring(0, 8)}...
                      </div>
                      <div className="text-sm text-gray-400">
                        {formatDate(conv.createdAt)}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-blue-300 mb-1">Question:</div>
                        <div className="text-white">{conv.question}</div>
                      </div>
                      
                      <div>
                        <div className="text-sm font-medium text-green-300 mb-1">Answer:</div>
                        <div className="text-gray-300">
                          <MarkdownRenderer>{conv.answer}</MarkdownRenderer>
                        </div>
                      </div>
                      
                      {/* Feedback Display */}
                      {conv.feedback && conv.feedback.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-yellow-300 mb-1">Feedback:</div>
                          <div className="flex items-center space-x-2">
                            {conv.feedback.map((fb) => (
                              <div key={fb.id} className="flex items-center space-x-1">
                                <span className="text-xs text-gray-400">Score:</span>
                                <span className={`text-sm font-medium px-2 py-1 rounded ${
                                  fb.score >= 4 ? 'bg-green-600 text-white' :
                                  fb.score >= 3 ? 'bg-yellow-600 text-white' :
                                  'bg-red-600 text-white'
                                }`}>
                                  {fb.score}/5
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({formatDate(fb.createdAt)})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProductionTab = () => {
    const questionCategories = getQuestionCategories(productionConversations);
    
    return (
      <div>
        {/* Header with refresh button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Production Activity</h2>
          <button
            onClick={refreshProductionData}
            disabled={refreshingProduction}
            className={`px-4 py-2 rounded text-sm ${
              refreshingProduction 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title="Refresh production data only"
          >
            {refreshingProduction ? 'Refreshing...' : 'Refresh Production Data'}
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{productionUsers.length}</div>
            <div className="text-gray-400 text-sm">Active Users</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">
              {productionConversations.filter(conv => conv.user).length}
              {productionConversations.some(conv => !conv.user) && (
                <span className="text-sm text-yellow-400 ml-1">
                  /{productionConversations.length}
                </span>
              )}
            </div>
            <div className="text-gray-400 text-sm">
              Valid Conversations
              {productionConversations.some(conv => !conv.user) && (
                <span className="text-yellow-400 text-xs block">({productionConversations.filter(conv => !conv.user).length} with missing data)</span>
              )}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">
              {productionConversations.filter(conv => conv.user).length > 0 ? Math.round(productionConversations.filter(conv => conv.user).length / productionUsers.length) : 0}
            </div>
            <div className="text-gray-400 text-sm">Avg Conversations/User</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-400">
              {productionUsers.length > 0 ? Math.round(productionUsers.filter(u => u.conversationCount > 1).length / productionUsers.length * 100) : 0}%
            </div>
            <div className="text-gray-400 text-sm">Multi-Question Users</div>
          </div>
        </div>

        {/* Question Categories */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Question Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(questionCategories)
              .sort(([,a], [,b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="bg-gray-700 rounded p-3">
                  <div className="text-lg font-semibold text-blue-400">{count}</div>
                  <div className="text-sm text-gray-400">{category}</div>
                </div>
              ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setViewMode('sessions')}
            className={`px-4 py-2 rounded text-sm ${
              viewMode === 'sessions' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Users Overview
          </button>
          <button
            onClick={() => setViewMode('conversations')}
            className={`px-4 py-2 rounded text-sm ${
              viewMode === 'conversations' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All Conversations
          </button>
        </div>

        {/* Users View */}
        {viewMode === 'sessions' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Production Users</h2>
            <div className="space-y-4">
              {productionUsers.map((user) => (
                <div 
                  key={user.userId}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => setSelectedSession(selectedSession === user.userId ? null : user.userId)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-white mb-2">
                        {user.email}
                      </div>
                      <div className="text-sm text-gray-400 mb-2">
                        {user.conversationCount} conversations • {formatDate(user.lastActivity)}
                      </div>
                      <div className="text-sm text-gray-500 mb-2">
                        Tier: {user.tier} • First question: {truncateText(user.firstQuestion)}
                      </div>
                      <div className="text-xs text-gray-600">
                        Created: {formatDate(user.createdAt)}
                        {user.lastLoginAt && ` • Last login: ${formatDate(user.lastLoginAt)}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {user.conversationCount} Q&A
                      </div>
                    </div>
                  </div>
                  
                  {/* Show conversations for this user when expanded */}
                  {selectedSession === user.userId && (
                    <div className="mt-4 space-y-3">
                      {/* Check if there are conversations with missing user data */}
                      {productionConversations.some(conv => !conv.user) && (
                        <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-2 mb-3">
                          <div className="text-yellow-200 text-xs">
                            ⚠️ Some conversations have missing user data
                          </div>
                        </div>
                      )}
                      
                      {productionConversations
                        .filter(conv => conv.user && conv.user.id === user.userId)
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((conv) => (
                          <div key={conv.id} className="bg-gray-600 rounded p-3 ml-4">
                            <div className="text-sm font-medium text-blue-300 mb-1">Q:</div>
                            <div className="text-sm text-gray-300 mb-2">{conv.question}</div>
                            <div className="text-sm font-medium text-green-300 mb-1">A:</div>
                            <div className="text-sm text-gray-300">
                              <MarkdownRenderer>{truncateText(conv.answer, 200)}</MarkdownRenderer>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {formatDate(conv.createdAt)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversations View */}
        {viewMode === 'conversations' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">All Production Conversations</h2>
            
            {/* Warning about conversations with missing user data */}
            {(() => {
              const conversationsWithMissingUsers = productionConversations.filter(conv => !conv.user).length;
              return conversationsWithMissingUsers > 0 ? (
                <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3 mb-4">
                  <div className="text-yellow-200 text-sm">
                    ⚠️ {conversationsWithMissingUsers} conversation{conversationsWithMissingUsers !== 1 ? 's' : ''} have missing user data and are not displayed. 
                    This may indicate a data integrity issue in the backend.
                  </div>
                </div>
              ) : null;
            })()}
            
            <div className="space-y-4">
              {productionConversations
                .filter(conv => conv.user) // Filter out conversations with null users
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((conv) => (
                  <div key={conv.id} className="bg-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="text-sm text-gray-400">
                        User: {conv.user.email} ({conv.user.tier})
                      </div>
                      <div className="text-sm text-gray-400">
                        {formatDate(conv.createdAt)}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-blue-300 mb-1">Question:</div>
                        <div className="text-white">{conv.question}</div>
                      </div>
                      
                      <div>
                        <div className="text-sm font-medium text-green-300 mb-1">Answer:</div>
                        <div className="text-gray-300">
                          <MarkdownRenderer>{conv.answer}</MarkdownRenderer>
                        </div>
                      </div>
                      
                      {/* Feedback Display */}
                      {conv.feedback && conv.feedback.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-yellow-300 mb-1">Feedback:</div>
                          <div className="flex items-center space-x-2">
                            {conv.feedback.map((fb) => (
                              <div key={fb.id} className="flex items-center space-x-1">
                                <span className="text-xs text-gray-400">Score:</span>
                                <span className={`text-sm font-medium px-2 py-1 rounded ${
                                  fb.score >= 4 ? 'bg-green-600 text-white' :
                                  fb.score >= 3 ? 'bg-yellow-600 text-white' :
                                  'bg-red-600 text-white'
                                }`}>
                                  {fb.score}/5
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({formatDate(fb.createdAt)})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUsersTab = () => {
    return (
      <div>
        {/* Header with refresh button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">User Management</h2>
          <button
            onClick={refreshUsersData}
            disabled={refreshingUsers}
            className={`px-4 py-2 rounded text-sm ${
              refreshingUsers 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title="Refresh user management data only"
          >
            {refreshingUsers ? 'Refreshing...' : 'Refresh User Data'}
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">User Management</h2>
          <div className="space-y-4">
            {usersForManagement.map((user) => (
              <div key={user.id} className="bg-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="font-medium text-white mb-2">
                      {user.email}
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      Conversations: {user._count.conversations} • Created: {formatDate(user.createdAt)}
                    </div>
                    {user.lastLoginAt && (
                      <div className="text-xs text-gray-600">
                        Last login: {formatDate(user.lastLoginAt)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-gray-400">
                      Current: {user.tier}
                    </div>
                    <select
                      value={user.tier}
                      onChange={(e) => updateUserTier(user.id, e.target.value)}
                      disabled={updatingTier === user.id}
                      className="bg-gray-600 text-white px-3 py-1 rounded text-sm border border-gray-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="starter">Starter</option>
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                    </select>
                    {updatingTier === user.id && (
                      <div className="text-xs text-yellow-400">Updating...</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderMarketNewsTab = () => {
    const tiers = ['starter', 'standard', 'premium'];
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Market News Context</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => refreshAllMarketContexts()}
              disabled={refreshingAllContexts}
              className={`px-4 py-2 rounded ${
                refreshingAllContexts 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title="Refresh all market news contexts"
            >
              {refreshingAllContexts ? 'Refreshing...' : 'Refresh All Contexts'}
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {tiers.map(tier => {
            const context = marketNewsContexts[tier];
            const isEditing = editingContext === tier;
            const isRefreshing = refreshingContext === tier;
            
            return (
              <div key={tier} className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white capitalize">{tier} Tier</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => refreshMarketContext(tier)}
                      disabled={isRefreshing}
                      className={`px-3 py-1 rounded text-sm ${
                        isRefreshing 
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      onClick={() => editMarketContext(tier)}
                      disabled={isEditing}
                      className={`px-3 py-1 rounded text-sm ${
                        isEditing 
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                          : 'bg-yellow-600 text-white hover:bg-yellow-700'
                      }`}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                
                {isEditing ? (
                  <div>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full h-64 p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                      placeholder="Enter market context..."
                    />
                    <div className="mt-3 flex space-x-2">
                      <button
                        onClick={() => saveMarketContext(tier)}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Last updated: {formatDate(context?.lastUpdate || '')}
                      {context?.dataSources && context.dataSources.length > 0 && (
                        <span className="ml-4">
                          Sources: {context.dataSources.join(', ')}
                        </span>
                      )}
                    </div>
                    
                    {context?.contextText ? (
                      <div className="text-gray-300 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto bg-gray-700 p-4 rounded">
                        <MarkdownRenderer>{context.contextText}</MarkdownRenderer>
                      </div>
                    ) : (
                      <div className="text-gray-500 italic text-sm bg-gray-700 p-4 rounded">
                        No market context available for this tier.
                      </div>
                    )}
                    
                    {context?.keyEvents && context.keyEvents.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Key Events:</h4>
                        <div className="flex flex-wrap gap-2">
                          {context.keyEvents.map((event, index) => (
                            <span key={index} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                              {event}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
          <div className="text-gray-400">Loading admin data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-200">
                  Admin Access Required
                </h3>
                <div className="mt-2 text-sm text-red-100">
                  {error}
                </div>
                <div className="mt-2 text-xs text-red-200">
                  Please log in with an admin account to access this dashboard.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('demo')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'demo' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            Demo
          </button>
          <button
            onClick={() => setActiveTab('production')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'production' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'users' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('market-news')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'market-news' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            Market News
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'demo' && renderDemoTab()}
        {activeTab === 'production' && renderProductionTab()}
        {activeTab === 'users' && renderUsersTab()}
        {activeTab === 'market-news' && renderMarketNewsTab()}
      </div>
    </div>
  );
} 