import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "retirement")!;

export const metadata: Metadata = {
  title: "Are We Saving Enough to Retire? — Example | Ask Linc",
  description:
    "See an illustrative retirement answer that compares a target date, monthly saving, and lifestyle.",
  alternates: {
    canonical: "https://asklinc.com/prompts/retirement",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RetirementPromptPage() {
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
