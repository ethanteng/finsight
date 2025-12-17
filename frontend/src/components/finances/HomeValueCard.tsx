"use client";

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
}

interface HomeValueCardProps {
  homeData: HomeData;
}

export default function HomeValueCard({ homeData }: HomeValueCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Home Value</h3>
        <span className="text-gray-400 text-xs">
          Updated {formatDate(homeData.lastUpdated)}
        </span>
      </div>

      {homeData.address && (
        <div className="text-gray-400 text-sm mb-3">
          {homeData.address}
        </div>
      )}

      <div className="mb-4">
        <div className="text-white font-bold text-3xl mb-2">
          {formatCurrency(homeData.value)}
        </div>
        <div className="text-gray-400 text-sm">
          Range: {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-700">
        <a
          href="/profile"
          className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
        >
          Update Home Value →
        </a>
      </div>
    </div>
  );
}

