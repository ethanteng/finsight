import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'About Ask Linc | Why I Built a Financial Planning Assistant',
  description: 'Why Ethan Teng built Ask Linc, and its one rule: the AI never does the math. A calculation engine runs the numbers, and every answer shows its work.',
  alternates: { canonical: 'https://asklinc.com/about' },
  openGraph: {
    title: 'About Ask Linc | Why I Built a Financial Planning Assistant',
    description: 'Ask Linc has one rule: the AI never does the math.',
    type: 'website',
    url: 'https://asklinc.com/about',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Why Ask Linc exists' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Ask Linc | Why I Built a Financial Planning Assistant',
    description: 'Ask Linc has one rule: the AI never does the math.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <main className="marketing-site subpage about-page">
      <SiteHeader />
      <section className="subhero shell about-hero">
        <div>
          <p className="section-kicker">ABOUT ASK LINC</p>
          <h1>Before you trust Ask&nbsp;Linc, <em>you should know who built it.</em></h1>
        </div>
        <p className="about-lede">I’m Ethan Teng. Here’s why I built it, and the one rule it follows.</p>
      </section>

      <section className="founder-origin shell">
        <div className="founder-portrait">
          <span className="founder-portrait-photo"><Image src="/images/ethan-teng-cartoon.webp" alt="Stylized portrait of Ethan Teng" fill sizes="150px" priority /></span>
          <div>
            <b>Ethan Teng</b>
            <small>FOUNDER · ASK LINC</small>
            <a className="founder-linkedin" href="https://www.linkedin.com/in/ethanteng/" target="_blank" rel="noopener noreferrer"><Image src="/logos/linkedin.png" alt="" width={16} height={16} /><span>Connect on LinkedIn</span></a>
          </div>
        </div>
        <article className="origin-copy about-story">
          <p className="section-kicker">THE STORY</p>
          <p className="origin-story-lead">After I got laid off, I pasted my bank statements into ChatGPT to figure out <strong>how long my savings would last without a job.</strong></p>
          <p>The answer sounded convincing. But my real numbers, its guesses and some shaky math were all blended together, and I couldn’t tell which was which.</p>
          <p>I should have known better. I graduated from Stanford and spent a long career where software meets money, in banking and fintech. It taught me something I’ve never shaken: when money is involved, “mostly right” is the same as wrong.</p>
          <p>And it wasn’t just me. AI chatbots have gotten very good at sounding smart about money. I watched people ask them serious retirement questions and get polished, confident answers. When I checked the math, it often didn’t hold up.<sup>*</sup></p>
          <small className="origin-story-footnote">* 35 of 100 ChatGPT Search finance answers were incomplete, misleading, or wrong. In another test, a CFP® professional found a retirement plan more than $500K short. <Link href="/blog/ai-financial-calculator">Read the analysis →</Link></small>
          <p>Spreadsheets get the math right, but every new “what if” means another tab.</p>
          <p className="about-story-turn">Ask Linc is the tool I wanted: <strong>plain-English questions, math you can check.</strong></p>

          <section className="about-rule" aria-labelledby="about-rule-heading">
            <small>SO ASK LINC HAS ONE RULE</small>
            <h2 id="about-rule-heading">The AI never does the math.</h2>
            <p>A calculation engine runs the numbers on your real accounts. The AI explains the result. Every answer shows its inputs and assumptions, so you can check the work yourself.</p>
            <Link href="/trust">See how answers are checked →</Link>
          </section>

          <section className="about-signoff" aria-labelledby="about-signoff-heading">
            <h2 id="about-signoff-heading">Ask Linc is small, <em>which means you get me.</em></h2>
            <p>If something is confusing, wrong or missing, email me at <a href="mailto:ethan@asklinc.com">ethan@asklinc.com</a>. I read and answer every message myself.</p>
            <p className="about-signature">— Ethan</p>
          </section>
        </article>
      </section>

      <PageCta title="What decision are you trying to make?" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
