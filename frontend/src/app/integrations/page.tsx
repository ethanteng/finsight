import type { Metadata } from "next";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";

export const metadata: Metadata = {
  title: "Accounts and Information Ask Linc Can Use",
  description: "See how Ask Linc brings together bank and investment accounts, property, current rates, markets, rules, and long-term history to answer real money questions.",
  alternates: {
    canonical: "https://asklinc.com/integrations",
  },
  openGraph: {
    title: "Your Money in One Picture — Ask Linc",
    description: "Connect your accounts and see how Ask Linc brings the useful parts of your finances into one clear answer.",
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
    title: "Your Money in One Picture — Ask Linc",
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
