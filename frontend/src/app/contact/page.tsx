import type { Metadata } from 'next';
import ContactForm from '../../components/ContactForm';

export const metadata: Metadata = {
  title: 'Get Help & Support | Ask Linc Customer Service',
  description: 'Need help with Ask Linc? Our support team is here to assist you. Get answers to your questions, share feedback, or report any issues with our AI financial platform.',
};

export default function ContactPage() {
  return <ContactForm />;
}
