import NewHomepage from '../components/NewHomepage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ask Linc - Revolutionary AI Financial Assistant | Personalized Money Management',
  description: 'Discover Ask Linc, the revolutionary AI financial assistant that provides personalized money management advice. Connect your accounts securely and get actionable insights to improve your financial health.',
};

export default function Home() {
  return <NewHomepage />;
}
