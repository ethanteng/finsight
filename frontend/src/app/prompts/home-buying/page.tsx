import type { Metadata } from "next";
import PromptExamplePage from "@/components/PromptExamplePage";
import { PROMPT_PAGES } from "@/lib/promptExamples";

const config = PROMPT_PAGES.find((p) => p.slug === "home-buying")!;

export const metadata: Metadata = {
  title: "Home Buying — Example Prompt | Ask Linc",
  description:
    "See a real example of how Ask Linc evaluates emergency fund readiness for home buying. Get your own personalized analysis.",
  alternates: {
    canonical: "https://asklinc.com/prompts/home-buying",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomeBuyingPromptPage() {
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
