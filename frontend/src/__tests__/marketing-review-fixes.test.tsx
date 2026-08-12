import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import { SiteHeader } from "@/components/marketing/SiteShell";

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
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink.closest(".nav-actions")).not.toBeNull();
    expect(signInLink.closest(".nav-links")).toBeNull();
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
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("submits the redesigned contact form through the existing API", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    render(<MarketingContactForm />);
    await user.type(screen.getByLabelText("FIRST NAME"), "Ethan");
    await user.type(screen.getByLabelText("EMAIL"), "ethan@example.com");
    await user.selectOptions(screen.getByLabelText("WHAT CAN WE HELP WITH?"), "Technical support");
    await user.type(screen.getByLabelText("MESSAGE"), "The demo is not loading for me.");
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
      message: "Name: Ethan\nTopic: Technical support\n\nThe demo is not loading for me.",
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
