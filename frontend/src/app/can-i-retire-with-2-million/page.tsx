import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import AnswerPage from "@/components/marketing/AnswerPage";
import { buildAnswerPageSchemas, canIRetireWithTwoMillion } from "@/lib/answer-pages";

const page = canIRetireWithTwoMillion;
const canonical = `https://asklinc.com/${page.slug}`;

export const metadata: Metadata = {
  title: "Can I Retire With $2 Million? See What $2M Can Support",
  description: page.description,
  keywords: [
    "can I retire with 2 million",
    "is 2 million enough to retire",
    "how long will 2 million last in retirement",
    "2 million retirement income",
    "retire at 55 with 2 million",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Can I Retire With $2 Million?",
    description: page.description,
    type: "article",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc retirement planning answer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Can I Retire With $2 Million?",
    description: page.description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function CanIRetireWithTwoMillionPage() {
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
