import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "geopolitical-retirement")!;

export const metadata: Metadata = {
  title: "What If Markets Fall and Inflation Stays High? | Ask Linc",
  description:
    "See an illustrative example of how a market decline and higher inflation change a retirement plan.",
  alternates: {
    canonical: "https://asklinc.com/prompts/geopolitical-retirement",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function GeopoliticalRetirementPromptPage() {
  return (
    <PromptExamplePage
      title={config.title}
      description={config.description}
      cta={config.cta}
      example={config.example}
      useCaseHref={config.useCaseHref}
    />
  );
}
