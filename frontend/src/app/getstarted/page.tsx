import type { Metadata } from 'next';
import RegisterForm from '../../components/RegisterForm';

export const metadata: Metadata = {
  title: 'Start Planning Free for 30 Days | Ask Linc',
  description: 'Ask a money question, explore your options, and check the math behind the answer. Try Ask Linc free for 30 days with no credit card required.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function GetStartedPage() {
  return <RegisterForm variant="trial" />;
}
