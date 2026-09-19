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
    description: `Try Ask Linc free for 30 days, with no credit card. Continue for ${pricing.label} to connect your finances, ask questions, and explore your plan.`,
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
          <p className="subhero-copy">Connect your finances. Ask your questions. Keep exploring. One plan, full access, and no credit card to start.</p>
        </section>
        <section className="pricing-stage shell">
          <div className="price-argument">
            <p className="section-kicker">NO TIERS TO DECODE</p>
            <h2>More clarity.<br />Less spreadsheet.</h2>
            <p>Linc brings your finances together and works through the questions that matter to you. Change an assumption whenever life changes.</p>
          </div>
          <article className="sub-price-card" data-cs-override-id="pricing-card-premium">
            <div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div>
            <div className="price"><sup>{pricing.symbol}</sup>{pricing.amountText}<span>/{pricing.intervalLabel}</span></div>
            <p>First month free. Cancel anytime.</p>
            <ul>
              <li>Your connected accounts in one financial picture</li>
              <li>Unlimited questions and follow-ups</li>
              <li>What-if scenarios and retirement stress tests</li>
              <li>Inputs, assumptions, math, and sources you can inspect</li>
              <li>Read-only access and no AI training on your financial data</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" label="Start free" />
          </article>
        </section>
        <PageCta title="What would you like to figure out?" label="Start free" csOverrideId="cta-start-free-trial-mid" />
        <SiteFooter />
      </main>
    </>
  );
}
