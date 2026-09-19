import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import MarketingSubpage from '@/components/marketing/MarketingSubpage';
import { buildFaqItems, buildFaqPageSchema } from '@/data/faq';
import { buildPricing } from '@/config/pricing';

jest.mock('@/lib/pricing', () => ({
  getPricing: async () => ({ ...jest.requireActual('@/config/pricing').FALLBACK_PRICING }),
}));

describe('public page search contracts', () => {
  it('only marks up content present on the simplified homepage', async () => {
    const { container } = render(await Home());
    const schemas = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((node) => JSON.parse(node.textContent || '{}'));
    expect(schemas.some((schema) => schema['@type'] === 'Product')).toBe(true);
    expect(schemas.some((schema) => schema['@type'] === 'FAQPage')).toBe(false);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Pricing' })[0]).toHaveAttribute('href', '/pricing');
  });

  it('keeps every FAQ schema answer visible and uses the same resolved price', async () => {
    const pricing = buildPricing({ amount: 15, currency: 'usd', interval: 'month', live: true });
    const page = await MarketingSubpage({ params: Promise.resolve({ slug: ['faq'] }), pricing });
    const { container } = render(page);
    const schema = buildFaqPageSchema(buildFaqItems(pricing));
    const details = [...container.querySelectorAll('.faq-list details')];
    expect(details).toHaveLength(schema.mainEntity.length);
    schema.mainEntity.forEach((question, i) => {
      expect(details[i].querySelector('summary')).toHaveTextContent(question.name);
      expect(details[i].querySelector('p')?.textContent).toBe(question.acceptedAnswer.text);
    });
    expect(screen.getByText('What does $15/month include?')).toBeInTheDocument();
  });
});
