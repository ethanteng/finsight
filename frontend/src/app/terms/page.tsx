import type { Metadata } from 'next';
import TermsContent from '../../components/TermsContent';

export const metadata: Metadata = {
  title: 'User Agreement & Terms | Ask Linc Platform Rules',
  description: 'Review Ask Linc\'s terms of service and user agreement. Understand your rights, responsibilities, and the rules governing your use of our AI financial assistant platform.',
};

export default function TermsPage() {
  return <TermsContent />;
} 