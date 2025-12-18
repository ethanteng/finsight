"use client";

interface NetWorthCardProps {
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

export default function NetWorthCard({
  netWorth,
  totalCash,
  totalInvestments,
  totalDebt,
  homeValue
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
    <div className="bg-gradient-to-br from-blue-700 to-blue-800 rounded-lg p-6 mb-6 border border-blue-600">
      <div className="text-blue-200 text-sm font-medium mb-4">Net Worth</div>
      
      <div className="text-white font-bold text-4xl">
        {formatCurrency(netWorth)}
      </div>
    </div>
  );
}

