import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import MarketingHome from "@/components/marketing/MarketingHome";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";
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
    const answersLink = screen.getByRole("link", { name: "Retirement" });
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
    expect(within(mobileMenu).getByRole("link", { name: "What You Can Ask" })).toHaveAttribute("href", "/use-cases");
    expect(within(mobileMenu).getByRole("link", { name: "Retirement" })).toHaveAttribute("href", "/retirement-answers");
    expect(within(mobileMenu).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/vs");
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("leads with checkable financial answers and recognizable life decisions", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ask hard money questions. Get answers you can check.",
    );
    expect(screen.getByText(/connect your accounts and ask in your own words/i)).toBeInTheDocument();
    expect(screen.getByText(/stop trusting financial advice you can't verify/i)).toBeInTheDocument();
    expect(screen.getByText(/pasted bank statements into chatgpt and regretted it/i)).toBeInTheDocument();
    expect(USE_CASE_LINKS).toContainEqual({
      href: "/use-cases/family-planning",
      label: "Growing a Family",
    });
  });

  it("shows real product proof and compresses the supporting story", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { name: "See how every answer was worked out." })).toBeInTheDocument();
    expect(screen.getByText("Your numbers")).toBeInTheDocument();
    expect(screen.getByText("What Linc assumed")).toBeInTheDocument();
    expect(screen.getByText("Step-by-step math")).toBeInTheDocument();
    expect(screen.getByText("Built-in checks")).toBeInTheDocument();
    expect(screen.getByText("Up-to-date sources")).toBeInTheDocument();
    expect(screen.getByAltText(/show the math view/i)).toHaveAttribute("src", expect.stringContaining("show-the-math.png"));
    expect(screen.getByAltText(/sources view/i)).toHaveAttribute("src", expect.stringContaining("sources-evidence.png"));
    expect(screen.getByAltText(/retirement scenario answer/i)).toHaveAttribute("src", expect.stringContaining("decision-answer.png"));
    expect(screen.getByAltText(/net worth history/i)).toHaveAttribute("src", expect.stringContaining("net-worth-history.png"));
    expect(screen.getByAltText(/investment portfolio/i)).toHaveAttribute("src", expect.stringContaining("portfolio-overview.png"));
    expect(screen.getAllByText("Real product output. Account balances and identifying details changed.")).toHaveLength(1);
    expect(screen.queryByText(/calculation engine does the math/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /real answers, not generic advice/i })).toBeInTheDocument();
    expect(screen.getByText("A GENERAL CHATBOT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /no accounts.*general guidance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your accounts.*answer you can check/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /facts behind the answer/i })).toBeInTheDocument();
    ["Plaid", "SnapTrade", "RentCast", "FRED", "FMP", "Tiingo"].forEach((provider) => {
      expect(screen.getByText(provider)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /see what ask linc can connect/i })).toHaveAttribute("href", "/integrations");
    expect(screen.getByRole("heading", { name: /financial data is never used to train ai models/i })).toBeInTheDocument();
    expect(screen.getByText(/no toggle.*no opt-out.*financial data stays yours/i)).toBeInTheDocument();
    expect(screen.queryByText("THE DIFFERENCE")).not.toBeInTheDocument();
    expect(screen.queryByText("LINC'S REASONING")).not.toBeInTheDocument();
  });

  it("explains the connected financial picture on the features page without exposing a raw provider dump", async () => {
    const page = await MarketingSubpage({ params: Promise.resolve({ slug: ["features"] }) });
    render(page);

    expect(screen.getByRole("heading", { name: /bring the whole money picture into one answer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts and cash flow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investments and retirement accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property value" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates and the economy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Long-term market history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current rules and news" })).toBeInTheDocument();
    expect(screen.getByText(/nearby comparable homes/i)).toBeInTheDocument();
    expect(screen.getByText(/fund fees and where your money is invested/i)).toBeInTheDocument();
    expect(screen.getByText(/important numbers stay tied to their sources/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see what linc can connect and use/i })).toHaveAttribute("href", "/integrations");
  });

  it("presents integrations as a user-facing money picture", () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your finances live in many places. Your answer shouldn't.",
    );
    expect(screen.getByRole("heading", { name: "Cash flow, cards, and loans" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "See what you own and where the risk is" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The parts that do not live at a bank" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates and borrowing costs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Long-term market history" })).toBeInTheDocument();
    expect(screen.getByText(/dated home-value estimate and range/i)).toBeInTheDocument();
    expect(screen.getByText(/fund fees and where each fund invests/i)).toBeInTheDocument();
    expect(screen.getByText(/does not use every available data point just because it can/i)).toBeInTheDocument();
    const integrationsTable = screen.getByRole("table", {
      name: /ask linc integrations, the financial data used from each source, and example questions/i,
    });
    expect(within(integrationsTable).getAllByRole("row")).toHaveLength(11);
    [
      "Plaid",
      "SnapTrade",
      "Financial Modeling Prep",
      "Tiingo",
      "FRED",
      "Kenneth French Data Library",
      "Robert Shiller",
      "Massive",
      "Brave Search",
      "RentCast",
    ].forEach((integration) => expect(within(integrationsTable).getByText(integration)).toBeInTheDocument());
    expect(within(integrationsTable).getByText(/what is the current ira contribution limit/i)).toBeInTheDocument();
    expect(within(integrationsTable).getByText(/what is my home worth, how uncertain is that estimate/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see how your data is protected/i })).toHaveAttribute("href", "/how-we-protect-your-data");
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
