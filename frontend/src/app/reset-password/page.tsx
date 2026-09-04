import type { Metadata } from 'next';
import ResetPasswordForm from '../../components/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Set New Password | Ask Linc Account Security',
  description: 'Create a new secure password for your Ask Linc account. Use the reset link from your email to securely update your password and regain access to your financial dashboard.',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
