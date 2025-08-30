import NewHomepage from '../components/NewHomepage';
import type { Metadata } from 'next';

// Dynamic metadata generation based on query parameters
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const ref = params.ref;
  
  let description = 'Discover Ask Linc, the revolutionary AI financial assistant that provides personalized money management advice. Connect your accounts securely and get actionable insights to improve your financial health.';
  
  if (ref === 'blog.asklinc.com') {
    description = 'Welcome blog readers! Ask Linc is your AI financial assistant that combines OpenAI intelligence with real financial data. Get personalized money management advice and real-time market insights.';
  }
  
  return {
    title: 'Ask Linc - Revolutionary AI Financial Assistant | Personalized Money Management',
    description: description,
    openGraph: {
      title: 'Ask Linc - Revolutionary AI Financial Assistant',
      description: description,
      type: 'website',
      url: 'https://asklinc.com',
      siteName: 'Ask Linc',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Ask Linc - Revolutionary AI Financial Assistant',
      description: description,
    },
  };
}

export default function Home() {
  return <NewHomepage />;
}
