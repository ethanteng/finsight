import { permanentRedirect } from 'next/navigation';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata = buildMarketingMetadata({
  title: 'Home Buying Planning | Ask Linc',
  description: 'Explore a home purchase alongside cash reserves, monthly spending, and retirement. See what changes when the assumptions change.',
  path: '/use-cases/home-buying',
});

export default function LegacyPage() {
  permanentRedirect('/use-cases/home-buying');
}
