"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DemoSession {
  sessionId: string;
  conversationCount: number;
  firstQuestion: string;
  lastActivity: string;
  userAgent: string;
}

interface ProductionUser {
  id: string;
  email: string;
  tier: string;
  subscriptionStatus: string;
  accessLevel: string;
  message: string;
}

export default function AdminContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [demoSessions, setDemoSessions] = useState<DemoSession[]>([]);
  const [productionUsers, setProductionUsers] = useState<ProductionUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const token = localStorage.getItem('auth_token');

        if (!token) {
          router.push('/login');
          return;
        }

        const res = await fetch(`${API_URL}/admin/check-access`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setIsAdmin(true);
          setUserEmail(data.user.email);
        } else {
          router.push('/login?message=' + encodeURIComponent('Access denied. Admin privileges required.'));
        }
      } catch (error) {
        console.error('Admin access check failed:', error);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [router, API_URL]);

  const loadDemoSessions = async () => {
    try {
      setLoadingData(true);
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/admin/demo-sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setDemoSessions(data.sessions || []);
      } else {
        setError('Failed to load demo sessions');
      }
    } catch (error) {
      console.error('Error loading demo sessions:', error);
      setError('Failed to load demo sessions');
    } finally {
      setLoadingData(false);
    }
  };

  const loadProductionUsers = async () => {
    try {
      setLoadingData(true);
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/admin/production-users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setProductionUsers(data.users || []);
      } else {
        setError('Failed to load production users');
      }
    } catch (error) {
      console.error('Error loading production users:', error);
      setError('Failed to load production users');
    } finally {
      setLoadingData(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <span className="px-3 py-1 bg-red-500 text-red-900 rounded-full text-xs font-medium">
              ADMIN ONLY
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {userEmail && (
              <span className="text-gray-400 text-sm">
                {userEmail}
              </span>
            )}
            <Link
              href="/app"
              className="text-blue-300 hover:text-blue-200 text-sm transition-colors"
            >
              Back to App
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Admin Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg">
            <div className="text-red-400">⚠️ {error}</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Demo Sessions */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Demo Sessions</h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-400">
                Total: {demoSessions.length}
              </div>
              <button 
                onClick={loadDemoSessions}
                disabled={loadingData}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {loadingData ? 'Loading...' : 'Load Demo Sessions'}
              </button>
              {demoSessions.length > 0 && (
                <div className="text-xs text-gray-400">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Production Users */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Production Users</h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-400">
                Total: {productionUsers.length}
              </div>
              <button 
                onClick={loadProductionUsers}
                disabled={loadingData}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {loadingData ? 'Loading...' : 'Load Production Users'}
              </button>
              {productionUsers.length > 0 && (
                <div className="text-xs text-gray-400">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Database:</span>
                <span className="text-green-400">Online</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">API:</span>
                <span className="text-green-400">Healthy</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Admin Access:</span>
                <span className="text-green-400">Granted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Data Display */}
        {demoSessions.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Demo Sessions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2">Session ID</th>
                    <th className="text-left p-2">Conversations</th>
                    <th className="text-left p-2">First Question</th>
                    <th className="text-left p-2">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {demoSessions.map((session) => (
                    <tr key={session.sessionId} className="border-b border-gray-700">
                      <td className="p-2 text-xs font-mono">{session.sessionId.substring(0, 8)}...</td>
                      <td className="p-2">{session.conversationCount}</td>
                      <td className="p-2 text-xs">{session.firstQuestion.substring(0, 50)}...</td>
                      <td className="p-2 text-xs">{new Date(session.lastActivity).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {productionUsers.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Production Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Tier</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Access Level</th>
                  </tr>
                </thead>
                <tbody>
                  {productionUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gray-700">
                      <td className="p-2">{user.email}</td>
                      <td className="p-2">{user.tier}</td>
                      <td className="p-2">{user.subscriptionStatus}</td>
                      <td className="p-2">{user.accessLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button 
              onClick={loadDemoSessions}
              disabled={loadingData}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Refresh Demo Data
            </button>
            <button 
              onClick={loadProductionUsers}
              disabled={loadingData}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Refresh User Data
            </button>
            <button 
              onClick={() => {
                setDemoSessions([]);
                setProductionUsers([]);
                setError('');
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Clear Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

