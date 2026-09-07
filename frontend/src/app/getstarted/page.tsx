import type { Metadata } from 'next';
import GetStartedForm from '../../components/GetStartedForm';

export const metadata: Metadata = {
  title: 'Start Your Free Trial | Ask Linc',
  description: 'Try Ask Linc free for 30 days. Connect your accounts, ask real questions, and get answers using your actual financial picture. No credit card required.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function GetStartedPage() {
  return <GetStartedForm />;
}
