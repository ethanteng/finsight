import { render, screen, within } from "@testing-library/react";
import { metadata } from "@/app/trust/page";
import MarketingHome from "@/components/marketing/MarketingHome";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import TrustPage, { TRUST_FAQS } from "@/components/marketing/TrustPage";

describe("trust page", () => {
  it("publishes indexable metadata for the evergreen route", () => {
    expect(metadata).toMatchObject({
      title: "See the Math Behind Every Answer | Ask Linc",
      alternates: { canonical: "https://asklinc.com/trust" },
      openGraph: { url: "https://asklinc.com/trust" },
      robots: { index: true, follow: true },
    });
  });

  it("explains the verifiable financial reasoning pipeline and Show the Math", () => {
    render(<TrustPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Don’t trust the answer. Check it.",
    );
    expect(screen.getByRole("heading", { name: /ai explains.*dedicated tools do the math/i })).toBeInTheDocument();
    expect(screen.getByText("Same inputs. Same calculation. Same result.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /you don’t have to take linc’s word for it/i })).toBeInTheDocument();
    expect(screen.getByText(/no product is perfect/i)).toBeInTheDocument();
    expect(screen.getByText(/check the answer instead of taking it on faith/i)).toBeInTheDocument();

    const answerCheck = screen.getByLabelText("Illustrative Ask Linc answer with checks");
    ["Your numbers", "Assumptions", "Math", "Checks", "Sources"].forEach((label) => {
      expect(within(answerCheck).getByText(label)).toBeInTheDocument();
    });
  });

  it("includes the approved FAQ and supporting trust content", () => {
    render(<TrustPage />);

    TRUST_FAQS.forEach(({ question }) => {
      expect(screen.getByText(question)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /see how ask linc protects your financial data/i })).toHaveAttribute(
      "href",
      "/how-we-protect-your-data",
    );
    expect(screen.getByRole("link", { name: /why the same numbers should produce the same result/i })).toHaveAttribute(
      "href",
      "/blog/why-determinism-matters-in-ai-financial-analysis",
    );
  });

  it("links existing trust and verification copy back to the evergreen page", async () => {
    const { unmount } = render(<MarketingHome />);
    expect(screen.getByRole("link", { name: /show the math.*your numbers, math, and sources/i })).toHaveAttribute("href", "/trust");
    unmount();

    render(await MarketingSubpage({ params: Promise.resolve({ slug: ["features"] }) }));
    expect(screen.getAllByRole("link", { name: /how answers are checked/i })[0]).toHaveAttribute("href", "/trust");
  });
});
