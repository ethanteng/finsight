import { render, screen } from '@testing-library/react';
import { generateMetadata } from '@/app/retirement-calculator/page';
import { RetirementCalculatorSeoContent } from '@/components/marketing/RetirementCalculatorSeoContent';
import { RETIREMENT_CALCULATOR_FAQ } from '@/lib/retirement-calculator-content';

describe('retirement calculator SEO', () => {
  it('puts the term the page ranks for in the title of every ad variant', async () => {
    const generic = await generateMetadata({ searchParams: Promise.resolve({}) });
    const variant = await generateMetadata({ searchParams: Promise.resolve({ retirement_age: '62' }) });

    expect(generic.title).toBe('When can I retire? Retirement Calculator | Ask Linc');
    expect(variant.title).toBe('Can I retire at 62? Retirement Calculator | Ask Linc');
  });

  it('keeps every variant on one canonical URL and one snippet-length description', async () => {
    for (const params of [{}, { retirement_age: '55' }, { utm_retirement_age: '70' }]) {
      const metadata = await generateMetadata({ searchParams: Promise.resolve(params) });

      expect(metadata.alternates?.canonical).toBe('https://asklinc.com/retirement-calculator');
      // Past ~160 characters a result truncates the sentence mid-claim.
      expect(String(metadata.description).length).toBeLessThanOrEqual(160);
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
    }
  });

  it('renders every FAQ answer the structured data marks up', () => {
    render(<RetirementCalculatorSeoContent />);

    // Rich results are dropped when the marked-up answer is not on the page, so
    // the schema's source array and the rendered copy have to stay one thing.
    for (const item of RETIREMENT_CALCULATOR_FAQ) {
      expect(screen.getByRole('heading', { name: item.question })).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
  });

  it('links out to the rest of the retirement cluster', () => {
    render(<RetirementCalculatorSeoContent />);

    for (const href of [
      '/retirement-answers',
      '/can-i-retire-at-55',
      '/can-i-retire-with-1-million',
      '/retirement-readiness',
      '/use-cases/retirement',
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });

  it('keeps the explainer content in the markup without running the model', () => {
    const { container } = render(<RetirementCalculatorSeoContent />);

    expect(screen.getByRole('heading', { name: /real history, not an average return/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what the model actually tests/i })).toBeInTheDocument();
    // One h1 belongs to the page, not this block.
    expect(container.querySelector('h1')).toBeNull();
  });
});
