import type { Metadata } from 'next';
import LoginForm from '../../components/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In to Ask Linc | AI Financial Assistant Login',
  description: 'Access your Ask Linc account securely. Sign in to your AI financial assistant dashboard and continue managing your money with personalized insights and advice.',
};

export default function LoginPage() {
  return <LoginForm />;
} 