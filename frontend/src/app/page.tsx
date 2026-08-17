import MarketingHome from '../components/marketing/MarketingHome';
import StructuredData from '../components/StructuredData';
import { buildFaqPageSchema, PRODUCT_OFFER_SCHEMA } from '../data/faq';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'Ask money questions in your own words and get decision-ready answers grounded in your real accounts, inspectable calculations, and relevant market context.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'Ask Linc turns your real accounts, goals, and relevant market context into clear answers, tradeoffs, and next steps for life’s big financial decisions.';
  }
  
  return {
    title: 'Ask Linc — Plan Big Financial Decisions With Your Real Numbers',
    description: description,
    keywords: ['financial planning', 'AI financial assistant', 'natural language financial planning', 'home affordability planning', 'retirement planning', 'personal finance AI'],
    alternates: {
      canonical: 'https://asklinc.com',
    },
    openGraph: {
      title: 'Ask Linc — Plan Big Financial Decisions With Your Real Numbers',
      description: description,
      type: 'website',
      url: 'https://asklinc.com',
      siteName: 'Ask Linc',
      images: [
        {
          url: 'https://asklinc.com/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Ask Linc financial planning for big life decisions',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Ask Linc — Plan Big Financial Decisions With Your Real Numbers',
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
  return (
    <>
      <StructuredData data={PRODUCT_OFFER_SCHEMA} />
      <StructuredData data={buildFaqPageSchema()} />
      <MarketingHome />
    </>
  );
}
