import type { Metadata } from 'next';
import ForgotPasswordForm from '../../components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset Your Password | Ask Linc Account Recovery',
  description: 'Forgot your Ask Linc password? Enter your email address to receive a password reset link.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
