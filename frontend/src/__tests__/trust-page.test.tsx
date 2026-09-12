import { render, screen, within } from "@testing-library/react";
import FeaturesPageRoute from "@/app/features/page";
import { metadata } from "@/app/trust/page";
import MarketingHome from "@/components/marketing/MarketingHome";
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
      "Don't trust the answer. Check it.",
    );
    expect(screen.getByRole("heading", { name: /from the decision to the numbers to the recommendation/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /you do not have to take linc's word for it/i })).toBeInTheDocument();
    const openingHeading = screen.getByRole("heading", { name: /data supplies the inputs.*planning system does the work/i });
    expect(openingHeading.querySelector("em")).toHaveTextContent("The planning system does the work.");
    expect(document.querySelectorAll(".trust-question-card")).toHaveLength(4);
    expect(screen.getByText(/no product is perfect/i)).toBeInTheDocument();
    expect(screen.getByText(/purpose-built tools run supported calculations/i)).toBeInTheDocument();

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
    expect(screen.getByRole("link", { name: /see how your data is protected/i })).toHaveAttribute(
      "href",
      "/how-we-protect-your-data",
    );
    const mathSection = screen.getByRole("heading", { name: /you do not have to take linc's word for it/i }).closest("section");
    expect(mathSection).not.toBeNull();
    expect(within(mathSection as HTMLElement).getAllByRole("link")).toHaveLength(1);
    expect(within(mathSection as HTMLElement).getByRole("link", { name: /see how ask linc works/i })).toHaveAttribute("href", "/features");
  });

  it("links existing trust and verification copy back to the evergreen page", async () => {
    const { unmount } = render(<MarketingHome />);
    expect(screen.getByRole("link", { name: /show the math.*inspect the numbers, assumptions, and sources/i })).toHaveAttribute("href", "/trust");
    unmount();

    render(<FeaturesPageRoute />);
    const coverageSection = screen
      .getByRole("heading", { name: /your real financial state stays attached to the model/i })
      .closest("section");
    expect(coverageSection).not.toBeNull();
    expect(within(coverageSection as HTMLElement).getByRole("link", { name: /show the math/i })).toHaveAttribute(
      "href",
      "/trust",
    );
  });
});
