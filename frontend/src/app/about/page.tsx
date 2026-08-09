import type { Metadata } from 'next';
import AboutPageContent from '../../components/AboutPageContent';

export const metadata: Metadata = {
  title: 'About | Ask Linc — Founded by Ethan Teng',
  description:
    'Ask Linc is the AI financial reasoning assistant for households planning retirement. Founded by Ethan Teng after general-purpose AI failed at real money math.',
  alternates: {
    canonical: 'https://asklinc.com/about',
  },
  openGraph: {
    title: 'About | Ask Linc',
    description:
      'Why Ethan Teng built Ask Linc — decisions-ready financial answers, not dashboards.',
    type: 'website',
    url: 'https://asklinc.com/about',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutPage() {
  return <AboutPageContent />;
}
