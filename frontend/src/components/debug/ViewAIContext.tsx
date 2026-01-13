import React, { useState, useEffect } from 'react';

interface CategorizationDetail {
  transaction: {
    id: string;
    name: string;
    amount: number;
    date: string;
    category: string[];
    category_id?: string;
    personal_finance_category: { primary: string; detailed: string } | null;
    payment_channel?: string;
    merchant_name?: string;
    iso_currency_code?: string;
    pending?: boolean;
  };
  account: {
    account_id: string;
    type: string;
    subtype?: string;
    name: string;
  };
  categorization: {
    transaction_type: string;
    confidence: number;
    method: 'gpt' | 'plaid';
    reason?: string;
  };
}

interface CategorizationDetails {
  transactions: CategorizationDetail[];
  summary: {
    total: number;
    gptCategorized: number;
    plaidFallback: number;
    averageConfidence: number;
  };
}

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
  categorizationDetails?: CategorizationDetails;
  metadata: {
    systemPromptLength: number;
    conversationHistoryLength: number;
    accountSummaryLength: number;
    transactionSummaryLength: number;
    investmentSummaryLength: number;
    marketContextSummaryLength: number;
    searchContextLength: number;
    categorizationDetailsLength?: number;
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

  // Add refresh capability - fetch latest context when user clicks refresh or periodically
  const handleRefresh = () => {
    fetchLatestContext();
  };

  const fetchLatestContext = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://finsight-backend.onrender.com')}/api/ai/context/latest`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No GPT context has been logged for this user yet. Ask a question first, then try again.');
        }
        if (response.status === 403) {
          throw new Error('GPT context logging is not enabled. Set PERSIST_GPT_CONTEXT=true on the backend.');
        }
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
                { id: 'categorizationDetails', label: 'Transaction Categorization', key: 'categorizationDetails' },
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
                  <div className="flex items-center gap-2">
                    {activeSection === 'categorizationDetails' && (
                      <a
                        href="/transactions"
                        className="px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                      >
                        Manage Transactions
                      </a>
                    )}
                    <button
                      onClick={handleRefresh}
                      disabled={loading}
                      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh to get latest context"
                    >
                      {loading ? 'Refreshing...' : '🔄 Refresh'}
                    </button>
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
            <div className="flex items-center gap-4">
              {context && (
                <>
                  <div>
                    <span className="font-medium">Timestamp:</span>{' '}
                    {new Date(context.timestamp).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(() => {
                      const contextTime = new Date(context.timestamp).getTime();
                      const now = Date.now();
                      const ageMinutes = Math.floor((now - contextTime) / (1000 * 60));
                      const ageHours = Math.floor(ageMinutes / 60);
                      const ageDays = Math.floor(ageHours / 24);
                      if (ageDays > 0) return `${ageDays} day${ageDays !== 1 ? 's' : ''} old`;
                      if (ageHours > 0) return `${ageHours} hour${ageHours !== 1 ? 's' : ''} old`;
                      if (ageMinutes > 0) return `${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} old`;
                      return 'Just now';
                    })()}
                  </div>
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
      case 'categorizationDetails':
        return formatCategorizationDetails(context.categorizationDetails);
      case 'conversationHistory':
        return formatJSON(context.conversationHistory);
      case 'metadata':
        return formatJSON(context.metadata);
      default:
        return '';
    }
  }

  function formatCategorizationDetails(details?: CategorizationDetails): string {
    if (!details || !details.transactions || details.transactions.length === 0) {
      return 'No categorization details available';
    }

    const { summary, transactions } = details;

    let formatted = 'TRANSACTION CATEGORIZATION DETAILS\n\n';
    formatted += 'Summary:\n';
    formatted += `- Total Transactions: ${summary.total}\n`;
    formatted += `- GPT Categorized: ${summary.gptCategorized} (${summary.total > 0 ? Math.round((summary.gptCategorized / summary.total) * 100) : 0}%)\n`;
    formatted += `- Plaid Fallback: ${summary.plaidFallback} (${summary.total > 0 ? Math.round((summary.plaidFallback / summary.total) * 100) : 0}%)\n`;
    formatted += `- Average Confidence: ${summary.averageConfidence.toFixed(2)}\n\n`;
    formatted += 'Detailed Results (Grouped by Category, then by Month & Year):\n';
    formatted += '═'.repeat(80) + '\n\n';

    // Helper function to get month/year key from date string (YYYY-MM-DD format)
    const getMonthYearKey = (dateStr: string): string => {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      return `${year}-${String(month + 1).padStart(2, '0')}`; // YYYY-MM format for sorting
    };

    // Helper function to format month/year for display
    const formatMonthYear = (dateStr: string): string => {
      const date = new Date(dateStr);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    // Group transactions by transaction_type
    const groupedByType = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const type = transaction.categorization.transaction_type.toLowerCase();
      if (!groupedByType.has(type)) {
        groupedByType.set(type, []);
      }
      groupedByType.get(type)!.push(transaction);
    }

    // Define preferred order for categories (income-related first, then expenses, then others)
    const categoryOrder = [
      'income',
      'expense',
      'transfer_in',
      'transfer_out',
      'deposit',
      'withdrawal',
      'buy',
      'sell',
      'refund',
      'fee',
      'adjustment'
    ];

    // Sort grouped transactions by category order, then alphabetically for unknown categories
    const sortedGroups = Array.from(groupedByType.entries()).sort(([typeA], [typeB]) => {
      const indexA = categoryOrder.indexOf(typeA);
      const indexB = categoryOrder.indexOf(typeB);
      
      // If both are in the order list, sort by index
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only A is in the list, it comes first
      if (indexA !== -1) return -1;
      // If only B is in the list, it comes first
      if (indexB !== -1) return 1;
      // If neither is in the list, sort alphabetically
      return typeA.localeCompare(typeB);
    });

    // Format each category group
    for (let groupIndex = 0; groupIndex < sortedGroups.length; groupIndex++) {
      const [categoryType, categoryTransactions] = sortedGroups[groupIndex];
      
      // Group transactions within this category by month/year
      const groupedByMonthYear = new Map<string, typeof transactions>();
      for (const transaction of categoryTransactions) {
        const monthYearKey = getMonthYearKey(transaction.transaction.date);
        if (!groupedByMonthYear.has(monthYearKey)) {
          groupedByMonthYear.set(monthYearKey, []);
        }
        groupedByMonthYear.get(monthYearKey)!.push(transaction);
      }

      // Sort month/year groups (newest first)
      const sortedMonthYears = Array.from(groupedByMonthYear.entries()).sort(([keyA], [keyB]) => {
        return keyB.localeCompare(keyA); // Descending (newest first)
      });

      // Category header
      const categoryDisplayName = categoryType.toUpperCase();
      const categoryCount = categoryTransactions.length;
      const categoryTotal = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.transaction.amount), 0);
      
      formatted += `\n${'═'.repeat(80)}\n`;
      formatted += `${categoryDisplayName} (${categoryCount} transaction${categoryCount !== 1 ? 's' : ''} | Total: $${categoryTotal.toFixed(2)})\n`;
      formatted += `${'═'.repeat(80)}\n\n`;

      // Format each month/year group within this category
      for (let monthIndex = 0; monthIndex < sortedMonthYears.length; monthIndex++) {
        const [monthYearKey, monthTransactions] = sortedMonthYears[monthIndex];
        
        // Sort transactions within this month by date (newest first)
        monthTransactions.sort((a, b) => {
          return b.transaction.date.localeCompare(a.transaction.date);
        });

        // Month/Year header
        const monthYearDisplay = formatMonthYear(monthTransactions[0].transaction.date);
        const monthCount = monthTransactions.length;
        const monthTotal = monthTransactions.reduce((sum, t) => sum + Math.abs(t.transaction.amount), 0);
        
        formatted += `  ${'─'.repeat(76)}\n`;
        formatted += `  ${monthYearDisplay} (${monthCount} transaction${monthCount !== 1 ? 's' : ''} | Total: $${monthTotal.toFixed(2)})\n`;
        formatted += `  ${'─'.repeat(76)}\n\n`;

        // List transactions in this month
        for (let i = 0; i < monthTransactions.length; i++) {
          const { transaction, account, categorization } = monthTransactions[i];
          const pfc = transaction.personal_finance_category;
          
          formatted += `  ${i + 1}. Transaction: ${transaction.name}\n`;
          formatted += `     Amount: $${transaction.amount.toFixed(2)} | Date: ${transaction.date}\n`;
          
          if (pfc) {
            formatted += `     Plaid Category: ${pfc.primary}${pfc.detailed ? ` / ${pfc.detailed}` : ''}\n`;
          }
          
          if (transaction.category && transaction.category.length > 0) {
            formatted += `     Categories: ${transaction.category.join(', ')}\n`;
          }
          
          formatted += `     Account: ${account.name} (${account.type}${account.subtype ? `/${account.subtype}` : ''})\n`;
          formatted += `     ────────────────────────────────────────────────────────────────\n`;
          formatted += `     ✓ Categorized as: ${categorization.transaction_type.toUpperCase()}\n`;
          formatted += `     Confidence: ${categorization.confidence.toFixed(2)} | Method: ${categorization.method.toUpperCase()}\n`;
          
          if (categorization.reason) {
            formatted += `     Reason: ${categorization.reason}\n`;
          }
          
          // Add separator between transactions in the same month
          if (i < monthTransactions.length - 1) {
            formatted += '\n';
            formatted += '  ' + '·'.repeat(74) + '\n\n';
          }
        }

        // Add separator between months
        if (monthIndex < sortedMonthYears.length - 1) {
          formatted += '\n\n';
        }
      }

      // Add separator between categories
      if (groupIndex < sortedGroups.length - 1) {
        formatted += '\n\n';
      }
    }

    return formatted;
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

