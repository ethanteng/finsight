import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog - Ask Linc',
  description: 'Insights, updates, and financial wisdom from the Ask Linc team.',
  openGraph: {
    title: 'Blog - Ask Linc',
    description: 'Insights, updates, and financial wisdom from the Ask Linc team.',
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
