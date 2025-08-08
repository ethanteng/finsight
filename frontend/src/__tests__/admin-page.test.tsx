import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminPage from '../app/admin/page';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.localStorage = localStorageMock as Storage;

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

describe('AdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-token');
  });

  it('should render all tabs including Market News', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], conversations: [], users: [] })
    });

    render(<AdminPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Market News')).toBeInTheDocument();
  });

  it('should switch to Market News tab when clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], conversations: [], users: [] })
    });

    render(<AdminPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    
    const marketNewsTab = screen.getByText('Market News');
    fireEvent.click(marketNewsTab);
    
    await waitFor(() => {
      expect(screen.getByText('Market News Context')).toBeInTheDocument();
    });
  });

  it('should display market context for each tier', async () => {
    // Mock successful responses for market news contexts
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessions: [], conversations: [], users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Test context', dataSources: ['fred'], keyEvents: ['event1'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'starter' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Standard context', dataSources: ['fred', 'brave'], keyEvents: ['event1', 'event2'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'standard' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Premium context', dataSources: ['finnhub'], keyEvents: ['event1', 'event2', 'event3'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'premium' }) });

    render(<AdminPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    
    const marketNewsTab = screen.getByText('Market News');
    fireEvent.click(marketNewsTab);
    
    await waitFor(() => {
      expect(screen.getByText('starter Tier')).toBeInTheDocument();
      expect(screen.getByText('standard Tier')).toBeInTheDocument();
      expect(screen.getByText('premium Tier')).toBeInTheDocument();
    });
  });

  it('should show refresh and edit buttons for each tier', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessions: [], conversations: [], users: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Test context', dataSources: ['fred'], keyEvents: ['event1'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'starter' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Standard context', dataSources: ['fred', 'brave'], keyEvents: ['event1', 'event2'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'standard' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ contextText: 'Premium context', dataSources: ['finnhub'], keyEvents: ['event1', 'event2', 'event3'], lastUpdate: '2025-08-07T01:00:00Z', tier: 'premium' }) });

    render(<AdminPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    
    const marketNewsTab = screen.getByText('Market News');
    fireEvent.click(marketNewsTab);
    
    await waitFor(() => {
      expect(screen.getAllByText('Refresh')).toHaveLength(3);
      expect(screen.getAllByText('Edit')).toHaveLength(3);
    });
  });

  it('should handle empty market context gracefully', async () => {
    // Mock 404 responses for market news contexts (no context found)
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessions: [], conversations: [], users: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    render(<AdminPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    
    const marketNewsTab = screen.getByText('Market News');
    fireEvent.click(marketNewsTab);
    
    await waitFor(() => {
      expect(screen.getAllByText('No market context available for this tier.')).toHaveLength(3);
    });
  });
}); 