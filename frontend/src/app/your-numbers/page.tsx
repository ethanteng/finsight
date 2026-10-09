import type { Metadata } from 'next';
import YourNumbersPageClient from './YourNumbersPageClient';

export const metadata: Metadata = {
  title: 'Your Numbers | Ask Linc',
  description: 'The figures Ask Linc plans with when your linked accounts cannot say them: your age, what you have, what you spend and your retirement plan.',
  robots: { index: false, follow: false },
};

export default function YourNumbersPage() {
  return <YourNumbersPageClient />;
}
