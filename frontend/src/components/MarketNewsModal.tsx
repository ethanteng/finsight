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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102319]/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-[#ccd1c4] bg-[#f3f2e9] text-[#102319] shadow-[0_30px_90px_rgba(16,35,25,.3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-news-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#102319]/12 bg-[#fffdf5] px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Current market context</p>
            <h2 id="market-news-title" className="mt-1 text-xl font-semibold tracking-[-.035em] text-[#102319] sm:text-2xl">Market News</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#102319]/12 text-[#66736b] transition hover:bg-[#f3f2e9] hover:text-[#102319]"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6 sm:py-7">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#102319]/15 border-t-[#102319]"></div>
              <span className="ml-3 text-sm text-[#66736b]">Loading market news...</span>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#b84a3d]/20 bg-[#f8e8e3] px-4 py-4 text-sm text-[#8b3027]">
              {error}
            </div>
          ) : marketNews ? (
            <div className="space-y-6">
              {/* Metadata */}
              <div className="flex flex-col gap-4 rounded-2xl border border-[#102319]/10 bg-[#e9eee5] px-4 py-4 text-sm text-[#56635b] sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#49725a]">Last updated</span>
                  <span className="mt-1 block font-medium text-[#102319]">{formatDate(marketNews.lastUpdate)}</span>
                </div>
                {marketNews.dataSources && marketNews.dataSources.length > 0 && (
                  <div className="sm:max-w-[60%] sm:text-right">
                    <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#49725a]">Sources</span>
                    <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
                      {marketNews.dataSources.map((source) => (
                        <span key={source} className="rounded-full border border-[#102319]/10 bg-[#fffdf5] px-2.5 py-1 text-xs font-medium text-[#486657]">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Market News Content */}
              {marketNews.contextText ? (
                <article className="market-news-article rounded-[20px] border border-[#102319]/11 bg-[#fffdf5] px-5 py-4 shadow-[0_14px_38px_rgba(16,35,25,.045)] sm:px-7 sm:py-6">
                  <MarkdownRenderer>{marketNews.contextText}</MarkdownRenderer>
                </article>
              ) : (
                <div className="rounded-2xl border border-[#102319]/10 bg-[#fffdf5] p-5 text-sm italic text-[#66736b]">
                  No market context available for this tier.
                </div>
              )}

              {/* Key Events */}
              {marketNews.keyEvents && marketNews.keyEvents.length > 0 && (
                <section>
                  <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Key events</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {marketNews.keyEvents.map((event, index) => (
                      <div key={index} className="flex gap-3 rounded-xl border border-[#102319]/10 bg-[#fffdf5] px-4 py-3 text-sm leading-6 text-[#486657]">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#397052]" aria-hidden="true" />
                        <span>{event}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#102319]/10 bg-[#fffdf5] p-5 text-sm italic text-[#66736b]">
              No market news available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#102319]/12 bg-[#fffdf5] px-5 py-4 sm:px-6">
          <button
            onClick={onClose}
            className="rounded-full bg-[#102319] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
