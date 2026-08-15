"use client";

import type { ReactNode } from 'react';

interface NetWorthCardProps {
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
  footer?: ReactNode;
}

export default function NetWorthCard({
  netWorth,
  footer
}: NetWorthCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="relative mb-6 overflow-hidden rounded-[24px] border border-white/10 bg-[#102319] p-6 text-white shadow-[0_24px_60px_rgba(16,35,25,.14)] sm:p-8">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/10 shadow-[0_0_0_34px_rgba(255,255,255,.025),0_0_0_70px_rgba(255,255,255,.018)]" aria-hidden="true" />
      <div className="relative">
        <div className="mb-5 text-[11px] font-extrabold uppercase tracking-[.15em] text-[#d9ff6f]">Net worth</div>
        <div className="text-4xl font-semibold tracking-[-.055em] text-white sm:text-5xl">
          {formatCurrency(netWorth)}
        </div>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">Assets, investments, and property less connected debt.</p>
        {footer && (
          <div className="mt-6 border-t border-white/10 pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
