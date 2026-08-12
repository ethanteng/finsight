import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Ask Linc Data Protection & User Rights',
  description: 'Read Ask Linc\'s comprehensive privacy policy. Learn about data collection, usage, your rights under GDPR/CCPA, and how we protect your financial information.',
};

export default function PrivacyPolicyPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['privacy-policy'] })} />;
}
