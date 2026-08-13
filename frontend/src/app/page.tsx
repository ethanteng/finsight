import MarketingHome from '../components/marketing/MarketingHome';
import StructuredData from '../components/StructuredData';
import { buildFaqPageSchema, PRODUCT_OFFER_SCHEMA } from '../data/faq';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'Ask Linc helps you plan big financial decisions—buying a home, growing a family, changing careers, and retirement—using your real accounts and calculations you can inspect.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'Ask Linc helps you plan a home purchase, a growing family, a career change, and retirement using your real accounts and calculations you can inspect.';
  }
  
  return {
    title: 'Ask Linc — Plan Big Financial Decisions With Your Real Numbers',
    description: description,
    keywords: ['financial planning', 'home affordability planning', 'family financial planning', 'retirement planning', 'career change planning', 'personal finance AI'],
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
