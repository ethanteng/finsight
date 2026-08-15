"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FinancesOverview } from '../types/finances-overview';

interface FinancialOverviewProps {
  tier?: string;
}

export default function FinancialOverview({ tier: _tier }: FinancialOverviewProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [finances, setFinances] = useState<FinancesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState('');
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);
        setError('');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_URL}/api/finances/overview`, { headers });
        if (res.ok && res.status !== 204) {
          setFinances(await res.json());
        } else {
          setFinances(null);
        }
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
        setFinances(null);
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [API_URL]);

  // Canonical metrics come only from the backend snapshot. A known zero remains
  // zero; unavailable values are not reconstructed from raw account arrays.
  const overview = finances?.financialOverview;
  const totalCash = overview?.totalCash ?? null;
  const totalDebt = overview?.totalDebt ?? null;
  const totalInvestments = overview?.totalInvestments ?? null;
  const totalHomeValue = overview?.homeValue ?? null;
  const netWorth = overview?.netWorth ?? null;
  const totalAccountCount = finances
    ? Object.values(finances.accountGroups).reduce((total, group) => total + group.accounts.length, 0)
    : 0;
  const hasAccounts = totalAccountCount > 0;
  const homeData = finances?.home;
  const investmentPortfolio = finances?.investmentPortfolio as {
    holdingCount?: number;
    securityCount?: number;
  } | undefined;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMetric = (value: number | null) =>
    value === null ? 'Unavailable' : formatCurrency(value);

  const handleAddAccounts = () => {
    // Set a flag in localStorage to indicate user wants to connect accounts
    localStorage.setItem('wants_to_connect_accounts', 'true');
    router.push('/profile');
  };

  const handleOverviewClick = () => {
    router.push('/finances');
  };

  if (loading) {
    return (
      <div className="rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_16px_40px_rgba(18,60,47,.06)]">
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-1/3 rounded bg-[#dfe6d4]"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccounts) {
    return (
      <div
        className="cursor-pointer rounded-[22px] border border-[#102319]/12 bg-[#fffdf5] p-5 shadow-[0_16px_40px_rgba(18,60,47,.06)] transition hover:border-[#102319]/25"
        onClick={handleOverviewClick}
        title="Click to view full financial dashboard"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOverviewClick();
          }
        }}
      >
        <div className="text-center">
          <h3 className="mb-2 text-lg font-semibold text-[#102319]">
            Your Financial Overview
          </h3>
          <p className="mb-4 text-sm text-[#5e6b63]">
            Add your accounts to start seeing your financial overview
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddAccounts();
            }}
            className="relative rounded-full bg-[#102319] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            Add Your Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="cursor-pointer overflow-hidden rounded-[22px] border border-[#102319]/12 bg-[#fffdf5] p-4 text-[#102319] shadow-[0_18px_40px_rgba(18,60,47,.08)] transition hover:-translate-y-0.5"
        onClick={handleOverviewClick}
        title="Click to view full financial dashboard"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOverviewClick();
          }
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#49725a]"></div>
            <h3 className="text-base font-semibold text-[#102319]">Your Financial Overview</h3>
          </div>

          {/* Add More Accounts link - only show when user has accounts */}
          {hasAccounts && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddAccounts();
              }}
              className="rounded-full border border-[#102319]/20 bg-transparent px-4 py-2 text-sm font-semibold text-[#102319] transition-colors hover:bg-[#f3f2e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
              title="Add more accounts"
            >
              Add More Accounts
            </button>
          )}
        </div>
        {(finances?.revision.asOf || (finances?.revision.status && finances.revision.status !== 'current')) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[#5e6b63]">
            {finances?.revision.asOf && (
              <span>Data as of {new Date(finances.revision.asOf).toLocaleString()}</span>
            )}
            {finances?.revision.status && finances.revision.status !== 'current' && (
              <span className="rounded-full bg-[#fff3ce] px-2 py-0.5 font-semibold text-[#76510f]">
                {finances.revision.status === 'partial' ? 'Some data unavailable' :
                  finances.revision.status === 'stale' ? 'Some data is stale' : 'Source data unavailable'}
              </span>
            )}
          </div>
        )}

      {/* Net Worth - Featured Card */}
      <div className="mb-3 rounded-2xl border border-[#397052]/12 bg-[#e2edff] p-4">
        <div className="mb-1 text-xs font-semibold text-[#486b91]">Net Worth</div>
        <div className="text-2xl font-bold text-[#102319]">
          {formatMetric(netWorth)}
        </div>
      </div>

      {/* Mobile expand/collapse toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMobileExpanded(!mobileExpanded);
        }}
        className="mb-2 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#48675e] transition-colors hover:text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2 md:hidden"
        aria-expanded={mobileExpanded}
        type="button"
      >
        {mobileExpanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show details
          </>
        )}
      </button>

      {/* Financial Metrics Row - collapsible on mobile */}
      <div className={`${!mobileExpanded ? 'hidden' : ''} md:block`}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Cash</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalCash)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Debt</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalDebt)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Investments</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalInvestments)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Home Value</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalHomeValue)}
          </div>
          {homeData && homeData.valueLow !== null && homeData.valueHigh !== null && (
            <div className="mt-0.5 text-xs text-[#486b91]" title={`Range: ${formatCurrency(homeData.valueLow)} - ${formatCurrency(homeData.valueHigh)}`}>
              Range: {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
            </div>
          )}
        </div>
      </div>

      {/* Account Statistics Row */}
      {hasAccounts && (
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
            <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Accounts</div>
            <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{totalAccountCount}</div>
          </div>

          {investmentPortfolio && (
            <>
              <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
                <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Holdings</div>
                <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{investmentPortfolio.holdingCount ?? 0}</div>
              </div>
              <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
                <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Securities</div>
                <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{investmentPortfolio.securityCount ?? 0}</div>
              </div>
            </>
          )}

        </div>
      )}
      </div>
    </div>
    </>
  );
}
