import type { Metadata } from 'next';
import StructuredData from '../../components/StructuredData';
import { buildProductOfferSchema } from '../../data/faq';
import { getPricing } from '../../lib/pricing';
import { MarketingGetStartedButton } from '@/components/marketing/MarketingGetStartedButton';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';
import { buildMarketingMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getPricing();
  return buildMarketingMetadata({
    title: `Ask Linc Pricing — 1 Month Free, Then ${pricing.label}`,
    description: `One self-directed planning model. Start with 1 month free, then pay ${pricing.label} for scenarios, deterministic calculations, and inspectable assumptions.`,
    path: '/pricing',
    imageAlt: 'Ask Linc pricing',
  });
}

export default async function PricingPage() {
  const pricing = await getPricing();
  return (
    <>
      <StructuredData data={buildProductOfferSchema(pricing)} />
      <main className="marketing-site subpage pricing-page">
        <SiteHeader />
        <section className="subhero centered-subhero shell">
          <p className="section-kicker">SIMPLE PRICING</p>
          <h1>One month free. Then <em>{pricing.dollars} a {pricing.intervalLabel}.</em></h1>
          <p className="subhero-copy">Pay for an ongoing planning model and scenario engine—not another chatbot window. One plan. Full access. Cancel anytime.</p>
        </section>
        <section className="pricing-stage shell">
          <div className="price-argument">
            <p className="section-kicker">NO TIERS TO DECODE</p>
            <h2>Self-directed planning without maintaining the spreadsheet.</h2>
            <p>Go from a question to a rigorous model, ask as many follow-ups as you need, change assumptions, compare what-ifs, and check the math.</p>
          </div>
          <article className="sub-price-card" data-cs-override-id="pricing-card-premium">
            <div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div>
            <div className="price"><sup>{pricing.symbol}</sup>{pricing.amountText}<span>/{pricing.intervalLabel}</span></div>
            <p>First month free. Cancel anytime.</p>
            <ul>
              <li>An ongoing model built from your real financial state</li>
              <li>Unlimited questions and conversational follow-ups</li>
              <li>What-if scenarios and deterministic calculations</li>
              <li>Current rates and market context when needed</li>
              <li>Retirement, investment, and cross-life decision modeling</li>
              <li>Inspectable assumptions and Show the Math</li>
              <li>Read-only account and property inputs</li>
              <li>Your financial data is never used to train AI models</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" label="Start planning" />
          </article>
        </section>
        <PageCta title="Build the plan once. Keep testing the decisions." label="Start planning" csOverrideId="cta-start-free-trial-mid" />
        <SiteFooter />
      </main>
    </>
  );
}
