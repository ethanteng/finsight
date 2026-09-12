import type { Metadata } from 'next';
import AppPageClient from './AppPageClient';

export const metadata: Metadata = {
  title: 'Your Financial Planning Workspace | Ask Linc',
  description: 'Open your Ask Linc planning workspace to model decisions, test scenarios, and inspect the numbers and assumptions behind your plan.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function AppPage() {
  return <AppPageClient />;
}
