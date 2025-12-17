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
      <div className="flex items-center justify-between mb-4">
        <div className="text-blue-200 text-sm font-medium">Net Worth</div>
        <div className="text-blue-300 text-xs">
          Cash + Investments + Home - Debt
        </div>
      </div>
      
      <div className="text-white font-bold text-4xl mb-4">
        {formatCurrency(netWorth)}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-blue-300 text-xs">Cash</div>
          <div className="text-white font-medium">{formatCurrency(totalCash)}</div>
        </div>
        <div>
          <div className="text-blue-300 text-xs">Investments</div>
          <div className="text-white font-medium">{formatCurrency(totalInvestments)}</div>
        </div>
        <div>
          <div className="text-blue-300 text-xs">Home Value</div>
          <div className="text-white font-medium">
            {homeValue ? formatCurrency(homeValue) : '$0'}
          </div>
        </div>
        <div>
          <div className="text-blue-300 text-xs">Debt</div>
          <div className="text-white font-medium">{formatCurrency(totalDebt)}</div>
        </div>
      </div>
    </div>
  );
}

