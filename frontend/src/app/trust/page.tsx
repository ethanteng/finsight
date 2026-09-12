import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import TrustPage, { TRUST_FAQS } from "@/components/marketing/TrustPage";

export const metadata: Metadata = {
  title: "See the Math Behind Every Answer | Ask Linc",
  description:
    "See how Ask Linc separates financial data, deterministic calculations, and model reasoning—then shows the inputs, assumptions, checks, and sources.",
  keywords: [
    "verifiable financial planning",
    "financial math you can check",
    "deterministic financial calculations",
    "transparent financial analysis",
    "Show the Math",
  ],
  alternates: {
    canonical: "https://asklinc.com/trust",
  },
  openGraph: {
    title: "Don’t Trust the Answer. Check It. | Ask Linc",
    description:
      "Ask Linc separates data, deterministic calculations, and reasoning, then shows the assumptions, checks, and sources.",
    type: "website",
    url: "https://asklinc.com/trust",
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc answer with the numbers and math shown",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Don’t Trust the Answer. Check It. | Ask Linc",
    description:
      "See the numbers, assumptions, math, checks, and sources behind an Ask Linc answer.",
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

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: TRUST_FAQS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function TrustPageRoute() {
  return (
    <>
      <StructuredData data={faqSchema} />
      <TrustPage />
    </>
  );
}
