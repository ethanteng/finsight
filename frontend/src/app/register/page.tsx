import type { Metadata } from 'next';
import RegisterForm from '../../components/RegisterForm';

export const metadata: Metadata = {
  title: 'Create Your Ask Linc Account | AI Financial Assistant Sign Up',
  description: 'Join Ask Linc today and start your journey to better financial management. Create your account to access AI-powered financial insights, secure account connections, and personalized money advice.',
};

export default function RegisterPage() {
  return <RegisterForm />;
} 