import type { Metadata } from 'next';
import PrivacyContent from '../../components/PrivacyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | How Ask Linc Protects Your Financial Data',
  description: 'Learn how Ask Linc protects your privacy and financial data. Our comprehensive privacy policy explains data collection, encryption, user rights, and security measures.',
};

export default function PrivacyPage() {
  return <PrivacyContent />;
} 