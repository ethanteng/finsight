import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ComparisonPageContent from '../../../components/ComparisonPageContent';
import StructuredData from '../../../components/StructuredData';
import { COMPARISONS, getComparison } from '../../../lib/comparisons';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparison(slug);
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
  const page = getComparison(slug);
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
      <ComparisonPageContent page={page} />
    </>
  );
}
