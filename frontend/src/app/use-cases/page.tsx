import type { Metadata } from 'next';
import Link from 'next/link';
import { PageCta, SiteFooter, SiteHeader } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'Self-Directed Financial Planning Use Cases | Ask Linc',
  description: 'See what your money lets you do next—from Coast FIRE and retirement to working less, buying a home, growing a family, and changing investments.',
  keywords: ['self-directed financial planning', 'Coast FIRE', 'financial optionality', 'retirement planning', 'home buying', 'career change', 'parental leave planning', 'portfolio analysis'],
  alternates: { canonical: 'https://asklinc.com/use-cases' },
  openGraph: {
    title: 'What You Can Ask | Ask Linc',
    description: 'See what your money lets you do next. Start with the decision and stress-test it against the rest of your financial life.',
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
    number: '01', label: 'COAST FIRE & OPTIONALITY', tone: 'lime', href: '/coast-fire-calculator',
    title: 'See what your savings could let you change before retirement.',
    question: 'Have I reached Coast FIRE—and can I really coast?',
  },
  {
    number: '02', label: 'RETIREMENT', tone: 'mint', href: '/retirement-calculator',
    title: 'Know what makes retirement work before you pick the date.',
    question: 'Could we retire two years earlier without making the plan too tight?',
  },
  {
    number: '03', label: 'BUYING A HOME', tone: 'blue', href: '/use-cases/home-buying',
    title: 'Find the price that fits the rest of your life.',
    question: 'Can we afford this house without becoming house poor?',
  },
  {
    number: '04', label: 'GROWING A FAMILY', tone: 'sand', href: '/use-cases/family-planning',
    title: 'See what changes before the baby arrives.',
    question: 'Can one of us take leave and still afford childcare?',
  },
  {
    number: '05', label: 'INVESTMENTS', tone: 'lime', href: '/use-cases/portfolio-analysis',
    title: 'Make sure your portfolio fits the plan.',
    question: 'Are we taking more investment risk than we actually need?',
  },
  {
    number: '06', label: 'CAREER CHANGE & TIME OFF', tone: 'mint', href: '/use-cases/career-change',
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
        <h1>Know what your money lets you do <em>next.</em></h1>
        <p className="subhero-copy">Coast toward retirement, work less, spend more, buy a home, grow a family, or change investments. Ask the question in your own words; Linc turns it into a model you can stress-test.</p>
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
          <h2>A Coast FIRE number is only the start of the decision.</h2>
          <p><Link href="/coast-fire-calculator">The free Coast FIRE calculator</Link> answers whether your savings could grow to a retirement target without more contributions. Ask Linc helps model the consequential next question: what can you safely change about work, saving, spending, or retirement?</p>
        </div>
      </section>
      <PageCta title="Turn your next move into a plan you can stress-test." label="Plan my next move" csOverrideId="cta-start-free-trial-mid" />
      <SiteFooter />
    </main>
  );
}
