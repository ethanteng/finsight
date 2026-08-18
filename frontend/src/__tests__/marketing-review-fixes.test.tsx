import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import MarketingHome from "@/components/marketing/MarketingHome";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import { SiteHeader } from "@/components/marketing/SiteShell";
import { USE_CASE_LINKS } from "@/lib/site-nav";

describe("marketing review fixes", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the desktop sign-in link outside the primary navigation links", () => {
    render(<SiteHeader />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    const answersLink = screen.getByRole("link", { name: "Answers" });
    const compareLink = screen.getByRole("link", { name: "Compare" });
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink.closest(".nav-actions")).not.toBeNull();
    expect(signInLink.closest(".nav-links")).toBeNull();
    expect(answersLink).toHaveAttribute("href", "/retirement-answers");
    expect(answersLink.closest(".nav-links")).not.toBeNull();
    expect(compareLink).toHaveAttribute("href", "/vs");
    expect(compareLink.closest(".nav-links")).not.toBeNull();
  });

  it("opens an accessible mobile menu with the primary subpages", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = screen.getByLabelText("Mobile navigation");
    expect(within(mobileMenu).getByRole("link", { name: "Features" })).toHaveAttribute("href", "/features");
    expect(within(mobileMenu).getByRole("link", { name: "Use Cases" })).toHaveAttribute("href", "/use-cases");
    expect(within(mobileMenu).getByRole("link", { name: "Answers" })).toHaveAttribute("href", "/retirement-answers");
    expect(within(mobileMenu).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/vs");
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("grounds the homepage in recognizable life decisions", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "See what a big decision changes. Before you make it.",
    );
    expect(screen.getByText(/buying a home, growing your family, changing jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/grounds each answer in your financial picture, goals, and real-life context/i)).toBeInTheDocument();
    expect(screen.getByText(/stay in control of what you connect and share/i)).toBeInTheDocument();
    expect(USE_CASE_LINKS).toContainEqual({
      href: "/use-cases/family-planning",
      label: "Growing a Family",
    });
  });

  it("turns a natural-language question into a grounded decision path", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { name: /same question.*a very different answer/i })).toBeInTheDocument();
    const generalPanel = screen.getByRole("heading", { name: "Without Ask Linc connected" }).closest("article");
    const groundedPanel = screen.getByRole("heading", { name: "With Ask Linc connected" }).closest("article");
    expect(generalPanel).not.toBeNull();
    expect(groundedPanel).not.toBeNull();
    expect(screen.getAllByText(/should i use my \$30k bonus to pay down the mortgage/i)).toHaveLength(2);
    expect(within(generalPanel as HTMLElement).getByText("GENERAL ANSWER")).toBeInTheDocument();
    expect(within(generalPanel as HTMLElement).getByText("WHAT THIS ANSWER DOESN'T KNOW")).toBeInTheDocument();
    expect(within(groundedPanel as HTMLElement).getByText("GROUNDED ANSWER")).toBeInTheDocument();
    expect(within(groundedPanel as HTMLElement).getByText("YOUR DECISION INPUTS")).toBeInTheDocument();
    expect(within(groundedPanel as HTMLElement).getByText("LINC'S TAKE")).toBeInTheDocument();
    expect(within(groundedPanel as HTMLElement).getByText("NEXT STEP")).toBeInTheDocument();
    expect(screen.getByText(/latest available data and shows the source date/i)).toBeInTheDocument();
    expect(screen.getByText(/money shapes where you live, how you care for family/i)).toBeInTheDocument();
    expect(screen.getByText(/learning from real questions, improving it carefully/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your financial ecosystem is already here/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts + cash flow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investments, looked through" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home value, with a range" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates, markets + history" })).toBeInTheDocument();
    expect(screen.getByText(/fund fees, sector and country exposure/i)).toBeInTheDocument();
    expect(screen.getByText(/does not throw the whole data stack at every answer/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /financial data is never used to train ai models/i })).toBeInTheDocument();
    expect(screen.getByText(/no toggle.*no opt-out.*financial data stays yours/i)).toBeInTheDocument();
  });

  it("explains the data ecosystem on the features page without exposing a raw provider dump", async () => {
    const page = await MarketingSubpage({ params: Promise.resolve({ slug: ["features"] }) });
    render(page);

    expect(screen.getByRole("heading", { name: /a financial ecosystem built for the question/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts and cash flow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brokerage and portfolio detail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property value" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates and the economy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Long-view planning history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current public evidence" })).toBeInTheDocument();
    expect(screen.getByText(/up to 20 comparables/i)).toBeInTheDocument();
    expect(screen.getByText(/fund fees plus sector and country exposure/i)).toBeInTheDocument();
    expect(screen.getByText(/important numbers stay tied to facts/i)).toBeInTheDocument();
  });

  it("submits the redesigned contact form through the existing API", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    render(<MarketingContactForm />);
    await user.type(screen.getByLabelText("FIRST NAME"), "Ethan");
    await user.type(screen.getByLabelText("EMAIL"), "ethan@example.com");
    await user.selectOptions(screen.getByLabelText("WHAT CAN WE HELP WITH?"), "Technical support");
    await user.type(screen.getByLabelText("MESSAGE"), "The app is not loading for me.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(url).toBe("http://localhost:3000/auth/contact");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(payload).toEqual({
      email: "ethan@example.com",
      message: "Name: Ethan\nTopic: Technical support\n\nThe app is not loading for me.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Thanks for reaching out.");
  });

  it("shows API failures without discarding the form", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "Failed to send contact message" }),
    });

    render(<MarketingContactForm />);
    await user.type(screen.getByLabelText("EMAIL"), "ethan@example.com");
    await user.type(screen.getByLabelText("MESSAGE"), "Please help with my account.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to send contact message");
    expect(screen.getByLabelText("MESSAGE")).toHaveValue("Please help with my account.");
  });
});
