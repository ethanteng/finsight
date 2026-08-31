import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import StructuredData from '../../../components/StructuredData';
import { COMPARISON_SLUGS, getComparison } from '../../../lib/comparisons';
import { getPricing } from '../../../lib/pricing';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARISON_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // Titles and descriptions do not quote the price, but the lookup builds the
  // whole page, so resolve it once and reuse it.
  const page = getComparison(slug, await getPricing());
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `https://asklinc.com/vs/${page.slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      type: 'website',
      url: `https://asklinc.com/vs/${page.slug}`,
      siteName: 'Ask Linc',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function VsPage({ params }: Props) {
  const { slug } = await params;
  const page = getComparison(slug, await getPricing());
  if (!page) notFound();

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      <StructuredData data={faqSchema} />
      <MarketingSubpage params={Promise.resolve({ slug: ['vs', slug] })} />
    </>
  );
}
