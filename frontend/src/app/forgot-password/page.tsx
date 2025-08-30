import type { Metadata } from 'next';
import ForgotPasswordForm from '../../components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset Your Password | Ask Linc Account Recovery',
  description: 'Forgot your Ask Linc password? Reset it securely with our password recovery system. Enter your email to receive reset instructions and regain access to your financial dashboard.',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
} 