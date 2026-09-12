import type { Metadata } from 'next';
import VerifyEmailForm from '../../components/VerifyEmailForm';

export const metadata: Metadata = {
  title: 'Verify Your Email | Ask Linc Account Activation',
  description: 'Complete your Ask Linc account setup by verifying your email address, then start building and stress-testing your financial plan.',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
