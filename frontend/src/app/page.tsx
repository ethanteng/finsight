import MarketingHome from '../components/marketing/MarketingHome';
import StructuredData from '../components/StructuredData';
import { buildFaqItems, buildFaqPageSchema, buildProductOfferSchema } from '../data/faq';
import { getPricing } from '../lib/pricing';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'AI financial planning powered by your real financial data. Connect your accounts for clear answers on retirement, spending, investing, and more.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'AI financial planning powered by your real financial data. Connect your accounts for clear answers on retirement, spending, investing, and more.';
  }

  const title = 'AI Financial Planning | Ask Linc';
  
  return {
    title,
    description: description,
    keywords: ['financial planning', 'AI financial assistant', 'natural language financial planning', 'home affordability planning', 'retirement planning', 'personal finance AI'],
    alternates: {
      canonical: 'https://asklinc.com',
    },
    openGraph: {
      title,
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
      title,
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

export default async function Home() {
  const pricing = await getPricing();
  return (
    <>
      <StructuredData data={buildProductOfferSchema(pricing)} />
      <StructuredData data={buildFaqPageSchema(buildFaqItems(pricing))} />
      <MarketingHome />
    </>
  );
}
