import type { Metadata } from 'next';
import SubscribeRedirect from '../../components/SubscribeRedirect';

export const metadata: Metadata = {
  title: 'Start Your Ask Linc Subscription',
  description: 'Opening a secure Stripe checkout to start your Ask Linc subscription.',
  // This page forwards to Stripe and has no content of its own. Keeping it out
  // of the index also keeps crawlers from following the link into checkout.
  robots: {
    index: false,
    follow: false,
  },
};

export default function SubscribePage() {
  return <SubscribeRedirect />;
}
