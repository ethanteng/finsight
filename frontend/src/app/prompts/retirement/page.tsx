import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "retirement")!;

export const metadata: Metadata = {
  title: "Retirement Planning — Example Prompt | Ask Linc",
  description:
    "See a real example of how Ask Linc analyzes retirement readiness across different target ages. Get your own personalized analysis.",
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
