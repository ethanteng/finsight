import type { Metadata } from 'next';
import VerifyEmailForm from '../../components/VerifyEmailForm';

export const metadata: Metadata = {
  title: 'Verify Your Email | Ask Linc Account Activation',
  description: 'Complete your Ask Linc account setup by verifying your email address. Enter the verification code sent to your inbox to activate your account and start using our AI financial assistant.',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
