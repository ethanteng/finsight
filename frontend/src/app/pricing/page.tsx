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
    description: `One plan. Start with 1 month free, then pay ${pricing.label} for unlimited questions, connected accounts, what-if scenarios, and Show the Math. Cancel anytime.`,
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
          <p className="subhero-copy">One plan. Full access. Cancel anytime.</p>
        </section>
        <section className="pricing-stage shell">
          <div className="price-argument">
            <p className="section-kicker">NO TIERS TO DECODE</p>
            <h2>Everything you need to work through the decision.</h2>
            <p>Ask as many follow-up questions as you need. Change assumptions. Compare what-ifs. Check the math.</p>
          </div>
          <article className="sub-price-card" data-cs-override-id="pricing-card-premium">
            <div className="price-card-top"><span>ASK LINC</span><b>EVERYTHING INCLUDED</b></div>
            <div className="price"><sup>{pricing.symbol}</sup>{pricing.amountText}<span>/{pricing.intervalLabel}</span></div>
            <p>First month free. Cancel anytime.</p>
            <ul>
              <li>Unlimited questions and follow-ups</li>
              <li>Unlimited connected accounts</li>
              <li>What-if scenarios</li>
              <li>Current rates and market context when needed</li>
              <li>Retirement and investment scenarios</li>
              <li>Show the Math on every answer</li>
              <li>Your financial data is never used to train AI models</li>
            </ul>
            <MarketingGetStartedButton className="button button-primary price-button" csOverrideId="cta-start-free-trial-pricing-premium" />
          </article>
        </section>
        <PageCta title="Bring the decision you are weighing to Linc." csOverrideId="cta-start-free-trial-mid" />
        <SiteFooter />
      </main>
    </>
  );
}
