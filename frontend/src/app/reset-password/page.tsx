import type { Metadata } from 'next';
import ResetPasswordForm from '../../components/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Set New Password | Ask Linc Account Security',
  description: 'Choose a new password for your Ask Linc account using the reset link in your email.',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
