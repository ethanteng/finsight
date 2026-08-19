import type { Metadata } from "next";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";

export const metadata: Metadata = {
  title: "Financial Data Integrations — Ask Linc",
  description: "See how Ask Linc combines connected bank and investment accounts with property, rates, markets, current evidence, and long-run planning history to answer real financial questions.",
  alternates: {
    canonical: "https://asklinc.com/integrations",
  },
  openGraph: {
    title: "Your Financial Ecosystem, Connected — Ask Linc",
    description: "Connect your accounts and see how Ask Linc brings the relevant parts of your financial life and the outside world into one decision-ready answer.",
    type: "website",
    url: "https://asklinc.com/integrations",
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc financial data ecosystem",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Financial Ecosystem, Connected — Ask Linc",
    description: "See what Ask Linc can connect, understand, and use to answer real financial questions.",
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function IntegrationsPageRoute() {
  return <IntegrationsPage />;
}
