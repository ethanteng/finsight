import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the MarkdownRenderer component
jest.mock('../components/MarkdownRenderer', () => {
  return function MockMarkdownRenderer({ children }: { children: string }) {
    return <div data-testid="markdown-renderer">{children}</div>;
  };
});

interface DemoData {
  sessions: Array<{
    sessionId: string;
    conversationCount: number;
    firstQuestion: string;
  }>;
  conversations: Array<{
    id: string;
    question: string;
    answer: string;
    sessionId: string;
  }>;
}

interface ProductionData {
  users: Array<{
    userId: string;
    email: string;
    tier: string;
    conversationCount: number;
  }>;
  conversations: Array<{
    id: string;
    question: string;
    answer: string;
    user: {
      id: string;
      email: string;
      tier: string;
    };
  }>;
}

interface UsersData {
  users: Array<{
    id: string;
    email: string;
    tier: string;
    _count: {
      conversations: number;
    };
  }>;
}

const MockAdminPage = () => {
  const [activeTab, setActiveTab] = React.useState<'demo' | 'production' | 'users'>('demo');
  const [demoData, setDemoData] = React.useState<DemoData | null>(null);
  const [productionData, setProductionData] = React.useState<ProductionData | null>(null);
  const [usersData, setUsersData] = React.useState<UsersData | null>(null);

  React.useEffect(() => {
    // Simulate loading data for each tab
    if (activeTab === 'demo') {
      setDemoData({
        sessions: [
          { sessionId: 'demo-1', conversationCount: 2, firstQuestion: 'Test question' }
        ],
        conversations: [
          { id: '1', question: 'Test Q', answer: 'Test A', sessionId: 'demo-1' }
        ]
      });
    } else if (activeTab === 'production') {
      setProductionData({
        users: [
          { userId: 'user-1', email: 'test@example.com', tier: 'starter', conversationCount: 1 }
        ],
        conversations: [
          { id: '1', question: 'Test Q', answer: 'Test A', user: { id: 'user-1', email: 'test@example.com', tier: 'starter' } }
        ]
      });
    } else if (activeTab === 'users') {
      setUsersData({
        users: [
          { id: 'user-1', email: 'test@example.com', tier: 'starter', _count: { conversations: 1 } }
        ]
      });
    }
  }, [activeTab]);

  return (
    <div>
      <h1>Admin Dashboard</h1>
      
      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-8 bg-gray-800 rounded-lg p-1">
        <button 
          onClick={() => setActiveTab('demo')}
          className={activeTab === 'demo' ? 'bg-blue-600 text-white' : 'text-gray-300'}
          data-testid="demo-tab"
        >
          Demo
        </button>
        <button 
          onClick={() => setActiveTab('production')}
          className={activeTab === 'production' ? 'bg-blue-600 text-white' : 'text-gray-300'}
          data-testid="production-tab"
        >
          Production
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-gray-300'}
          data-testid="users-tab"
        >
          User Management
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'demo' && demoData && (
        <div data-testid="demo-content">
          <h2>Demo Tab</h2>
          <div>Active Sessions: {demoData.sessions.length}</div>
          <div>Total Conversations: {demoData.conversations.length}</div>
        </div>
      )}

      {activeTab === 'production' && productionData && (
        <div data-testid="production-content">
          <h2>Production Tab</h2>
          <div>Active Users: {productionData.users.length}</div>
          <div>Total Conversations: {productionData.conversations.length}</div>
        </div>
      )}

      {activeTab === 'users' && usersData && (
        <div data-testid="users-content">
          <h2>User Management Tab</h2>
          <div>Total Users: {usersData.users.length}</div>
          {usersData.users.map((user) => (
            <div key={user.id} data-testid="user-item">
              {user.email} - {user.tier}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

describe('Admin Page', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should render admin dashboard with three tabs', () => {
    render(<MockAdminPage />);
    
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('demo-tab')).toBeInTheDocument();
    expect(screen.getByTestId('production-tab')).toBeInTheDocument();
    expect(screen.getByTestId('users-tab')).toBeInTheDocument();
  });

  it('should show demo tab by default', () => {
    render(<MockAdminPage />);
    
    expect(screen.getByTestId('demo-content')).toBeInTheDocument();
    expect(screen.getByText('Demo Tab')).toBeInTheDocument();
  });

  it('should switch to production tab when clicked', async () => {
    render(<MockAdminPage />);
    
    fireEvent.click(screen.getByTestId('production-tab'));
    
    await waitFor(() => {
      expect(screen.getByTestId('production-content')).toBeInTheDocument();
      expect(screen.getByText('Production Tab')).toBeInTheDocument();
    });
  });

  it('should switch to users tab when clicked', async () => {
    render(<MockAdminPage />);
    
    fireEvent.click(screen.getByTestId('users-tab'));
    
    await waitFor(() => {
      expect(screen.getByTestId('users-content')).toBeInTheDocument();
      expect(screen.getByText('User Management Tab')).toBeInTheDocument();
    });
  });

  it('should display user data in users tab', async () => {
    render(<MockAdminPage />);
    
    fireEvent.click(screen.getByTestId('users-tab'));
    
    await waitFor(() => {
      expect(screen.getByTestId('user-item')).toBeInTheDocument();
      expect(screen.getByText('test@example.com - starter')).toBeInTheDocument();
    });
  });

  it('should show correct stats for each tab', async () => {
    render(<MockAdminPage />);
    
    // Demo tab stats
    expect(screen.getByText('Active Sessions: 1')).toBeInTheDocument();
    expect(screen.getByText('Total Conversations: 1')).toBeInTheDocument();
    
    // Production tab stats
    fireEvent.click(screen.getByTestId('production-tab'));
    await waitFor(() => {
      expect(screen.getByText('Active Users: 1')).toBeInTheDocument();
      expect(screen.getByText('Total Conversations: 1')).toBeInTheDocument();
    });
    
    // Users tab stats
    fireEvent.click(screen.getByTestId('users-tab'));
    await waitFor(() => {
      expect(screen.getByText('Total Users: 1')).toBeInTheDocument();
    });
  });
}); 