import NewHomepage from '../components/NewHomepage';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'Ask Linc is the AI that reasons about your finances using your real data, goals, and live market conditions. Get decisions-ready answers, not just charts.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'Welcome blog readers! Ask Linc is the AI that reasons about your finances using your real data, goals, and live market conditions. Get decisions-ready answers, not just charts.';
  }
  
  return {
    title: 'Ask Linc — AI Financial Reasoning Platform',
    description: description,
    openGraph: {
      title: 'Ask Linc — AI Financial Reasoning Platform',
      description: description,
      type: 'website',
      url: 'https://asklinc.com',
      siteName: 'Ask Linc',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Ask Linc — AI Financial Reasoning Platform',
      description: description,
    },
  };
}

export default function Home() {
  return <NewHomepage />;
}
