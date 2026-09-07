import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import { RetirementQuickPlan } from "@/components/marketing/RetirementQuickPlan";
import "@/components/marketing/retirement-quickplan.css";

const canonical = "https://asklinc.com/retirement-calculator";
const description =
  "Answer six questions and run them through Ask Linc's deterministic retirement engine: a century of month-by-month market history, real inflation, and real sequence risk. No chat, no guesswork.";

export const metadata: Metadata = {
  title: "Can I Retire at 60? Run the Real Model | Ask Linc",
  description,
  keywords: [
    "retirement calculator",
    "can I retire at 60",
    "safe withdrawal rate calculator",
    "sequence of returns risk",
    "historical retirement simulation",
    "retirement stress test",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Can I Retire at 60? Run the Real Model",
    description,
    type: "website",
    url: canonical,
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc retirement model",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Can I Retire at 60? Run the Real Model",
    description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const applicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ask Linc Retirement Model",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: canonical,
  description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Historical sequence-of-returns stress test over a century of US market data",
    "Inflation-adjusted withdrawals with pre-retirement contributions",
    "Social Security modeled as a COLA-indexed income from your claiming age",
    "Sustainable spending distribution for the chosen asset mix",
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ask Linc", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Retirement", item: "https://asklinc.com/retirement-answers" },
    { "@type": "ListItem", position: 3, name: "Retirement model", item: canonical },
  ],
};

export default function RetirementCalculatorPage() {
  return (
    <>
      <StructuredData data={applicationSchema} />
      <StructuredData data={breadcrumbSchema} />
      <RetirementQuickPlan />
    </>
  );
}
