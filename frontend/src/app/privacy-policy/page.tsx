import { permanentRedirect } from 'next/navigation';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata = buildMarketingMetadata({
  title: 'Privacy Policy | Ask Linc',
  description: 'Learn how Ask Linc handles financial data, account connections, deletion requests, and your privacy.',
  path: '/privacy',
});

export default function LegacyPage() {
  permanentRedirect('/privacy');
}
