import type { Metadata } from 'next';
import RegisterForm from '../../components/RegisterForm';

export const metadata: Metadata = {
  title: 'Create Your Ask Linc Planning Account',
  description: 'Create your Ask Linc account to keep your financial model, test scenarios, and inspect the numbers and assumptions behind each answer.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
