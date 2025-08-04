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

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'demo' | 'production' | 'users'>('demo');
  
  // Demo data state
  const [demoConversations, setDemoConversations] = useState<DemoConversation[]>([]);
  const [demoSessions, setDemoSessions] = useState<SessionStats[]>([]);
  
  // Production data state
  const [productionUsers, setProductionUsers] = useState<ProductionUser[]>([]);
  const [productionConversations, setProductionConversations] = useState<ProductionConversation[]>([]);
  
  // User management state
  const [usersForManagement, setUsersForManagement] = useState<UserForManagement[]>([]);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'sessions' | 'conversations'>('sessions');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadDemoData = useCallback(async () => {
    try {
      // Load demo sessions overview
      const sessionsRes = await fetch(`${API_URL}/admin/demo-sessions`);
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setDemoSessions(sessionsData.sessions);
      }

      // Load demo conversations
      const conversationsRes = await fetch(`${API_URL}/admin/demo-conversations`);
      if (conversationsRes.ok) {
        const conversationsData = await conversationsRes.json();
        setDemoConversations(conversationsData.conversations);
      }
    } catch (err) {
      console.error('Demo data load error:', err);
    }
  }, [API_URL]);

  const loadProductionData = useCallback(async () => {
    try {
      // Load production users overview
      const usersRes = await fetch(`${API_URL}/admin/production-sessions`);
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setProductionUsers(usersData.users);
      }

      // Load production conversations
      const conversationsRes = await fetch(`${API_URL}/admin/production-conversations`);
      if (conversationsRes.ok) {
        const conversationsData = await conversationsRes.json();
        setProductionConversations(conversationsData.conversations);
      }
    } catch (err) {
      console.error('Production data load error:', err);
    }
  }, [API_URL]);

  const loadUsersForManagement = useCallback(async () => {
    try {
      const usersRes = await fetch(`${API_URL}/admin/production-users`);
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersForManagement(usersData.users);
      }
    } catch (err) {
      console.error('Users management load error:', err);
    }
  }, [API_URL]);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      await Promise.all([
        loadDemoData(),
        loadProductionData(),
        loadUsersForManagement()
      ]);
    } catch (err) {
      setError('Failed to load admin data');
      console.error('Admin data load error:', err);
    } finally {
      setLoading(false);
    }
  }, [loadDemoData, loadProductionData, loadUsersForManagement]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const updateUserTier = async (userId: string, newTier: string) => {
    setUpdatingTier(userId);
    try {
      const response = await fetch(`${API_URL}/admin/update-user-tier`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, newTier }),
      });

      if (response.ok) {
        // Refresh the users list
        await loadUsersForManagement();
        // Also refresh production data to show updated tiers
        await loadProductionData();
      } else {
        console.error('Failed to update user tier');
      }
    } catch (err) {
      console.error('Error updating user tier:', err);
    } finally {
      setUpdatingTier(null);
    }
  };

  const formatDate = (dateString: string) => {
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
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{productionUsers.length}</div>
            <div className="text-gray-400 text-sm">Active Users</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{productionConversations.length}</div>
            <div className="text-gray-400 text-sm">Total Conversations</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">
              {productionConversations.length > 0 ? Math.round(productionConversations.length / productionUsers.length) : 0}
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
                      {productionConversations
                        .filter(conv => conv.user.id === user.userId)
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
            <div className="space-y-4">
              {productionConversations
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
          <div className="text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button
            onClick={loadAdminData}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
          >
            Refresh Data
          </button>
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
        </div>

        {/* Tab Content */}
        {activeTab === 'demo' && renderDemoTab()}
        {activeTab === 'production' && renderProductionTab()}
        {activeTab === 'users' && renderUsersTab()}
      </div>
    </div>
  );
} 