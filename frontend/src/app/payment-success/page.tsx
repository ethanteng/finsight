import type { Metadata } from 'next';
import PaymentSuccessContent from '../../components/PaymentSuccessContent';

export const metadata: Metadata = {
  title: 'Payment Successful | Welcome to Ask Linc',
  description: 'Your payment has been processed successfully. Complete your Ask Linc account setup to start building and stress-testing your financial plan.',
  robots: { index: false, follow: false },
};

export default function PaymentSuccessPage() {
  return <PaymentSuccessContent />;
}
