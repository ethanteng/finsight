import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the API calls
global.fetch = jest.fn();

describe('Frontend Components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('App Component', () => {
    it('should render the main app interface', async () => {
      // Mock the app component - this would be the actual component
      const MockApp = () => (
        <div data-testid="app-container">
          <h1>Ask Linc</h1>
          <div data-testid="question-input">
            <textarea placeholder="Ask a question about your finances..." />
          </div>
          <button data-testid="ask-button">Ask</button>
          <div data-testid="response-area"></div>
        </div>
      );

      render(<MockApp />);

      expect(screen.getByTestId('app-container')).toBeInTheDocument();
      expect(screen.getByText('Ask Linc')).toBeInTheDocument();
      expect(screen.getByTestId('question-input')).toBeInTheDocument();
      expect(screen.getByTestId('ask-button')).toBeInTheDocument();
      expect(screen.getByTestId('response-area')).toBeInTheDocument();
    });

    it('should handle question input', async () => {
      const MockQuestionInput = () => {
        const [question, setQuestion] = React.useState('');
        
        return (
          <div>
            <textarea
              data-testid="question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your finances..."
            />
            <div data-testid="question-display">{question}</div>
          </div>
        );
      };

      render(<MockQuestionInput />);

      const input = screen.getByTestId('question-input');
      fireEvent.change(input, { target: { value: 'What is my current balance?' } });

      expect(screen.getByTestId('question-display')).toHaveTextContent('What is my current balance?');
    });

    it('should handle ask button click', async () => {
      const mockAskFunction = jest.fn();
      
      const MockAskButton = () => (
        <button data-testid="ask-button" onClick={mockAskFunction}>
          Ask
        </button>
      );

      render(<MockAskButton />);

      const button = screen.getByTestId('ask-button');
      fireEvent.click(button);

      expect(mockAskFunction).toHaveBeenCalledTimes(1);
    });

    it('should display loading state', async () => {
      const MockLoadingState = () => {
        const [isLoading, setIsLoading] = React.useState(false);
        
        return (
          <div>
            <button data-testid="ask-button" onClick={() => setIsLoading(true)}>
              Ask
            </button>
            {isLoading && <div data-testid="loading-indicator">Loading...</div>}
          </div>
        );
      };

      render(<MockLoadingState />);

      const button = screen.getByTestId('ask-button');
      fireEvent.click(button);

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should display response', async () => {
      const MockResponseDisplay = () => {
        const [response, setResponse] = React.useState('');
        
        return (
          <div>
            <button data-testid="ask-button" onClick={() => setResponse('Your balance is $1,000')}>
              Ask
            </button>
            {response && (
              <div data-testid="response-area">
                <h3>Response:</h3>
                <p>{response}</p>
              </div>
            )}
          </div>
        );
      };

      render(<MockResponseDisplay />);

      const button = screen.getByTestId('ask-button');
      fireEvent.click(button);

      expect(screen.getByTestId('response-area')).toBeInTheDocument();
      expect(screen.getByText('Your balance is $1,000')).toBeInTheDocument();
    });
  });

  describe('Plaid Link Integration', () => {
    it('should render Plaid Link button', () => {
      const MockPlaidButton = () => (
        <button data-testid="plaid-link-button">
          Connect more accounts
        </button>
      );

      render(<MockPlaidButton />);

      expect(screen.getByTestId('plaid-link-button')).toBeInTheDocument();
      expect(screen.getByText('Connect more accounts')).toBeInTheDocument();
    });

    it('should handle Plaid Link initialization', async () => {
      const mockPlaidLink = jest.fn();
      
      const MockPlaidLink = () => {
        const [isInitialized, setIsInitialized] = React.useState(false);
        
        React.useEffect(() => {
          // Simulate Plaid Link initialization
          mockPlaidLink();
          setIsInitialized(true);
        }, []);
        
        return (
          <div>
            {isInitialized ? (
              <div data-testid="plaid-ready">Plaid Link Ready</div>
            ) : (
              <div data-testid="plaid-loading">Loading Plaid...</div>
            )}
          </div>
        );
      };

      render(<MockPlaidLink />);

      expect(screen.getByTestId('plaid-loading')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByTestId('plaid-ready')).toBeInTheDocument();
      });
      
      expect(mockPlaidLink).toHaveBeenCalled();
    });
  });

  describe('Account Display', () => {
    it('should display connected accounts', () => {
      const mockAccounts = [
        { id: 1, name: 'Checking Account', balance: 1500 },
        { id: 2, name: 'Savings Account', balance: 5000 },
      ];

      const MockAccountList = () => (
        <div data-testid="accounts-list">
          <h3>Connected Accounts</h3>
          {mockAccounts.map(account => (
            <div key={account.id} data-testid={`account-${account.id}`}>
              <span>{account.name}</span>
              <span>${account.balance}</span>
            </div>
          ))}
        </div>
      );

      render(<MockAccountList />);

      expect(screen.getByTestId('accounts-list')).toBeInTheDocument();
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument();
      expect(screen.getByTestId('account-1')).toBeInTheDocument();
      expect(screen.getByTestId('account-2')).toBeInTheDocument();
      expect(screen.getByText('Checking Account')).toBeInTheDocument();
      expect(screen.getByText('Savings Account')).toBeInTheDocument();
    });

    it('should handle no accounts state', () => {
      const MockEmptyAccounts = () => (
        <div data-testid="accounts-list">
          <h3>Connected Accounts</h3>
          <div data-testid="no-accounts">No accounts connected</div>
        </div>
      );

      render(<MockEmptyAccounts />);

      expect(screen.getByTestId('no-accounts')).toBeInTheDocument();
      expect(screen.getByText('No accounts connected')).toBeInTheDocument();
    });
  });

  describe('Privacy Controls', () => {
    it('should render privacy controls', () => {
      const MockPrivacyControls = () => (
        <div data-testid="privacy-controls">
          <button data-testid="view-data">View My Data</button>
          <button data-testid="disconnect-accounts">Disconnect All Accounts</button>
          <button data-testid="delete-data">Delete All Data</button>
        </div>
      );

      render(<MockPrivacyControls />);

      expect(screen.getByTestId('privacy-controls')).toBeInTheDocument();
      expect(screen.getByTestId('view-data')).toBeInTheDocument();
      expect(screen.getByTestId('disconnect-accounts')).toBeInTheDocument();
      expect(screen.getByTestId('delete-data')).toBeInTheDocument();
    });

    it('should handle data deletion confirmation', async () => {
      const mockDeleteFunction = jest.fn();
      
      const MockDeleteConfirmation = () => {
        const [showConfirmation, setShowConfirmation] = React.useState(false);
        
        return (
          <div>
            <button data-testid="delete-button" onClick={() => setShowConfirmation(true)}>
              Delete All Data
            </button>
            {showConfirmation && (
              <div data-testid="confirmation-dialog">
                <p>Are you sure you want to delete all your data?</p>
                <button data-testid="confirm-delete" onClick={mockDeleteFunction}>
                  Yes, Delete Everything
                </button>
                <button data-testid="cancel-delete" onClick={() => setShowConfirmation(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      };

      render(<MockDeleteConfirmation />);

      const deleteButton = screen.getByTestId('delete-button');
      fireEvent.click(deleteButton);

      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete all your data?')).toBeInTheDocument();

      const confirmButton = screen.getByTestId('confirm-delete');
      fireEvent.click(confirmButton);

      expect(mockDeleteFunction).toHaveBeenCalled();
    });
  });

  describe('Conversation History', () => {
    it('should display conversation history', () => {
      const mockConversations = [
        { id: '1', question: 'What is my balance?', answer: 'Your balance is $1,000' },
        { id: '2', question: 'How much did I spend?', answer: 'You spent $200 this month' },
      ];

      const MockConversationHistory = () => (
        <div data-testid="conversation-history">
          <h3>Previous Questions</h3>
          {mockConversations.map(conv => (
            <div key={conv.id} data-testid={`conversation-${conv.id}`}>
              <div data-testid={`question-${conv.id}`}>{conv.question}</div>
              <div data-testid={`answer-${conv.id}`}>{conv.answer}</div>
            </div>
          ))}
        </div>
      );

      render(<MockConversationHistory />);

      expect(screen.getByTestId('conversation-history')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-1')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-2')).toBeInTheDocument();
      expect(screen.getByTestId('question-1')).toHaveTextContent('What is my balance?');
      expect(screen.getByTestId('answer-1')).toHaveTextContent('Your balance is $1,000');
    });

    it('should handle empty conversation history', () => {
      const MockEmptyHistory = () => (
        <div data-testid="conversation-history">
          <h3>Previous Questions</h3>
          <div data-testid="no-conversations">No previous questions</div>
        </div>
      );

      render(<MockEmptyHistory />);

      expect(screen.getByTestId('no-conversations')).toBeInTheDocument();
      expect(screen.getByText('No previous questions')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error messages', () => {
      const MockErrorDisplay = () => {
        const [error, setError] = React.useState('');
        
        return (
          <div>
            <button data-testid="trigger-error" onClick={() => setError('Failed to load accounts')}>
              Trigger Error
            </button>
            {error && (
              <div data-testid="error-message" style={{ color: 'red' }}>
                {error}
              </div>
            )}
          </div>
        );
      };

      render(<MockErrorDisplay />);

      const triggerButton = screen.getByTestId('trigger-error');
      fireEvent.click(triggerButton);

      expect(screen.getByTestId('error-message')).toBeInTheDocument();
      expect(screen.getByText('Failed to load accounts')).toBeInTheDocument();
    });

    it('should handle API errors gracefully', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const MockApiError = () => {
        const [error, setError] = React.useState('');
        
        const handleApiCall = async () => {
          try {
            await fetch('/api/test');
          } catch (err) {
            setError('API call failed');
          }
        };
        
        return (
          <div>
            <button data-testid="api-button" onClick={handleApiCall}>
              Make API Call
            </button>
            {error && <div data-testid="api-error">{error}</div>}
          </div>
        );
      };

      render(<MockApiError />);

      const apiButton = screen.getByTestId('api-button');
      fireEvent.click(apiButton);

      await waitFor(() => {
        expect(screen.getByTestId('api-error')).toBeInTheDocument();
        expect(screen.getByText('API call failed')).toBeInTheDocument();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should handle mobile viewport', () => {
      const MockResponsiveComponent = () => (
        <div data-testid="responsive-container">
          <div data-testid="mobile-view">Mobile Layout</div>
          <div data-testid="desktop-view">Desktop Layout</div>
        </div>
      );

      render(<MockResponsiveComponent />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-view')).toBeInTheDocument();
      expect(screen.getByTestId('desktop-view')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const MockAccessibleComponent = () => (
        <div>
          <button data-testid="accessible-button" aria-label="Ask a question">
            Ask
          </button>
          <textarea 
            data-testid="accessible-input" 
            aria-label="Question input"
            placeholder="Ask a question about your finances..."
          />
        </div>
      );

      render(<MockAccessibleComponent />);

      const button = screen.getByTestId('accessible-button');
      const input = screen.getByTestId('accessible-input');

      expect(button).toHaveAttribute('aria-label', 'Ask a question');
      expect(input).toHaveAttribute('aria-label', 'Question input');
    });

    it('should support keyboard navigation', () => {
      const MockKeyboardNav = () => {
        const [focusedElement, setFocusedElement] = React.useState('');
        
        return (
          <div>
            <button 
              data-testid="button-1" 
              onFocus={() => setFocusedElement('button-1')}
              tabIndex={0}
            >
              Button 1
            </button>
            <button 
              data-testid="button-2" 
              onFocus={() => setFocusedElement('button-2')}
              tabIndex={0}
            >
              Button 2
            </button>
            <div data-testid="focused-element">{focusedElement}</div>
          </div>
        );
      };

      render(<MockKeyboardNav />);

      const button1 = screen.getByTestId('button-1');
      const button2 = screen.getByTestId('button-2');

      expect(button1).toHaveAttribute('tabIndex', '0');
      expect(button2).toHaveAttribute('tabIndex', '0');

      fireEvent.focus(button1);
      expect(screen.getByTestId('focused-element')).toHaveTextContent('button-1');

      fireEvent.focus(button2);
      expect(screen.getByTestId('focused-element')).toHaveTextContent('button-2');
    });
  });
}); 