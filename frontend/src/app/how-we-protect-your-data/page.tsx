import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'How We Protect Your Data | Ask Linc Security & Privacy',
  description: 'Learn about Ask Linc\'s comprehensive data protection measures. Discover our encryption standards, security protocols, and commitment to keeping your financial information safe and private.',
};

export default function DataProtectionPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['how-we-protect-your-data'] })} />;
}
