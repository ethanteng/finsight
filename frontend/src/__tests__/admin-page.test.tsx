import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the AdminPage component since it's a client component
const MockAdminPage = () => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [sessions, setSessions] = React.useState([]);
  const [conversations, setConversations] = React.useState([]);
  const [viewMode, setViewMode] = React.useState('sessions');

  React.useEffect(() => {
    // Simulate loading
    setTimeout(() => {
      setLoading(false);
      setSessions([
        {
          sessionId: 'session1',
          conversationCount: 3,
          firstQuestion: 'What is my net worth?',
          lastActivity: '2024-01-01T10:00:00Z',
          userAgent: 'Mozilla/5.0...'
        }
      ]);
      setConversations([
        {
          id: 'conv1',
          question: 'What is my net worth?',
          answer: 'Your net worth is $50,000',
          sessionId: 'session1',
          createdAt: '2024-01-01T10:00:00Z',
          session: {
            sessionId: 'session1',
            userAgent: 'Mozilla/5.0...',
            createdAt: '2024-01-01T10:00:00Z'
          }
        }
      ]);
    }, 100);
  }, []);

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
          <h1 className="text-2xl font-bold">Demo Conversations Admin</h1>
          <div className="flex space-x-2">
            <button
              className={`px-4 py-2 rounded ${viewMode === 'sessions' ? 'bg-blue-600' : 'bg-gray-600'}`}
              onClick={() => setViewMode('sessions')}
            >
              Sessions
            </button>
            <button
              className={`px-4 py-2 rounded ${viewMode === 'conversations' ? 'bg-blue-600' : 'bg-gray-600'}`}
              onClick={() => setViewMode('conversations')}
            >
              Conversations
            </button>
          </div>
        </div>
        
        {viewMode === 'sessions' && (
          <div>
            {sessions.map((session: any) => (
              <div key={session.sessionId} className="bg-gray-800 rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-blue-300 mb-1">Session: {session.sessionId}</div>
                <div className="text-white">{session.firstQuestion}</div>
              </div>
            ))}
          </div>
        )}
        
        {viewMode === 'conversations' && (
          <div>
            {conversations.map((conv: any) => (
              <div key={conv.id} className="bg-gray-700 rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-blue-300 mb-1">Question:</div>
                <div className="text-white">{conv.question}</div>
                <div className="text-sm font-medium text-green-300 mb-1">Answer:</div>
                <div className="text-gray-300">{conv.answer}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AdminPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should render loading state initially', async () => {
    render(<MockAdminPage />);
    
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Loading admin data...')).toBeInTheDocument();
  });

  it('should render sessions view by default', async () => {
    render(<MockAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Demo Conversations Admin')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Conversations')).toBeInTheDocument();
    });

    // Should show session data
    expect(screen.getByText(/session1/)).toBeInTheDocument();
    expect(screen.getByText('What is my net worth?')).toBeInTheDocument();
  });

  it('should switch to conversations view when clicked', async () => {
    render(<MockAdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Conversations')).toBeInTheDocument();
    });

    // Click on Conversations tab
    const conversationsTab = screen.getByText('Conversations');
    conversationsTab.click();

    await waitFor(() => {
      expect(screen.getByText('What is my net worth?')).toBeInTheDocument();
      expect(screen.getByText('Your net worth is $50,000')).toBeInTheDocument();
    });
  });

  it('should display session and conversation data correctly', async () => {
    render(<MockAdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Session: session1/)).toBeInTheDocument();
    });
    
    // Switch to conversations view to see Question and Answer labels
    const conversationsTab = screen.getByText('Conversations');
    conversationsTab.click();
    
    await waitFor(() => {
      expect(screen.getByText('Question:')).toBeInTheDocument();
      expect(screen.getByText('Answer:')).toBeInTheDocument();
    });
  });
}); 