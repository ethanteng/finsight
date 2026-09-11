import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import { CoastFireCalculator } from "@/components/marketing/CoastFireCalculator";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { COAST_FIRE_FAQ } from "@/lib/coast-fire";
import "@/components/marketing/coast-fire.css";

const canonical = "https://asklinc.com/coast-fire-calculator";
const description =
  "Free Coast FIRE calculator. Find the retirement savings you need today, test return assumptions, and see whether you can stop contributing.";

export const metadata: Metadata = {
  title: "Free Coast FIRE Calculator | Ask Linc",
  description,
  keywords: [
    "Coast FIRE calculator",
    "Coast FIRE number",
    "Coast FIRE by age",
    "Coast FIRE with Social Security",
    "financial independence calculator",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Have I Reached Coast FIRE? | Ask Linc",
    description,
    type: "website",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc Coast FIRE calculator" }],
  },
  twitter: { card: "summary_large_image", title: "Have I Reached Coast FIRE?", description, images: ["https://asklinc.com/og-image.jpg"] },
  robots: { index: true, follow: true },
};

const applicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ask Linc Coast FIRE Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: canonical,
  description,
  isAccessibleForFree: true,
  provider: { "@type": "Organization", name: "Ask Linc", url: "https://asklinc.com" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Coast FIRE number in today's dollars",
    "Retirement target and no-contribution projection",
    "Real-return sensitivity comparison",
    "Visible calculation assumptions",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: COAST_FIRE_FAQ.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ask Linc", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Coast FIRE", item: "https://asklinc.com/coast-fire" },
    { "@type": "ListItem", position: 3, name: "Coast FIRE calculator", item: canonical },
  ],
};

export default function CoastFireCalculatorPage() {
  return (
    <>
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <StructuredData data={breadcrumbSchema} />
      <CoastFireCalculator><CoastFireCalculatorSeoContent /></CoastFireCalculator>
    </>
  );
}
