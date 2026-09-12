import type { Metadata } from 'next';
import RegisterForm from '../../components/RegisterForm';

export const metadata: Metadata = {
  title: 'Start Planning Free for 30 Days | Ask Linc',
  description: 'Turn a real financial decision into a model you can stress-test and inspect. Try Ask Linc free for 30 days with no credit card required.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function GetStartedPage() {
  return <RegisterForm variant="trial" />;
}
