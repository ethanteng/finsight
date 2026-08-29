import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import TrustPage, { TRUST_FAQS } from "@/components/marketing/TrustPage";

export const metadata: Metadata = {
  title: "AI Financial Analysis You Can Verify | Ask Linc",
  description:
    "See how Ask Linc grounds financial answers in your real data, uses repeatable calculations, validates results, and shows the math so you can verify the answer yourself.",
  keywords: [
    "verifiable financial AI",
    "deterministic financial analysis",
    "AI financial calculations",
    "transparent financial analysis",
    "Show the Math",
  ],
  alternates: {
    canonical: "https://asklinc.com/trust",
  },
  openGraph: {
    title: "Don’t Trust the Answer. Check It. | Ask Linc",
    description:
      "Financial AI grounded in real data, repeatable calculations, validation, and math you can inspect.",
    type: "website",
    url: "https://asklinc.com/trust",
    siteName: "Ask Linc",
    images: [
      {
        url: "https://asklinc.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Ask Linc financial analysis with inspectable calculations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Don’t Trust the Answer. Check It. | Ask Linc",
    description:
      "See the inputs, assumptions, calculations, validation, and sources behind an Ask Linc answer.",
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
