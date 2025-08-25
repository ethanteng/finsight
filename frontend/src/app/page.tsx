"use client";
import NewHomepage from '../components/NewHomepage';
import PageMeta from '../components/PageMeta';

export default function Home() {
  return (
    <>
      <PageMeta 
        title="Ask Linc - AI Financial Assistant | Personalized Financial Advice" 
        description="Get personalized financial advice powered by AI. Connect your accounts securely and get insights about your money with privacy-first technology."
      />
      <NewHomepage />
    </>
  );
}
