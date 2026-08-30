import { render, screen, within } from "@testing-library/react";
import { generateMetadata, generateStaticParams } from "@/app/vs/[slug]/page";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import { COMPARISONS, getComparison } from "@/lib/comparisons";

describe("comparison pages", () => {
  it("publishes the ChatGPT comparison model and route metadata", async () => {
    const chatgpt = getComparison("chatgpt");

    expect(chatgpt).toMatchObject({
      competitorName: "ChatGPT",
      headline: "Ask Linc vs ChatGPT",
      relatedLinks: [
        { href: "/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent" },
        { href: "/blog/why-ai-apps-should-stop-using-a-single-model" },
      ],
    });
    expect(chatgpt?.rows.map((row) => row.dimension)).toEqual([
      "Show the Math",
      "Never used for training",
      "Best for",
      "How the math works",
      "Price",
      "Connected financial information",
    ]);
    expect(chatgpt?.faqs).toHaveLength(6);
    expect(generateStaticParams()).toContainEqual({ slug: "chatgpt" });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "chatgpt" }) }),
    ).resolves.toMatchObject({
      title: "Ask Linc vs ChatGPT | Your Financial Accounts vs General AI",
      alternates: { canonical: "https://asklinc.com/vs/chatgpt" },
      openGraph: { url: "https://asklinc.com/vs/chatgpt" },
      robots: { index: true, follow: true },
    });
  });

  it("renders ChatGPT in the comparison template with its transparency articles", async () => {
    render(
      await MarketingSubpage({
        params: Promise.resolve({ slug: ["vs", "chatgpt"] }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Linc vs ChatGPT");
    const comparison = screen.getByRole("table");
    expect(within(comparison).getByText("Show the Math")).toBeInTheDocument();
    expect(within(comparison).getByText(/numbers used, what linc assumed, the math, the checks/i)).toBeInTheDocument();
    expect(within(comparison).getByText(/financial data is never used to train models/i)).toBeInTheDocument();
    expect(within(comparison).getByText("How the math works")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /choose chatgpt for breadth.*check the work/i })).toBeInTheDocument();
    expect(screen.getByText(/keep chatgpt for general work\. use ask linc when a money answer needs/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See how Show the Math works" })).toHaveAttribute(
      "href",
      "/blog/show-the-math-how-ask-linc-makes-ai-financial-analysis-transparent",
    );
    expect(screen.getByRole("link", { name: "Why Ask Linc uses multiple models" })).toHaveAttribute(
      "href",
      "/blog/why-ai-apps-should-stop-using-a-single-model",
    );
  });

  it("publishes the Boldin comparison model and route metadata", async () => {
    const boldin = getComparison("boldin");

    expect(boldin).toMatchObject({
      competitorName: "Boldin",
      headline: "Ask Linc vs Boldin",
    });
    expect(boldin?.rows.map((row) => row.dimension)).toEqual([
      "Price",
      "Planning experience",
      "Scope",
      "AI and privacy",
    ]);
    expect(boldin?.faqs).toHaveLength(4);
    expect(generateStaticParams()).toContainEqual({ slug: "boldin" });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "boldin" }) }),
    ).resolves.toMatchObject({
      title: "Ask Linc vs Boldin | Connected Decisions vs Retirement Planning",
      alternates: { canonical: "https://asklinc.com/vs/boldin" },
      openGraph: { url: "https://asklinc.com/vs/boldin" },
      robots: { index: true, follow: true },
    });
  });

  it("renders Boldin in the comparison template with internal comparison links", async () => {
    const { container } = render(
      await MarketingSubpage({
        params: Promise.resolve({ slug: ["vs", "boldin"] }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ask Linc vs Boldin");
    const comparison = screen.getByRole("table");
    expect(within(comparison).getByText("Planning experience")).toBeInTheDocument();
    expect(within(comparison).getByText(/offers free and paid planner options/i)).toBeInTheDocument();
    expect(screen.getByText("Is Ask Linc a Boldin alternative?")).toBeInTheDocument();

    const otherComparisons = container.querySelector(".other-comparisons");
    expect(otherComparisons).not.toBeNull();
    COMPARISONS.filter(({ slug }) => slug !== "boldin").forEach(({ slug, competitorName }) => {
      expect(within(otherComparisons as HTMLElement).getByRole("link", { name: new RegExp(competitorName) })).toHaveAttribute(
        "href",
        `/vs/${slug}`,
      );
    });
  });
});
