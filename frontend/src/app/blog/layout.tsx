import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Financial Insights & Market Analysis | Ask Linc Blog',
  description: 'Stay ahead of the financial curve with Ask Linc\'s expert blog. Get daily market analysis, investment strategies, economic insights, and personal finance tips from our financial experts.',
  openGraph: {
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Stay ahead of the financial curve with Ask Linc\'s expert blog. Get daily market analysis, investment strategies, economic insights, and personal finance tips from our financial experts.',
    type: 'website',
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
