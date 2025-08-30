import type { Metadata } from 'next';
import AdminContent from '../../components/AdminContent';

export const metadata: Metadata = {
  title: 'Admin Dashboard | Ask Linc System Management',
  description: 'Access Ask Linc\'s administrative dashboard for system monitoring, user management, and platform oversight. Secure admin-only access for platform administrators.',
};

export default function AdminPage() {
  return <AdminContent />;
} 