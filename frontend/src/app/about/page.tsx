import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'About | Why Ask Linc Exists',
  description: 'Ask Linc was built to help people answer consequential money questions using their real financial picture—and inspect the work behind the answer.',
  alternates: { canonical: 'https://asklinc.com/about' },
  openGraph: {
    title: 'About | Why Ask Linc Exists',
    description: 'Financial planning that starts with the decision you are trying to make.',
    type: 'website',
    url: 'https://asklinc.com/about',
    siteName: 'Ask Linc',
  },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <main className="marketing-site subpage about-page">
      <SiteHeader />
      <section className="subhero shell about-hero">
        <div>
          <p className="section-kicker">WHY ASK LINC EXISTS</p>
          <h1>I needed to answer <em>one hard money question.</em></h1>
        </div>
        <p className="about-lede">Financial planning should start with the decision you are trying to make—not a dashboard you have to interpret or a model you have to build first.</p>
      </section>

      <section className="founder-origin shell">
        <div className="founder-portrait">
          <span className="founder-portrait-photo"><Image src="/ethan-teng.jpg" alt="Ethan Teng, founder of Ask Linc" fill sizes="150px" priority /></span>
          <div>
            <b>Ethan Teng</b>
            <small>FOUNDER · ASK LINC</small>
            <a className="founder-linkedin" href="https://www.linkedin.com/in/ethanteng/" target="_blank" rel="noopener noreferrer"><Image src="/logos/linkedin.png" alt="" width={16} height={16} /><span>Connect on LinkedIn</span></a>
          </div>
        </div>
        <div className="origin-copy">
          <p className="section-kicker">THE ORIGIN</p>
          <h2>It started with a layoff—and a bad idea.</h2>
          <p className="lead-paragraph">After getting laid off, I pasted my own bank statements into ChatGPT to figure out what I could afford to do next.</p>
          <p>The answers sounded convincing. But I could not tell which numbers were facts, which were assumptions, or whether the math actually held together.</p>
          <p>I did not want another place to watch my money. I wanted to ask the hard question in front of me, have the rest of my financial life brought into the answer, and be able to inspect the work.</p>
          <p>So I built Ask Linc.</p>
        </div>
      </section>

      <section className="page-section values-band">
        <div className="shell">
          <div className="editorial-heading">
            <p className="section-kicker">HOW WE BUILD</p>
            <h2>The product follows four simple rules.</h2>
          </div>
          <div className="belief-grid">
            <article><span>01</span><h3>Start with the decision</h3><p>Ask what you are trying to decide before asking you to learn a new financial planning workflow.</p></article>
            <article><span>02</span><h3>Keep the whole financial picture in view</h3><p>A house, a career break, a child, investments, and retirement share the same money.</p></article>
            <article><span>03</span><h3>Show the tradeoffs</h3><p>A useful answer says what works, what feels tight, and what could change the result.</p></article>
            <article><span>04</span><h3>Show the math</h3><p>You should be able to see the numbers, assumptions, calculations, checks, and sources behind the answer.</p><Link className="belief-link" href="/trust">See how answers are checked →</Link></article>
          </div>
        </div>
      </section>

      <PageCta title="What decision are you trying to make?" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
