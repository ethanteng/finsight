import { render, screen, within } from "@testing-library/react";
import { generateMetadata, generateStaticParams } from "@/app/vs/[slug]/page";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import { COMPARISONS, getComparison } from "@/lib/comparisons";

describe("comparison pages", () => {
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
    expect(within(comparison).getByText(/PlannerPlus is \$144\/year/i)).toBeInTheDocument();
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
