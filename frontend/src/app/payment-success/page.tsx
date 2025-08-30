import type { Metadata } from 'next';
import PaymentSuccessContent from '../../components/PaymentSuccessContent';

export const metadata: Metadata = {
  title: 'Payment Successful | Welcome to Ask Linc Premium',
  description: 'Your payment has been processed successfully! Welcome to Ask Linc Premium. Complete your account setup to start using our AI-powered financial assistant with full access to all features.',
};

export default function PaymentSuccessPage() {
  return <PaymentSuccessContent />;
}
