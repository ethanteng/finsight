import NewHomepage from '../components/NewHomepage';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'Ask Linc is the AI that reasons about your finances using your real data, goals, and live market conditions. Get decisions-ready answers, not just charts.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'Welcome blog readers! Ask Linc is the AI that reasons about your finances using your real data, goals, and live market conditions. Get decisions-ready answers, not just charts.';
  }
  
  return {
    title: 'Ask Linc — AI Financial Reasoning Platform',
    description: description,
    keywords: ['AI financial advisor', 'personal finance AI', 'financial planning', 'money management', 'investment advice', 'financial analysis', 'AI financial assistant'],
    alternates: {
      canonical: 'https://asklinc.com',
    },
    openGraph: {
      title: 'Ask Linc — AI Financial Reasoning Platform',
      description: description,
      type: 'website',
      url: 'https://asklinc.com',
      siteName: 'Ask Linc',
      images: [
        {
          url: 'https://asklinc.com/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Ask Linc - AI Financial Reasoning Platform',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Ask Linc — AI Financial Reasoning Platform',
      description: description,
      images: ['https://asklinc.com/og-image.jpg'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default function Home() {
  return <NewHomepage />;
}
