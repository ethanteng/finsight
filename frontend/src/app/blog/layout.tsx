import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Financial Blog & Market Insights | Ask Linc',
  description: 'Daily financial market insights, investment strategies, and economic analysis from the Ask Linc team. Stay informed with expert financial commentary.',
  openGraph: {
    title: 'Financial Blog & Market Insights | Ask Linc',
    description: 'Daily financial market insights, investment strategies, and economic analysis from the Ask Linc team. Stay informed with expert financial commentary.',
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
