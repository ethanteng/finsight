import type { Metadata } from 'next';
import LoginForm from '../../components/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In to Ask Linc | Your Financial Planning Workspace',
  description: 'Sign in to your Ask Linc planning workspace to continue modeling decisions, testing scenarios, and checking the assumptions behind your plan.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginPage() {
  return <LoginForm />;
}
