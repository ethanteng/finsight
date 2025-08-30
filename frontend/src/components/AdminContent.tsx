"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
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
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <span className="text-gray-400">Plaid:</span>
                <span className="text-green-400">Connected</span>
              </div>
            </div>
          </div>

          {/* User Management */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">User Management</h3>
            <div className="space-y-3">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors">
                View All Users
              </button>
              <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors">
                User Analytics
              </button>
            </div>
          </div>

          {/* System Monitoring */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">System Monitoring</h3>
            <div className="space-y-3">
              <button className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Performance Metrics
              </button>
              <button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Error Logs
              </button>
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Data Management</h3>
            <div className="space-y-3">
              <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Backup Database
              </button>
              <button className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Clear Test Data
              </button>
            </div>
          </div>

          {/* Security */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Security</h3>
            <div className="space-y-3">
              <button className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Access Logs
              </button>
              <button className="w-full bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Security Settings
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Notifications</h3>
            <div className="space-y-3">
              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Send Announcement
              </button>
              <button className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors">
                Notification Settings
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors">
              Restart Services
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors">
              Update System
            </button>
            <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors">
              Maintenance Mode
            </button>
            <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors">
              Emergency Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

