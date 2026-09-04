import type { Metadata } from 'next';

const SITE_URL = 'https://asklinc.com';
const DEFAULT_SHARE_IMAGE = `${SITE_URL}/og-image.jpg`;

type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  imageAlt?: string;
};

/** Build complete, consistent metadata for an indexable marketing page. */
export function buildMarketingMetadata({
  title,
  description,
  path,
  imageAlt = 'Ask Linc financial planning',
}: MarketingMetadataInput): Metadata {
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: 'Ask Linc',
      images: [{ url: DEFAULT_SHARE_IMAGE, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE],
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
