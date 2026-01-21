"use client";
import { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MarketNewsContext {
  contextText: string;
  dataSources: string[];
  keyEvents: string[];
  lastUpdate: string;
  tier: string;
}

interface MarketNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: string;
}

export default function MarketNewsModal({ isOpen, onClose, tier }: MarketNewsModalProps) {
  const [marketNews, setMarketNews] = useState<MarketNewsContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (isOpen && tier) {
      loadMarketNews();
    }
  }, [isOpen, tier]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMarketNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/market-news/context/${tier}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setMarketNews(data);
      } else if (response.status === 404) {
        setError('No market news available for your tier at this time.');
      } else {
        setError('Failed to load market news. Please try again later.');
      }
    } catch (err) {
      console.error('Error loading market news:', err);
      setError('Failed to load market news. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Market News</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-400">Loading market news...</span>
            </div>
          ) : error ? (
            <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded">
              {error}
            </div>
          ) : marketNews ? (
            <div className="space-y-4">
              {/* Metadata */}
              <div className="text-sm text-gray-400">
                Last updated: {formatDate(marketNews.lastUpdate)}
                {marketNews.dataSources && marketNews.dataSources.length > 0 && (
                  <span className="ml-4">
                    Sources: {marketNews.dataSources.join(', ')}
                  </span>
                )}
              </div>

              {/* Market News Content */}
              {marketNews.contextText ? (
                <div className="text-gray-300 whitespace-pre-wrap text-sm bg-gray-700 p-4 rounded">
                  <MarkdownRenderer>{marketNews.contextText}</MarkdownRenderer>
                </div>
              ) : (
                <div className="text-gray-500 italic text-sm bg-gray-700 p-4 rounded">
                  No market context available for this tier.
                </div>
              )}

              {/* Key Events */}
              {marketNews.keyEvents && marketNews.keyEvents.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Key Events:</h4>
                  <div className="flex flex-wrap gap-2">
                    {marketNews.keyEvents.map((event, index) => (
                      <span key={index} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 italic text-sm">
              No market news available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
