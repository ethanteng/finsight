import type { Metadata } from 'next';
import Link from 'next/link';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'What You Can Ask | Ask Linc',
  description: 'Start with the financial decision you are trying to make: a home, growing family, career change, investments, or retirement.',
  keywords: ['financial planning', 'retirement planning', 'home buying', 'career change', 'parental leave planning', 'portfolio analysis'],
  alternates: { canonical: 'https://asklinc.com/use-cases' },
  openGraph: {
    title: 'What You Can Ask | Ask Linc',
    description: 'Start with the decision. Ask Linc tests it against the rest of your financial life.',
    type: 'website',
    url: 'https://asklinc.com/use-cases',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc financial decision use cases' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What You Can Ask | Ask Linc',
    description: 'Start with the decision. Ask Linc tests it against the rest of your financial life.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

const useCases = [
  {
    number: '01', label: 'RETIREMENT', tone: 'mint', href: '/use-cases/retirement',
    title: 'Know what makes retirement work before you pick the date.',
    question: 'Could we retire two years earlier without making the plan too tight?',
  },
  {
    number: '02', label: 'BUYING A HOME', tone: 'blue', href: '/use-cases/home-buying',
    title: 'Find the price that fits the rest of your life.',
    question: 'Can we afford this house without becoming house poor?',
  },
  {
    number: '03', label: 'GROWING A FAMILY', tone: 'sand', href: '/use-cases/family-planning',
    title: 'See what changes before the baby arrives.',
    question: 'Can one of us take leave and still afford childcare?',
  },
  {
    number: '04', label: 'INVESTMENTS', tone: 'lime', href: '/use-cases/portfolio-analysis',
    title: 'Make sure your portfolio fits the plan.',
    question: 'Are we taking more investment risk than we actually need?',
  },
  {
    number: '05', label: 'CAREER CHANGE & TIME OFF', tone: 'mint', href: '/use-cases/career-change',
    title: 'Know what stepping away from work really changes.',
    question: 'Can I take a year off without setting retirement back?',
  },
] as const;

export default function UseCasesRoute() {
  return (
    <main className="marketing-site subpage use-cases-page">
      <SiteHeader />
      <section className="subhero centered-subhero shell">
        <p className="section-kicker">WHAT YOU CAN ASK</p>
        <h1>Start with what you&apos;re <em>trying to decide.</em></h1>
        <p className="subhero-copy">A home, a growing family, work, investments, or retirement. Ask the question in your own words; Linc checks it against the rest of your financial life.</p>
      </section>
      <section className="use-case-index shell">
        {useCases.map((item) => (
          <Link href={item.href} className={`use-case-tile ${item.tone}`} key={item.href}>
            <span>{item.number} / {item.label}</span>
            <h2>{item.title}</h2>
            <div className="use-case-question"><small>ASK LINC</small><b>“{item.question}”</b></div>
            <strong>Explore this decision <i>→</i></strong>
          </Link>
        ))}
      </section>
      <section className="use-case-bridge">
        <div className="shell">
          <p className="section-kicker">WHY THE WHOLE PLAN MATTERS</p>
          <h2>A home, a child, a career change, and retirement share the same money.</h2>
          <p>One decision can change cash, spending, debt, investments, and the goals that come after it. Linc keeps those consequences in the same answer. Before testing a decision, compare <Link href="/blog/average-american-savings">how much Americans actually have in savings</Link>.</p>
        </div>
      </section>
      <PageCta title="What are you trying to figure out?" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
