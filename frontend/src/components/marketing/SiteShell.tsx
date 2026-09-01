import Link from "next/link";
import { PRIMARY_NAV_LINKS } from "@/lib/site-nav";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { MarketingMobileMenu } from "./MarketingMobileMenu";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="nav shell" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Ask Linc home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Ask Linc</span>
        </Link>
        <div className="nav-links">
          {PRIMARY_NAV_LINKS.map((item) => (
            <Link href={item.href} key={item.href} data-cs-override-id={item.csOverrideId}>{item.label}</Link>
          ))}
        </div>
        <div className="nav-actions">
          <Link className="nav-sign-in" href="/login" data-cs-override-id="nav-sign-in">Sign in</Link>
          <MarketingGetStartedButton trackingLocation="header" csOverrideId="cta-start-free-trial-nav" />
          <MarketingMobileMenu />
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="footer-inner expanded-footer shell">
        <div className="footer-brand">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">L</span>
            <span>Ask Linc</span>
          </Link>
          <p>Financial planning that starts with the decision you&apos;re trying to make.</p>
          <MarketingGetStartedButton className="footer-cta-link" trackingLocation="footer" csOverrideId="cta-start-free-trial-footer" />
        </div>
        <div className="footer-column">
          <b>PRODUCT</b>
          <Link href="/features">How It Works</Link>
          <Link href="/use-cases">What You Can Ask</Link>
          <Link href="/integrations">Accounts &amp; Data</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/retirement-answers">Retirement</Link>
        </div>
        <div className="footer-column">
          <b>COMPARE</b>
          <Link href="/vs/monarch">vs Monarch</Link>
          <Link href="/vs/origin">vs Origin</Link>
          <Link href="/vs/chatgpt">vs ChatGPT</Link>
          <Link href="/vs/portfoliopilot">vs PortfolioPilot</Link>
          <Link href="/vs/boldin">vs Boldin</Link>
        </div>
        <div className="footer-column">
          <b>COMPANY</b>
          <Link href="/about" data-cs-override-id="nav-about-footer">About</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div className="footer-column">
          <b>TRUST</b>
          <Link href="/trust">Show the Math</Link>
          <Link href="/how-we-protect-your-data">Privacy &amp; Security</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <div className="footer-bottom shell">
        <span>© {new Date().getFullYear()} Ethan Teng Consulting LLC</span>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </div>
    </footer>
  );
}

export function PageCta({
  title = "What are you trying to figure out?",
  csOverrideId,
}: {
  title?: string;
  csOverrideId: string;
}) {
  return (
    <section className="page-cta">
      <div className="page-cta-inner shell">
        <p className="section-kicker light">START WITH THE DECISION</p>
        <h2>{title}</h2>
        <MarketingGetStartedButton className="button button-primary" trackingLocation="page_cta" csOverrideId={csOverrideId} />
      </div>
    </section>
  );
}
