import type { Metadata } from "next";
import BuyingAHousePage from "../../components/BuyingAHousePage";
import StructuredData from "../../components/StructuredData";

const pageUrl = "https://asklinc.com/buying-a-house";

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Can You Afford This House? | Ask Linc Home Affordability",
  description:
    "Model mortgage payments, down payments, and long-term impact using your real financial data. See full financial consequences before you commit.",
  url: pageUrl,
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Ask Linc Home Affordability",
    applicationCategory: "FinanceApplication",
    description:
      "AI-powered home affordability tool that models mortgage impact, down payment tradeoffs, retirement impact, and long-term wealth using your real financial data.",
    offers: {
      "@type": "Offer",
      price: "9",
      priceCurrency: "USD",
    },
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Buying a House", item: pageUrl },
  ],
};

export const metadata: Metadata = {
  title: "Can You Afford This House? | Ask Linc Home Affordability",
  description:
    "Model mortgage payments, down payments, and long-term impact using your real financial data. See full consequences — liquidity, retirement, rate sensitivity — before you commit.",
  keywords: [
    "home affordability calculator",
    "mortgage affordability",
    "buy a house calculator",
    "down payment calculator",
    "home buying affordability",
    "mortgage impact",
    "home purchase analysis",
  ],
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Can You Afford This House? | Ask Linc Home Affordability",
    description:
      "Model mortgage payments, down payments, and long-term impact using your real financial data. See full consequences before you commit.",
    type: "website",
    url: pageUrl,
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc Home Affordability - Model your home purchase with real financial data",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Can You Afford This House? | Ask Linc Home Affordability",
    description:
      "Model mortgage payments, down payments, and long-term impact using your real financial data.",
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

export default function BuyingAHousePageRoute() {
  return (
    <>
      <StructuredData data={webPageSchema} />
      <StructuredData data={breadcrumbSchema} />
      <BuyingAHousePage />
    </>
  );
}
