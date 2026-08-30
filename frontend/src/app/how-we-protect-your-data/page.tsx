import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'How We Protect Your Data | Ask Linc Security & Privacy',
  description: 'See what Ask Linc can access, what AI sees, how account connections work, and how you can disconnect or delete your data.',
};

export default function DataProtectionPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['how-we-protect-your-data'] })} />;
}
