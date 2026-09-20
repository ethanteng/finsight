import type { Metadata } from "next";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";

export const metadata: Metadata = {
  title: "Financial Data Sources for More Accurate Planning | Ask Linc",
  description: "See which accounts you can connect to Ask Linc and where its property estimates, interest rates, and market data come from.",
  alternates: {
    canonical: "https://asklinc.com/integrations",
  },
  openGraph: {
    title: "The Data Behind Your Financial Model — Ask Linc",
    description: "See how your accounts, current rates, and market history inform your financial plan.",
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
