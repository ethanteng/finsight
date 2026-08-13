import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import AnswerPage from "@/components/marketing/AnswerPage";
import { buildAnswerPageSchemas, canIRetireAt55 } from "@/lib/answer-pages";

const page = canIRetireAt55;
const canonical = `https://asklinc.com/${page.slug}`;

export const metadata: Metadata = {
  title: "Can I Retire at 55? Plan the Bridge to 59½, 62, and 65",
  description: page.description,
  keywords: [
    "can I retire at 55",
    "how much money do I need to retire at 55",
    "retire at 55",
    "early retirement at 55",
    "rule of 55",
    "health insurance before Medicare",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Can I Retire at 55?",
    description: page.description,
    type: "article",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc early retirement planning answer for age 55" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Can I Retire at 55?",
    description: page.description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function CanIRetireAt55Page() {
  const schemas = buildAnswerPageSchemas(page);

  return (
    <>
      <StructuredData data={schemas.article} />
      <StructuredData data={schemas.breadcrumbs} />
      <StructuredData data={schemas.faq} />
      <AnswerPage page={page} />
    </>
  );
}
