import type { Metadata } from 'next';
import UserProfile from '../../components/UserProfile';

export const metadata: Metadata = {
  title: 'Your Profile | Ask Linc Account Settings & Connections',
  description: 'Manage your Ask Linc profile, connect financial accounts, update settings, and control your data privacy. Secure account management for your AI financial assistant.',
};

export default function ProfilePage() {
  return <UserProfile />;
} 