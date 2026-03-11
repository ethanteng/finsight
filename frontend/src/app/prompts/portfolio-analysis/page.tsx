import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "portfolio-analysis")!;

export const metadata: Metadata = {
  title: "Portfolio Analysis — Example Prompt | Ask Linc",
  description:
    "See a real example of how Ask Linc assesses portfolio balance and asset allocation. Get your own personalized analysis.",
  alternates: {
    canonical: "https://asklinc.com/prompts/portfolio-analysis",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PortfolioAnalysisPromptPage() {
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
