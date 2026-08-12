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
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </div>
        <div className="nav-actions">
          <Link className="nav-sign-in" href="/login">Sign in</Link>
          <MarketingGetStartedButton />
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
          <p>Decision-ready answers grounded in your real finances, current context, and calculations you can inspect.</p>
          <MarketingGetStartedButton className="footer-demo" />
        </div>
        <div className="footer-column">
          <b>PRODUCT</b>
          <Link href="/features">Features</Link>
          <Link href="/use-cases">Use Cases</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
        </div>
        <div className="footer-column">
          <b>COMPARE</b>
          <Link href="/vs/origin">vs Origin</Link>
          <Link href="/vs/portfoliopilot">vs PortfolioPilot</Link>
          <Link href="/vs/monarch">vs Monarch</Link>
        </div>
        <div className="footer-column">
          <b>COMPANY</b>
          <Link href="/about">About</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div className="footer-column">
          <b>TRUST</b>
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

export function PageCta({ title = "Bring Ask Linc your hardest money question." }: { title?: string }) {
  return (
    <section className="page-cta">
      <div className="page-cta-inner shell">
        <p className="section-kicker light">SEE THE ANSWER FOR YOURSELF</p>
        <h2>{title}</h2>
        <MarketingGetStartedButton className="button button-primary" />
      </div>
    </section>
  );
}
