import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "financial-stress-testing")!;

export const metadata: Metadata = {
  title: "Financial Stress Testing — Example Prompt | Ask Linc",
  description:
    "See a real example of how Ask Linc stress tests your portfolio and assesses withdrawal sustainability. Get your own personalized analysis.",
  alternates: {
    canonical: "https://asklinc.com/prompts/financial-stress-testing",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FinancialStressTestingPromptPage() {
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
