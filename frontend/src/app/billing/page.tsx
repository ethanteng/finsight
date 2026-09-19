import type { Metadata } from 'next';
import BillingPortalRedirect from '../../components/BillingPortalRedirect';

export const metadata: Metadata = {
  title: 'Manage Your Ask Linc Billing',
  description: 'Opening your secure Stripe billing portal to manage your Ask Linc subscription.',
  // This page forwards to Stripe and has no content of its own. Keeping it out
  // of the index also keeps crawlers from following the link into billing.
  robots: {
    index: false,
    follow: false,
  },
};

export default function BillingPage() {
  return <BillingPortalRedirect />;
}
