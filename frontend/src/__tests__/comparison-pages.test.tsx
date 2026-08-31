import { render, screen, within } from "@testing-library/react";
import { generateMetadata, generateStaticParams } from "@/app/vs/[slug]/page";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import { buildComparisons, getComparison } from "@/lib/comparisons";

describe("comparison pages", () => {
  it("publishes the ChatGPT comparison model and route metadata", async () => {
    const chatgpt = getComparison("chatgpt");

    expect(chatgpt).toMatchObject({
      competitorName: "ChatGPT",
      headline: "Ask Linc vs ChatGPT",
      relatedLinks: [
        { href: "/trust" },
        { href: "/use-cases" },
      ],
    });
    expect(chatgpt?.rows.map((row) => row.dimension)).toEqual([
      "Best for",
      "Starting point",
      "Financial context",
      "How the answer is checked",
      "Important calculations",
      "Price",
    ]);
    expect(chatgpt?.faqs).toHaveLength(5);
    expect(generateStaticParams()).toContainEqual({ slug: "chatgpt" });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "chatgpt" }) }),
    ).resolves.toMatchObject({
      title: "Ask Linc vs ChatGPT | Financial Decisions vs General AI",
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
    expect(within(comparison).getByText("How the answer is checked")).toBeInTheDocument();
    expect(within(comparison).getByText(/show the math keeps your numbers, assumptions, calculations, checks, and sources/i)).toBeInTheDocument();
    expect(screen.getByText(/financial data is never used to train ai models/i)).toBeInTheDocument();
    expect(within(comparison).getByText("Important calculations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /choose chatgpt for breadth.*check the work/i })).toBeInTheDocument();
    expect(screen.getByText(/keep chatgpt for general work\. use ask linc when the question is a consequential financial decision/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See how Ask Linc checks an answer" })).toHaveAttribute(
      "href",
      "/trust",
    );
    expect(screen.getByRole("link", { name: "See the decisions Ask Linc is built for" })).toHaveAttribute(
      "href",
      "/use-cases",
    );
  });

  it("publishes the Boldin comparison model and route metadata", async () => {
    const boldin = getComparison("boldin");

    expect(boldin).toMatchObject({
      competitorName: "Boldin",
      headline: "Ask Linc vs Boldin",
    });
    expect(boldin?.rows.map((row) => row.dimension)).toEqual([
      "Best for",
      "Starting point",
      "Retirement",
      "Math and scenarios",
      "Price",
    ]);
    expect(boldin?.faqs).toHaveLength(3);
    expect(generateStaticParams()).toContainEqual({ slug: "boldin" });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "boldin" }) }),
    ).resolves.toMatchObject({
      title: "Ask Linc vs Boldin | Life Decisions vs Deep Retirement Planning",
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
    expect(within(comparison).getByText("Math and scenarios")).toBeInTheDocument();
    expect(within(comparison).getByText(/offers free and paid planner options/i)).toBeInTheDocument();
    expect(screen.getByText("Is Ask Linc a Boldin alternative?")).toBeInTheDocument();

    const otherComparisons = container.querySelector(".other-comparisons");
    expect(otherComparisons).not.toBeNull();
    buildComparisons().filter(({ slug }) => slug !== "boldin").forEach(({ slug, competitorName }) => {
      expect(within(otherComparisons as HTMLElement).getByRole("link", { name: new RegExp(competitorName) })).toHaveAttribute(
        "href",
        `/vs/${slug}`,
      );
    });
  });

  it("visually separates Ask Linc from the competitor in either recommendation order", async () => {
    const monarchRender = render(
      await MarketingSubpage({ params: Promise.resolve({ slug: ["vs", "monarch"] }) }),
    );
    const monarchTake = screen.getByText("OUR HONEST TAKE").closest("section");
    expect(monarchTake).not.toBeNull();
    const monarchHeading = within(monarchTake as HTMLElement).getByRole("heading");
    expect(monarchHeading.children[0]).toHaveTextContent("Choose Monarch");
    expect(monarchHeading.children[0].tagName).toBe("SPAN");
    expect(monarchHeading.children[1]).toHaveTextContent("Choose Ask Linc");
    expect(monarchHeading.children[1].tagName).toBe("EM");
    monarchRender.unmount();

    render(await MarketingSubpage({ params: Promise.resolve({ slug: ["vs", "origin"] }) }));
    const originTake = screen.getByText("OUR HONEST TAKE").closest("section");
    expect(originTake).not.toBeNull();
    const originHeading = within(originTake as HTMLElement).getByRole("heading");
    expect(originHeading.children[0]).toHaveTextContent("Choose Ask Linc");
    expect(originHeading.children[0].tagName).toBe("EM");
    expect(originHeading.children[1]).toHaveTextContent("Choose Origin");
    expect(originHeading.children[1].tagName).toBe("SPAN");
  });
});
