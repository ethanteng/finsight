"use client";
import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import PageMeta from '../../components/PageMeta';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';
import AnswerQualityPanel from '../../components/admin/AnswerQualityPanel';

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

interface UserFinancialData {
  profile: {
    text: string;
    lastUpdated: string | null;
  };
  institutions: Array<{
    name: string;
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      subtype: string;
      balance: number | null;
      lastSynced: string | null;
    }>;
  }>;
  accessTokens: number;
  totalAccounts: number;
  lastSync: number | null;
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
          isActive: boolean;
          subscriptionStatus: string;
          trialExpiresAt?: string | null;
          accessLevel: 'full' | 'none';
          upgradeRequired: boolean;
          subscriptionMessage: string;
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
  const [activeTab, setActiveTab] = useState<'production' | 'users' | 'market-news' | 'ai-tone'>('production');

  // Production data state
  const [productionUsers, setProductionUsers] = useState<ProductionUser[]>([]);
  const [productionConversations, setProductionConversations] = useState<ProductionConversation[]>([]);
  const [userFinancialData, setUserFinancialData] = useState<Record<string, UserFinancialData>>({});
  const [loadingFinancialData, setLoadingFinancialData] = useState<Record<string, boolean>>({});

  // User management state
  const [usersForManagement, setUsersForManagement] = useState<UserForManagement[]>([]);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const [revokingAccess, setRevokingAccess] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [refreshingUserSnapshot, setRefreshingUserSnapshot] = useState<string | null>(null);
  const [snapshotRefreshNotice, setSnapshotRefreshNotice] = useState<{
    userId: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Market news state
  const [marketNewsContexts, setMarketNewsContexts] = useState<Record<string, MarketNewsContext>>({});
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [refreshingContext, setRefreshingContext] = useState<string | null>(null);
  const [refreshingProduction, setRefreshingProduction] = useState(false);
  // Bumped so the answer-quality panel reloads with the rest of the tab.
  const [qualityRefreshToken, setQualityRefreshToken] = useState(0);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [refreshingAllContexts, setRefreshingAllContexts] = useState(false);

  // AI response tone state
  const [responseTone, setResponseTone] = useState<string>('');
  const [defaultResponseTone, setDefaultResponseTone] = useState<string>('');
  const [toneMeta, setToneMeta] = useState<{ isDefault: boolean; lastEditedBy: string | null; updatedAt: string | null }>({
    isDefault: true,
    lastEditedBy: null,
    updatedAt: null,
  });
  const [editingTone, setEditingTone] = useState(false);
  const [editingToneText, setEditingToneText] = useState<string>('');
  const [savingTone, setSavingTone] = useState(false);
  const [toneNotice, setToneNotice] = useState<{ ok: boolean; message: string } | null>(null);

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
      // Keep the answer-quality panel in step with the rest of the tab.
      setQualityRefreshToken((token) => token + 1);
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

  const loadUserFinancialData = async (userId: string) => {
    if (userFinancialData[userId]) {
      return; // Already loaded
    }

    setLoadingFinancialData(prev => ({ ...prev, [userId]: true }));

    try {
      const response = await fetch(`${API_URL}/admin/user-financial-data/${userId}`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setUserFinancialData(prev => ({ ...prev, [userId]: data }));
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        console.error('Failed to fetch financial data for user:', userId);
      }
    } catch (err) {
      console.error('Error fetching financial data for user:', userId, err);
    } finally {
      setLoadingFinancialData(prev => ({ ...prev, [userId]: false }));
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

  const loadResponseTone = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/admin/ai/response-tone`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setResponseTone(data.responseTone || '');
        setDefaultResponseTone(data.defaultResponseTone || '');
        setToneMeta({
          isDefault: !!data.isDefault,
          lastEditedBy: data.lastEditedBy ?? null,
          updatedAt: data.updatedAt ?? null,
        });
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        const data = await response.json().catch(() => ({}));
        setToneNotice({
          ok: false,
          message: data.error || `Failed to load response tone (HTTP ${response.status}).`,
        });
      }
    } catch (err) {
      console.error('Response tone load error:', err);
      setToneNotice({ ok: false, message: 'Failed to load response tone.' });
    }
  }, [API_URL]);

  const editResponseTone = () => {
    setEditingToneText(responseTone);
    setEditingTone(true);
    setToneNotice(null);
  };

  const cancelEditTone = () => {
    setEditingTone(false);
    setEditingToneText('');
  };

  const resetToneToDefault = () => {
    setEditingToneText(defaultResponseTone);
  };

  const saveResponseTone = async () => {
    if (!editingToneText.trim()) {
      setToneNotice({ ok: false, message: 'Tone guidance cannot be empty.' });
      return;
    }
    setSavingTone(true);
    setToneNotice(null);
    try {
      const response = await fetch(`${API_URL}/admin/ai/response-tone`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ responseTone: editingToneText })
      });
      if (response.ok) {
        setEditingTone(false);
        setEditingToneText('');
        setToneNotice({ ok: true, message: 'Response tone updated. New chats will use it right away.' });
        await loadResponseTone();
      } else if (response.status === 401 || response.status === 403) {
        setToneNotice({ ok: false, message: 'Authentication required for admin access.' });
      } else {
        const data = await response.json().catch(() => ({}));
        setToneNotice({ ok: false, message: data.error || 'Failed to update response tone.' });
      }
    } catch (err) {
      console.error('Response tone save error:', err);
      setToneNotice({ ok: false, message: 'Failed to update response tone.' });
    } finally {
      setSavingTone(false);
    }
  };

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      await Promise.all([
        loadProductionData(),
        loadUsersForManagement(),
        loadMarketNewsContexts(),
        loadResponseTone()
      ]);
    } catch (err) {
      setError('Failed to load admin data');
      console.error('Admin data load error:', err);
    } finally {
      setLoading(false);
    }
  }, [loadProductionData, loadUsersForManagement, loadMarketNewsContexts, loadResponseTone]);

  const refreshAllData = async () => {
    setRefreshingAll(true);
    setError('');

    try {
      console.log('Starting refresh of all admin data...');
      await Promise.all([
        loadProductionData(),
        loadUsersForManagement(),
        loadMarketNewsContexts(),
        loadResponseTone()
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

  const revokeUserAccess = async (userId: string) => {
    setRevokingAccess(userId);
    try {
      const response = await fetch(`${API_URL}/admin/revoke-user-access/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        // Refresh the users list
        await loadUsersForManagement();
        // Also refresh production data
        await loadProductionData();
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        console.error('Failed to revoke user access');
      }
    } catch (err) {
      console.error('Error revoking user access:', err);
    } finally {
      setRevokingAccess(null);
    }
  };

  const restoreUserAccess = async (userId: string) => {
    setRevokingAccess(userId);
    try {
      const response = await fetch(`${API_URL}/admin/restore-user-access/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        // Refresh the users list
        await loadUsersForManagement();
        // Also refresh production data
        await loadProductionData();
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        console.error('Failed to restore user access');
      }
    } catch (err) {
      console.error('Error restoring user access:', err);
    } finally {
      setRevokingAccess(null);
    }
  };

  const deleteUserAccount = async (userId: string) => {
    setDeletingAccount(userId);
    try {
      const response = await fetch(`${API_URL}/admin/delete-user-account/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        // Refresh the users list
        await loadUsersForManagement();
        // Also refresh production data
        await loadProductionData();
        setShowDeleteConfirm(null);
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        console.error('Failed to delete user account');
      }
    } catch (err) {
      console.error('Error deleting user account:', err);
    } finally {
      setDeletingAccount(null);
    }
  };

  const refreshUserAskLincSnapshot = async (userId: string) => {
    setRefreshingUserSnapshot(userId);
    setSnapshotRefreshNotice(null);
    try {
      const response = await fetch(`${API_URL}/admin/refresh-user-snapshot/${userId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const n = typeof data.accountCount === 'number' ? data.accountCount : '—';
        setSnapshotRefreshNotice({
          userId,
          ok: true,
          message: `Snapshot rebuilt (${n} accounts in cache).`,
        });
      } else if (response.status === 401 || response.status === 403) {
        setError('Authentication required for admin access');
      } else {
        setSnapshotRefreshNotice({
          userId,
          ok: false,
          message: typeof data.error === 'string' ? data.error : 'Refresh failed',
        });
      }
    } catch (err) {
      console.error('Error refreshing user snapshot:', err);
      setSnapshotRefreshNotice({
        userId,
        ok: false,
        message: 'Network error',
      });
    } finally {
      setRefreshingUserSnapshot(null);
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

  const getQuestionCategories = (conversations: ProductionConversation[] | undefined) => {
    const categories: { [key: string]: number } = {};

    if (!conversations) return categories;

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
            <div className="text-2xl font-semibold text-[#397052]">{productionUsers.length}</div>
            <div className="text-gray-400 text-sm">Active Users</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-semibold text-[#397052]">
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
            <div className="text-2xl font-semibold text-[#397052]">
              {productionConversations.filter(conv => conv.user).length > 0 ? Math.round(productionConversations.filter(conv => conv.user).length / productionUsers.length) : 0}
            </div>
            <div className="text-gray-400 text-sm">Avg Conversations/User</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-semibold text-[#397052]">
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
                <div key={category} className="rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-3">
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

        <AnswerQualityPanel
          apiUrl={API_URL}
          getAuthHeaders={getAuthHeaders}
          refreshToken={qualityRefreshToken}
        />

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
                        Created: {formatDate(user.createdAt)} • Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {user.conversationCount} Q&A
                      </div>
                    </div>
                  </div>

                  {/* Show expanded view when clicked */}
                  {selectedSession === user.userId && (
                    <div className="mt-4 space-y-4">
                      {/* Financial Profile Section */}
                      <div className="bg-gray-600 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-lg font-semibold text-white">Financial Profile</h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadUserFinancialData(user.userId);
                            }}
                            disabled={loadingFinancialData[user.userId]}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                          >
                            {loadingFinancialData[user.userId] ? 'Loading...' : 'Load Financial Data'}
                          </button>
                        </div>

                        {userFinancialData[user.userId] ? (
                          <div className="space-y-3">
                            <div className="bg-gray-700 rounded p-3">
                              <div className="text-sm font-medium text-blue-300 mb-2">Profile Summary</div>
                              <div className="text-sm text-gray-300 mb-2">
                                {userFinancialData[user.userId].profile.text || 'No profile available'}
                              </div>
                              {userFinancialData[user.userId].profile.lastUpdated && (
                                <div className="text-xs text-gray-500">
                                  Last updated: {formatDate(userFinancialData[user.userId].profile.lastUpdated!)}
                                </div>
                              )}
                            </div>

                            <div className="bg-gray-700 rounded p-3">
                              <div className="text-sm font-medium text-green-300 mb-2">Linked Financial Institutions</div>
                              <div className="text-sm text-gray-400 mb-2">
                                {userFinancialData[user.userId].accessTokens} access tokens • {userFinancialData[user.userId].totalAccounts} total accounts
                              </div>

                              {userFinancialData[user.userId].institutions.length > 0 ? (
                                <div className="space-y-2">
                                  {userFinancialData[user.userId].institutions.map((institution, idx) => (
                                    <div key={idx} className="bg-gray-800 rounded p-2">
                                      <div className="font-medium text-white text-sm mb-1">{institution.name}</div>
                                      <div className="space-y-1">
                                        {institution.accounts.map((account) => (
                                          <div key={account.id} className="text-xs text-gray-400">
                                            <span>{account.name} ({account.type}/{account.subtype})</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 italic">No financial institutions linked</div>
                              )}

                              {userFinancialData[user.userId].lastSync && (
                                <div className="text-xs text-gray-500 mt-2">
                                  Last sync: {formatDate(new Date(userFinancialData[user.userId].lastSync!).toISOString())}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">
                            Click "Load Financial Data" to view user's financial profile and linked institutions
                          </div>
                        )}
                      </div>

                      {/* Conversations Section */}
                      <div className="bg-gray-600 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Conversations</h3>

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
                            <div key={conv.id} className="bg-gray-700 rounded p-3 ml-4">
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
      <div className="space-y-6">
        {/* Header with refresh button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Access operations</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em] text-[#102319]">User management</h2>
          </div>
          <button
            onClick={refreshUsersData}
            disabled={refreshingUsers}
            className={`admin-button-primary ${
              refreshingUsers
                ? 'cursor-not-allowed opacity-55'
                : ''
            }`}
            title="Refresh user management data only"
          >
            {refreshingUsers ? 'Refreshing...' : 'Refresh User Data'}
          </button>
        </div>

        {/* User Status Summary */}
        <section className="admin-panel p-5 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-[#102319]">User status summary</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="admin-stat-cell">
              <div className="text-2xl font-semibold text-[#397052]">{usersForManagement?.filter(u => u.accessLevel === 'full' && u.subscriptionStatus === 'active').length || 0}</div>
              <div className="mt-1 text-xs font-medium text-[#66736b]">Active subscriptions</div>
            </div>
            <div className="admin-stat-cell">
              <div className="text-2xl font-semibold text-[#397052]">{usersForManagement?.filter(u => u.accessLevel === 'full' && u.subscriptionStatus === 'trialing').length || 0}</div>
              <div className="mt-1 text-xs font-medium text-[#66736b]">Active trials</div>
            </div>
            <div className="admin-stat-cell">
              <div className="text-2xl font-semibold text-[#397052]">{usersForManagement?.filter(u => u.accessLevel === 'full' && !['active', 'trialing'].includes(u.subscriptionStatus)).length || 0}</div>
              <div className="mt-1 text-xs font-medium text-[#66736b]">Admin created</div>
            </div>
            <div className="admin-stat-cell">
              <div className="text-2xl font-semibold text-[#76510f]">{usersForManagement?.filter(u =>
                (['active', 'trialing'].includes(u.subscriptionStatus) && u.subscriptionMessage.includes('account setup incomplete')) ||
                (u.subscriptionStatus === 'incomplete' && u.subscriptionMessage.includes('setup incomplete'))
              ).length || 0}</div>
              <div className="mt-1 text-xs font-medium text-[#66736b]">Setup required</div>
            </div>
            <div className="admin-stat-cell">
              <div className="text-2xl font-semibold text-[#8b3027]">{usersForManagement?.filter(u => !u.isActive || (u.accessLevel === 'none' && !u.subscriptionMessage.includes('account setup incomplete'))).length || 0}</div>
              <div className="mt-1 text-xs font-medium text-[#66736b]">No access</div>
            </div>
          </div>

          {usersForManagement && usersForManagement.filter(u =>
            (['active', 'trialing'].includes(u.subscriptionStatus) && u.subscriptionMessage.includes('account setup incomplete')) ||
            (u.subscriptionStatus === 'incomplete' && u.subscriptionMessage.includes('setup incomplete'))
          ).length > 0 && (
            <div className="mt-4 rounded-xl border border-[#9d6a16]/20 bg-[#f4ead0] p-4">
              <h4 className="mb-2 font-semibold text-[#76510f]">
                Setup required ({usersForManagement.filter(u =>
                  (['active', 'trialing'].includes(u.subscriptionStatus) && u.subscriptionMessage.includes('account setup incomplete')) ||
                  (u.subscriptionStatus === 'incomplete' && u.subscriptionMessage.includes('setup incomplete'))
                ).length} users)
              </h4>
              <div className="text-sm text-gray-300">
                These users need to complete setup to access Ask Linc:
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {usersForManagement.filter(u =>
                  (['active', 'trialing'].includes(u.subscriptionStatus) && u.subscriptionMessage.includes('account setup incomplete')) ||
                  (u.subscriptionStatus === 'incomplete' && u.subscriptionMessage.includes('setup incomplete'))
                ).map(user => user.email).join(', ')}
              </div>
            </div>
          )}
        </section>

        <section className="admin-panel p-4 sm:p-5">
          <div className="space-y-3">
            {usersForManagement?.map((user) => (
              <article key={user.id} className="admin-row p-4 sm:p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="break-all font-semibold text-[#102319]">
                        {user.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          !user.isActive
                            ? 'border-[#b84a3d]/20 bg-[#f8e8e3] text-[#8b3027]'
                            : user.accessLevel === 'full'
                              ? ['active', 'trialing'].includes(user.subscriptionStatus)
                                ? 'border-[#397052]/18 bg-[#c9f2df]/60 text-[#285c43]'
                                : 'border-[#5d7190]/18 bg-[#e6edf8] text-[#4b617e]'
                              : (['active', 'trialing'].includes(user.subscriptionStatus) && user.subscriptionMessage.includes('account setup incomplete')) ||
                                (user.subscriptionStatus === 'incomplete' && user.subscriptionMessage.includes('setup incomplete'))
                                ? 'border-[#9d6a16]/20 bg-[#f4ead0] text-[#76510f]'
                                : 'border-[#b84a3d]/20 bg-[#f8e8e3] text-[#8b3027]'
                        }`}>
                          {!user.isActive
                            ? 'Admin Revoked'
                            : user.accessLevel === 'full'
                              ? user.subscriptionStatus === 'active'
                                ? 'Active'
                                : user.subscriptionStatus === 'trialing'
                                  ? 'Trialing'
                                  : 'Admin Created'
                              : (['active', 'trialing'].includes(user.subscriptionStatus) && user.subscriptionMessage.includes('account setup incomplete')) ||
                                (user.subscriptionStatus === 'incomplete' && user.subscriptionMessage.includes('setup incomplete'))
                                ? 'Setup Required'
                                : 'Subscription Expired'}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      Conversations: {user._count.conversations} • Created: {formatDate(user.createdAt)}
                      {user.lastLoginAt && ` • Last login: ${formatDate(user.lastLoginAt)}`}
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      Subscription: {user.subscriptionStatus} • Access: {user.accessLevel}
                      {user.upgradeRequired && <span className="text-yellow-400"> • Upgrade Required</span>}
                    </div>
                    {user.subscriptionStatus === 'trialing' && (
                      <div className="mb-2 text-xs font-medium text-[#397052]">
                        Trial ends: {user.trialExpiresAt ? formatDate(user.trialExpiresAt) : 'Date unavailable'}
                      </div>
                    )}
                    {user.subscriptionMessage && (
                      <div className="mt-3 rounded-lg border border-[#102319]/8 bg-[#fffdf5] px-3 py-2 text-xs leading-5 text-[#5e6b63]">
                        {user.subscriptionMessage}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5 lg:min-w-[220px] lg:items-end">
                    {/* Tier Management */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">Tier:</span>
                      <select
                        value={user.tier}
                        onChange={(e) => updateUserTier(user.id, e.target.value)}
                        disabled={updatingTier === user.id}
                        className="rounded-lg border border-[#102319]/15 bg-[#fffdf5] px-3 py-1.5 text-sm text-[#102319] focus:outline-none"
                      >
                        <option value="starter">Starter</option>
                        <option value="standard">Standard</option>
                        <option value="premium">Premium</option>
                      </select>
                      {updatingTier === user.id && (
                        <div className="text-xs text-yellow-400">Updating...</div>
                      )}
                    </div>

                    {/* Ask Linc: rebuild cached financial snapshot (Plaid + SnapTrade) */}
                    <div className="flex flex-col gap-1 lg:items-end">
                      <button
                        type="button"
                        onClick={() => refreshUserAskLincSnapshot(user.id)}
                        disabled={refreshingUserSnapshot === user.id}
                        className="admin-button-secondary text-xs disabled:cursor-not-allowed disabled:opacity-55"
                        title="Recompute FinancialSummarySnapshot and finances summary so Ask Linc matches linked accounts (e.g. after SnapTrade)."
                      >
                        {refreshingUserSnapshot === user.id ? 'Rebuilding…' : 'Rebuild Ask Linc cache'}
                      </button>
                      {snapshotRefreshNotice?.userId === user.id && (
                        <div
                          className={`text-xs max-w-[220px] text-right ${
                            snapshotRefreshNotice.ok ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {snapshotRefreshNotice.message}
                        </div>
                      )}
                    </div>

                    {/* Access Management */}
                    <div className="flex items-center gap-2">
                      {user.isActive ? (
                        <button
                          onClick={() => revokeUserAccess(user.id)}
                          disabled={revokingAccess === user.id}
                          className="admin-button-danger-subtle text-xs disabled:cursor-not-allowed disabled:opacity-55"
                          title="Revoke user access (prevent login)"
                        >
                          {revokingAccess === user.id ? 'Revoking...' : 'Revoke Access'}
                        </button>
                      ) : (
                        <button
                          onClick={() => restoreUserAccess(user.id)}
                          disabled={revokingAccess === user.id}
                          className="admin-button-primary text-xs disabled:cursor-not-allowed disabled:opacity-55"
                          title="Restore user access (allow login)"
                        >
                          {revokingAccess === user.id ? 'Restoring...' : 'Restore Access'}
                        </button>
                      )}
                    </div>

                    {/* Account Deletion */}
                    <button
                      onClick={() => setShowDeleteConfirm(user.id)}
                      disabled={deletingAccount === user.id}
                      className="admin-button-danger text-xs disabled:cursor-not-allowed disabled:opacity-55"
                      title="Delete user account completely (including login/email)"
                    >
                      {deletingAccount === user.id ? 'Deleting...' : 'Delete Account'}
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm === user.id && (
                  <div className="mt-4 rounded-xl border border-[#b84a3d]/22 bg-[#f8e8e3] p-4">
                    <div className="text-red-200 text-sm mb-3">
                      <strong>⚠️ Warning:</strong> This will permanently delete the user account for <strong>{user.email}</strong>, including:
                    </div>
                    <ul className="text-red-200 text-sm mb-4 ml-4 space-y-1">
                      <li>• All conversations and financial data</li>
                      <li>• Linked financial accounts and transactions</li>
                      <li>• User profile and settings</li>
                      <li>• Login credentials and email address</li>
                    </ul>
                    <div className="text-red-200 text-sm mb-4">
                      <strong>This action cannot be undone.</strong> The user will need to create a new account to use the service again.
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => deleteUserAccount(user.id)}
                        disabled={deletingAccount === user.id}
                        className="admin-button-danger text-sm disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {deletingAccount === user.id ? 'Deleting...' : 'Yes, Delete Account'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        disabled={deletingAccount === user.id}
                        className="admin-button-secondary text-sm disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const renderAiToneTab = () => {
    const isCustomized = !toneMeta.isDefault;

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">AI Response Tone</h2>
          {!editingTone && (
            <button
              onClick={editResponseTone}
              className="px-3 py-1 rounded text-sm bg-yellow-600 text-white hover:bg-yellow-700"
            >
              Edit
            </button>
          )}
        </div>

        <p className="text-sm text-gray-400">
          This guidance controls the voice of every user-facing AI answer. It is injected into the
          system prompt for both the OpenAI and Claude pipelines. Write it as a list of short
          bullet points. Keep it professional and accurate — adjust how formal, friendly, or
          concise the assistant sounds. Changes apply to new chats immediately.
        </p>

        {toneNotice && (
          <div
            className={`px-4 py-3 rounded text-sm ${
              toneNotice.ok
                ? 'bg-green-900 border border-green-700 text-green-100'
                : 'bg-red-900 border border-red-700 text-red-100'
            }`}
          >
            {toneNotice.message}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6">
          {editingTone ? (
            <div>
              <textarea
                value={editingToneText}
                onChange={(e) => setEditingToneText(e.target.value)}
                className="w-full h-72 p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
                placeholder="Enter tone & voice guidance as bullet points..."
              />
              <div className="mt-3 flex space-x-2">
                <button
                  onClick={saveResponseTone}
                  disabled={savingTone}
                  className={`px-4 py-2 rounded text-white ${
                    savingTone ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {savingTone ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={resetToneToDefault}
                  disabled={savingTone}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reset to Default
                </button>
                <button
                  onClick={cancelEditTone}
                  disabled={savingTone}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-gray-400 mb-3">
                Status:{' '}
                <span className={isCustomized ? 'text-yellow-400' : 'text-gray-300'}>
                  {isCustomized ? 'Custom' : 'Default'}
                </span>
                {toneMeta.lastEditedBy && (
                  <span className="ml-4">Last edited by: {toneMeta.lastEditedBy}</span>
                )}
                {toneMeta.updatedAt && (
                  <span className="ml-4">Updated: {formatDate(toneMeta.updatedAt)}</span>
                )}
              </div>
              <pre className="text-gray-300 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto bg-gray-700 p-4 rounded font-mono">
                    {responseTone || defaultResponseTone || 'No tone configured.'}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMarketNewsTab = () => {
    const tiers = ['starter', 'standard', 'premium'];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Editorial context</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em] text-[#102319]">Market news context</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66736b]">Review the market evidence bundle provided to each subscription tier.</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => refreshAllMarketContexts()}
              disabled={refreshingAllContexts}
              className={`admin-button-primary ${
                refreshingAllContexts
                  ? 'cursor-not-allowed opacity-55'
                  : ''
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
              <section key={tier} className="admin-panel overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[#102319]/10 bg-[#fffdf5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#49725a]">Subscription context</p>
                    <h3 className="mt-1 text-lg font-semibold capitalize text-[#102319]">{tier} tier</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => refreshMarketContext(tier)}
                      disabled={isRefreshing}
                      className={`admin-button-primary text-sm ${
                        isRefreshing
                          ? 'cursor-not-allowed opacity-55'
                          : ''
                      }`}
                    >
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      onClick={() => editMarketContext(tier)}
                      disabled={isEditing}
                      className={`admin-button-secondary text-sm ${
                        isEditing
                          ? 'cursor-not-allowed opacity-55'
                          : ''
                      }`}
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                {isEditing ? (
                  <div>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="h-72 w-full rounded-xl border border-[#102319]/15 bg-[#fffdf5] p-4 font-mono text-sm leading-6 text-[#102319] focus:outline-none"
                      placeholder="Enter market context..."
                    />
                    <div className="mt-3 flex space-x-2">
                      <button
                        onClick={() => saveMarketContext(tier)}
                        className="admin-button-primary"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="admin-button-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[#102319]/10 bg-[#e9eee5] px-4 py-4 text-sm text-[#56635b] sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#49725a]">Last updated</span>
                        <span className="mt-1 block font-medium text-[#102319]">{formatDate(context?.lastUpdate || '')}</span>
                      </div>
                      {context?.dataSources && context.dataSources.length > 0 && (
                        <div className="sm:max-w-[60%] sm:text-right">
                          <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#49725a]">Sources</span>
                          <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
                            {context.dataSources.map((source) => (
                              <span key={source} className="rounded-full border border-[#102319]/10 bg-[#fffdf5] px-2.5 py-1 text-xs font-medium text-[#486657]">{source}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {context?.contextText ? (
                      <article className="market-news-article rounded-[20px] border border-[#102319]/10 bg-[#fffdf5] px-5 py-4 shadow-[0_14px_38px_rgba(16,35,25,.045)] sm:px-7 sm:py-6">
                        <MarkdownRenderer>{context.contextText}</MarkdownRenderer>
                      </article>
                    ) : (
                      <div className="rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-5 text-sm italic text-[#66736b]">
                        No market context available for this tier.
                      </div>
                    )}

                    {context?.keyEvents && context.keyEvents.length > 0 && (
                      <div className="mt-5">
                        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Key events</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {context.keyEvents.map((event, index) => (
                            <div key={index} className="flex gap-3 rounded-xl border border-[#102319]/10 bg-[#fffdf5] px-4 py-3 text-sm leading-6 text-[#486657]">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#397052]" aria-hidden="true" />
                              <span>{event}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="authenticated-site min-h-screen">
        <AuthenticatedPageHeader activePage="admin" eyebrow="Internal operations" title="Platform administration" />
        <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6">
          <div className="flex items-center gap-3 rounded-[20px] border border-[#102319]/12 bg-[#fffdf5] p-6 text-sm text-[#5e6b63] shadow-[0_18px_45px_rgba(16,35,25,.055)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#102319]/20 border-t-[#102319]" />
            Loading admin data…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="authenticated-site min-h-screen">
        <AuthenticatedPageHeader activePage="admin" eyebrow="Internal operations" title="Platform administration" />
        <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-6">
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
    <>
      <PageMeta
        title="Platform Administration | Ask Linc System Management"
        description="Administrative control center for Ask Linc. Monitor user activity, manage system performance, oversee platform operations, and access comprehensive administrative tools for platform management."
      />
      <div className="authenticated-site min-h-screen">
        <AuthenticatedPageHeader activePage="admin" eyebrow="Internal operations" title="Platform administration" />
        <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-6 md:py-12">
        <div className="authenticated-intro mb-10">
          <h2>Monitor the system without the visual noise.</h2>
          <p>Review product activity, users, market context, and response guidance from one operational workspace.</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-[#102319]/10 bg-[#e9eee5] p-1">
          <button
            onClick={() => setActiveTab('production')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'production'
                ? 'bg-[#102319] text-white shadow-sm'
                : 'text-[#5e6b63] hover:bg-white/65 hover:text-[#102319]'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-[#102319] text-white shadow-sm'
                : 'text-[#5e6b63] hover:bg-white/65 hover:text-[#102319]'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('market-news')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'market-news'
                ? 'bg-[#102319] text-white shadow-sm'
                : 'text-[#5e6b63] hover:bg-white/65 hover:text-[#102319]'
            }`}
          >
            Market News
          </button>
          <button
            onClick={() => setActiveTab('ai-tone')}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'ai-tone'
                ? 'bg-[#102319] text-white shadow-sm'
                : 'text-[#5e6b63] hover:bg-white/65 hover:text-[#102319]'
            }`}
          >
            AI Tone
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'production' && renderProductionTab()}
        {activeTab === 'users' && renderUsersTab()}
        {activeTab === 'market-news' && renderMarketNewsTab()}
        {activeTab === 'ai-tone' && renderAiToneTab()}
        </div>
      </div>
    </>
  );
}
