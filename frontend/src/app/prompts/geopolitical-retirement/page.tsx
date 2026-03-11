import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "geopolitical-retirement")!;

export const metadata: Metadata = {
  title: "Geopolitical Impact on Retirement — Example Prompt | Ask Linc",
  description:
    "See how Ask Linc assesses the impact of geopolitical events like the Iran conflict on your retirement portfolio. Get your own personalized analysis.",
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
