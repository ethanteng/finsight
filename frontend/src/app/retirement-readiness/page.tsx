import type { Metadata } from "next";
import RetirementReadinessPage from "../../components/RetirementReadinessPage";
import StructuredData from "../../components/StructuredData";

const pageUrl = "https://asklinc.com/retirement-readiness";

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Retirement Readiness — Are You On Track? | Ask Linc",
  description:
    "Connect your real accounts. Stress test your retirement plan. Get a clear answer — not a guess. Full portfolio-level analysis with volatility modeling and probability of success.",
  url: pageUrl,
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Ask Linc Retirement Analysis",
    applicationCategory: "FinanceApplication",
    description:
      "AI-powered retirement readiness tool that models outcomes using your real financial data, including asset allocation, volatility, withdrawal sustainability, and probability of success.",
    offers: {
      "@type": "Offer",
      price: "9",
      priceCurrency: "USD",
    },
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Check Your Retirement Readiness",
  description: "Connect accounts, ask retirement questions, and see modeled outcomes.",
  step: [
    {
      "@type": "HowToStep",
      name: "Connect accounts securely",
      text: "Connect your financial accounts securely with read-only access.",
    },
    {
      "@type": "HowToStep",
      name: "Ask retirement questions",
      text: "Ask questions like: Can I retire at 60? What happens if markets drop 20%?",
    },
    {
      "@type": "HowToStep",
      name: "See modeled outcomes",
      text: "View modeled outcomes and tradeoffs based on your real data.",
    },
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Retirement Readiness", item: pageUrl },
  ],
};

export const metadata: Metadata = {
  title: "Retirement Readiness — Are You On Track? | Ask Linc",
  description:
    "Connect your real accounts. Stress test your retirement plan. Get a clear answer — not a guess. Full portfolio analysis, volatility modeling, and probability of success.",
  keywords: [
    "retirement calculator",
    "retirement planning",
    "retirement readiness",
    "retirement stress test",
    "financial planning",
    "retirement withdrawal rate",
    "portfolio analysis",
    "retirement probability of success",
    "asset allocation retirement",
  ],
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Retirement Readiness — Are You On Track? | Ask Linc",
    description:
      "Connect your real accounts. Stress test your retirement plan. Get a clear answer — not a guess. Full portfolio analysis with volatility modeling.",
    type: "website",
    url: pageUrl,
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc Retirement Readiness - Stress test your retirement plan with real data",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Retirement Readiness — Are You On Track? | Ask Linc",
    description:
      "Connect your real accounts. Stress test your retirement plan. Get a clear answer — not a guess.",
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

export default function RetirementReadinessPageRoute() {
  return (
    <>
      <StructuredData data={webPageSchema} />
      <StructuredData data={howToSchema} />
      <StructuredData data={breadcrumbSchema} />
      <RetirementReadinessPage />
    </>
  );
}
