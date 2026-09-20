import type { Metadata } from "next";
import Link from "next/link";
import StructuredData from "@/components/StructuredData";
import { MarketingGetStartedButton } from "@/components/marketing/MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteShell";
import StaticProductDemo from "@/components/marketing/StaticProductDemo";
import { TRIAL_CTA_MICROCOPY } from "@/components/marketing/trial-copy";
import { DEMO_FAQS } from "@/lib/demo-content";
import { buildMarketingMetadata } from "@/lib/seo";

const canonical = "https://asklinc.com/demo";
const description =
  "Explore an interactive AI financial planning software demo. See how Ask Linc connects your finances to calculations, assumptions, sources, and a plan.";

export const metadata: Metadata = {
  ...buildMarketingMetadata({
    title: "Interactive AI Financial Planning Software Demo | Ask Linc",
    description,
    path: "/demo",
    imageAlt: "Interactive Ask Linc financial planning software demo",
  }),
  keywords: [
    "financial planning software demo",
    "AI financial planning software",
    "interactive financial planning demo",
    "personal financial planning software",
    "self-directed financial planning software",
  ],
};

const applicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Ask Linc Interactive Demo",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: canonical,
  description,
  provider: {
    "@type": "Organization",
    name: "Ask Linc",
    url: "https://asklinc.com",
  },
  featureList: [
    "Financial questions grounded in connected financial context",
    "Inspectable calculations and assumptions",
    "Source and data provenance",
    "What-if financial planning",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: DEMO_FAQS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ask Linc", item: "https://asklinc.com" },
    { "@type": "ListItem", position: 2, name: "Interactive demo", item: canonical },
  ],
};

export default function DemoPage() {
  return (
    <main className="marketing-site subpage demo-landing-page">
      <StructuredData data={applicationSchema} />
      <StructuredData data={faqSchema} />
      <StructuredData data={breadcrumbSchema} />
      <SiteHeader />

      <section className="demo-landing-hero shell">
        <div className="demo-landing-hero-copy">
          <p className="section-kicker">INTERACTIVE PRODUCT DEMO</p>
          <h1>Your question. <em>See where Linc takes it.</em></h1>
          <p>
            Retire early, take a pay cut, or buy a bigger home. See how Linc works through each decision, with the numbers behind its answer. No account needed.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="#interactive-demo">
              Explore the demo <span aria-hidden="true">↓</span>
            </Link>
          </div>
          <p className="demo-sample-note"><span aria-hidden="true">✓</span> Sample data. Real product experience. No account required.</p>
        </div>

        <aside className="demo-landing-map" aria-label="What the interactive demo includes">
          <span>WHAT YOU CAN EXPLORE</span>
          <ol>
            <li><b>01</b><div><strong>A financial decision</strong><small>Read the answer and practical next steps.</small></div></li>
            <li><b>02</b><div><strong>The work behind it</strong><small>Open the math, assumptions, checks, and sources.</small></div></li>
            <li><b>03</b><div><strong>The connected context</strong><small>See how finances and accounts shape the plan.</small></div></li>
          </ol>
        </aside>
      </section>

      <section className="demo-experience-section" id="interactive-demo" aria-labelledby="demo-experience-title">
        <div className="shell">
          <div className="demo-experience-heading">
            <div>
              <p className="section-kicker">CLICK THROUGH THE PRODUCT</p>
              <h2 id="demo-experience-title">Start with the decision. <em>Then inspect the answer.</em></h2>
            </div>
            <p>
              Try the tabs, switch between questions, and explore the sample accounts. You can browse the example, but you can’t submit a new question.
            </p>
          </div>
          <StaticProductDemo anchorId={null} trackAnalytics />
          <div className="demo-experience-cta">
            <div>
              <strong>Ready to use your own numbers?</strong>
              <span>Your first month is free. No credit card required.</span>
            </div>
            <MarketingGetStartedButton
              className="button button-primary"
              trackingLocation="demo_after_experience"
              csOverrideId="cta-start-free-trial-demo-after-experience"
              label="Try it with my finances"
            />
          </div>
        </div>
      </section>

      <section className="page-section demo-value-section shell" aria-labelledby="demo-value-title">
        <div className="editorial-heading">
          <p className="section-kicker">WHAT MAKES IT DIFFERENT</p>
          <h2 id="demo-value-title">See the answer. <em>Then check the work.</em></h2>
        </div>
        <div className="demo-value-grid">
          <article>
            <span>01 / CONTEXT</span>
            <h3>Your finances stay attached to the question.</h3>
            <p>Cash, investments, property, debt, spending, and household context can inform the same decision.</p>
            <Link href="/integrations">Explore accounts and data <i aria-hidden="true">→</i></Link>
          </article>
          <article>
            <span>02 / CALCULATIONS</span>
            <h3>Dedicated calculators run the numbers.</h3>
            <p>For supported planning questions, calculations run outside the language model and remain available to inspect.</p>
            <Link href="/features">See how Ask Linc works <i aria-hidden="true">→</i></Link>
          </article>
          <article>
            <span>03 / VERIFICATION</span>
            <h3>Assumptions, checks, and sources stay visible.</h3>
            <p>See what the answer used, what had to be assumed, and which current facts or sources supported it.</p>
            <Link href="/trust">See how answers are checked <i aria-hidden="true">→</i></Link>
          </article>
        </div>
      </section>

      <section className="demo-trust-band">
        <div className="shell demo-trust-band-inner">
          <div>
            <p className="section-kicker light">PRIVATE BY DESIGN</p>
            <h2>Explore now. <em>Connect only when you are ready.</em></h2>
          </div>
          <div>
            <p>The demo uses sample data. When you use Ask Linc, account connections are read-only and your financial data is never used to train AI models.</p>
            <Link className="light-link" href="/how-we-protect-your-data">See how your data is protected <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="page-section demo-faq-section shell" aria-labelledby="demo-faq-title">
        <div className="demo-faq-heading">
          <p className="section-kicker">INTERACTIVE DEMO FAQ</p>
          <h2 id="demo-faq-title">Before you explore.</h2>
        </div>
        <div className="demo-faq-list">
          {DEMO_FAQS.map((item) => (
            <details key={item.question}>
              <summary>{item.question}<span aria-hidden="true">+</span></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="page-cta">
        <div className="page-cta-inner shell">
          <p className="section-kicker light">START WITH YOUR DECISION</p>
          <h2>What would you like to ask about your finances?</h2>
          <MarketingGetStartedButton
            className="button button-primary"
            trackingLocation="demo_page_cta"
            csOverrideId="cta-start-free-trial-demo-page-cta"
            label="Try it with my finances"
          />
          <small>{TRIAL_CTA_MICROCOPY}</small>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
