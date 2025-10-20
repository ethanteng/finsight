import React, { useState, useEffect } from 'react';

interface GPTContextData {
  userId?: string;
  timestamp: string;
  question: string;
  systemPrompt: string;
  conversationHistory: Array<{
    question: string;
    answer: string;
    createdAt: string;
  }>;
  context: {
    accountSummary: string;
    transactionSummary: string;
    investmentSummary?: string;
    marketContextSummary?: string;
    searchContext?: string;
  };
  metadata: {
    systemPromptLength: number;
    conversationHistoryLength: number;
    accountSummaryLength: number;
    transactionSummaryLength: number;
    investmentSummaryLength: number;
    marketContextSummaryLength: number;
    searchContextLength: number;
  };
}

interface ViewAIContextProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ViewAIContext: React.FC<ViewAIContextProps> = ({ isOpen, onClose }) => {
  const [context, setContext] = useState<GPTContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('systemPrompt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLatestContext();
    }
  }, [isOpen]);

  const fetchLatestContext = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/ai/context/latest`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch context');
      }
      
      const data = await response.json();
      setContext(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch context');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatJSON = (obj: unknown) => {
    return JSON.stringify(obj, null, 2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">GPT Context Viewer</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Sidebar */}
          <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">SECTIONS</h3>
            <nav className="space-y-1">
              {[
                { id: 'systemPrompt', label: 'System Prompt', key: 'systemPrompt' },
                { id: 'question', label: 'Question', key: 'question' },
                { id: 'accountSummary', label: 'Account Summary', key: 'context.accountSummary' },
                { id: 'transactionSummary', label: 'Transaction Summary', key: 'context.transactionSummary' },
                { id: 'investmentSummary', label: 'Investment Summary', key: 'context.investmentSummary' },
                { id: 'marketContext', label: 'Market Context', key: 'context.marketContextSummary' },
                { id: 'searchContext', label: 'Search Context', key: 'context.searchContext' },
                { id: 'conversationHistory', label: 'Conversation History', key: 'conversationHistory' },
                { id: 'metadata', label: 'Metadata', key: 'metadata' },
              ].map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
          
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading context...</div>
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                <p className="font-medium">Error loading context</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}
            
            {context && !loading && !error && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {activeSection.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </h3>
                  <button
                    onClick={() => {
                      const content = getActiveContent();
                      if (content) copyToClipboard(content);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                    {getActiveContent()}
                  </pre>
                </div>
                
                {context.metadata && activeSection !== 'metadata' && (
                  <div className="mt-4 text-sm text-gray-600">
                    Length: {getContentLength()} characters
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              {context && (
                <>
                  <span className="font-medium">Timestamp:</span>{' '}
                  {new Date(context.timestamp).toLocaleString()}
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function getActiveContent(): string {
    if (!context) return '';
    
    switch (activeSection) {
      case 'systemPrompt':
        return context.systemPrompt;
      case 'question':
        return context.question;
      case 'accountSummary':
        return context.context.accountSummary;
      case 'transactionSummary':
        return context.context.transactionSummary;
      case 'investmentSummary':
        return context.context.investmentSummary || 'No investment summary available';
      case 'marketContext':
        return context.context.marketContextSummary || 'No market context available';
      case 'searchContext':
        return context.context.searchContext || 'No search context available';
      case 'conversationHistory':
        return formatJSON(context.conversationHistory);
      case 'metadata':
        return formatJSON(context.metadata);
      default:
        return '';
    }
  }

  function getContentLength(): number {
    if (!context) return 0;
    
    switch (activeSection) {
      case 'systemPrompt':
        return context.metadata.systemPromptLength;
      case 'accountSummary':
        return context.metadata.accountSummaryLength;
      case 'transactionSummary':
        return context.metadata.transactionSummaryLength;
      case 'investmentSummary':
        return context.metadata.investmentSummaryLength;
      case 'marketContext':
        return context.metadata.marketContextSummaryLength;
      case 'searchContext':
        return context.metadata.searchContextLength;
      default:
        return getActiveContent().length;
    }
  }
};

