"use client";
import NewHomepage from '../components/NewHomepage';
import PageMeta from '../components/PageMeta';

export default function Home() {
  return (
    <>
      <PageMeta 
        title="Ask Linc - Revolutionary AI Financial Assistant | Personalized Money Management" 
        description="Discover Ask Linc, the revolutionary AI financial assistant that provides personalized money management advice. Connect your accounts securely and get actionable insights to improve your financial health."
      />
      <NewHomepage />
    </>
  );
}
