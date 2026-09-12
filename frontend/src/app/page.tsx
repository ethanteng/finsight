import MarketingHome from '../components/marketing/MarketingHome';
import StructuredData from '../components/StructuredData';
import { buildFaqItems, buildFaqPageSchema, buildProductOfferSchema } from '../data/faq';
import { getPricing } from '../lib/pricing';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  // Resolve the legacy referral parameter without letting campaign URLs create
  // different metadata or canonicals for the same homepage.
  await searchParams;

  const description = 'Self-directed financial planning that turns your real finances into a plan you can stress-test—so you can see what your money lets you do next.';
  const title = 'Self-Directed Financial Planning | Ask Linc';
  
  return {
    title,
    description: description,
    keywords: ['self-directed financial planning', 'financial scenario modeling', 'Coast FIRE calculator', 'retirement stress test', 'what-if financial planning', 'financial decision planning'],
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
