import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="nav shell" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Ask Linc home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Ask Linc</span>
        </Link>
        <div className="nav-links">
          <Link href="/features">Features</Link>
          <Link href="/use-cases">Use Cases</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
        </div>
        <a className="button button-small button-dark" href="https://asklinc.com/demo">
          Ask Linc free <span aria-hidden="true">→</span>
        </a>
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
          <a className="footer-demo" href="https://asklinc.com/demo">Try the demo →</a>
        </div>
        <div className="footer-column">
          <b>PRODUCT</b>
          <Link href="/features">Features</Link>
          <Link href="/use-cases">Use Cases</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
        </div>
        <div className="footer-column">
          <b>COMPANY</b>
          <Link href="/about">About</Link>
          <Link href="/blog">Journal</Link>
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
        <a className="button button-primary" href="https://asklinc.com/demo">Ask Linc free <span aria-hidden="true">→</span></a>
        <small>Sample data included · No credit card required</small>
      </div>
    </section>
  );
}
