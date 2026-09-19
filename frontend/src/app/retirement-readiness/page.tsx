import { permanentRedirect } from 'next/navigation';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata = buildMarketingMetadata({
  title: 'Retirement Planning | Ask Linc',
  description: 'Explore retirement dates, spending, and savings with your real finances. See the assumptions and math behind your plan.',
  path: '/use-cases/retirement',
});

export default function LegacyPage() {
  permanentRedirect('/use-cases/retirement');
}
