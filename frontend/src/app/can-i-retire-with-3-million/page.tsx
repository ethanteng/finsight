import type { Metadata } from "next";
import StructuredData from "@/components/StructuredData";
import AnswerPage from "@/components/marketing/AnswerPage";
import { buildAnswerPageSchemas, canIRetireWithThreeMillion } from "@/lib/answer-pages";

const page = canIRetireWithThreeMillion;
const canonical = `https://asklinc.com/${page.slug}`;

export const metadata: Metadata = {
  title: "Can I Retire With $3 Million? See What $3M Can Support",
  description: page.description,
  keywords: [
    "can I retire with 3 million",
    "is 3 million enough to retire",
    "how long will 3 million last in retirement",
    "3 million retirement income",
    "retire early with 3 million",
  ],
  alternates: { canonical },
  openGraph: {
    title: "Can I Retire With $3 Million?",
    description: page.description,
    type: "article",
    url: canonical,
    siteName: "Ask Linc",
    images: [{ url: "https://asklinc.com/og-image.jpg", width: 1200, height: 630, alt: "Ask Linc $3 million retirement planning answer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Can I Retire With $3 Million?",
    description: page.description,
    images: ["https://asklinc.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function CanIRetireWithThreeMillionPage() {
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
