import type { Metadata } from "next";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";

export const metadata: Metadata = {
  title: "Financial Data Sources for More Accurate Planning | Ask Linc",
  description: "See how accounts, property, current rates, market data, rules, and long-term history become traceable inputs to an Ask Linc financial model.",
  alternates: {
    canonical: "https://asklinc.com/integrations",
  },
  openGraph: {
    title: "The Data Behind Your Financial Model — Ask Linc",
    description: "See how Ask Linc turns real financial state, current context, and historical data into traceable planning inputs.",
    type: "website",
    url: "https://asklinc.com/integrations",
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc connected financial accounts and information",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Data Behind Your Financial Model — Ask Linc",
    description: "See which real-world inputs Ask Linc uses, when it uses them, and how they stay attached to the answer.",
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
