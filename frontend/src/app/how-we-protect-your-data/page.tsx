import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'How We Protect Your Data | Ask Linc Security & Privacy',
  description: 'See what Ask Linc can access, what AI sees, how account connections work, and how you can disconnect or delete your data.',
  path: '/how-we-protect-your-data',
  imageAlt: 'Ask Linc data protection and privacy',
});

export default function DataProtectionPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['how-we-protect-your-data'] })} />;
}
