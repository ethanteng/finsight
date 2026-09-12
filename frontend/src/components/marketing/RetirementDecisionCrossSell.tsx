import Link from "next/link";

const decisions = [
  {
    number: "01",
    title: "Reaching Coast FIRE",
    body: "Find your Coast FIRE number, then test what it could let you change about work and saving.",
    href: "/coast-fire-calculator",
  },
  {
    number: "02",
    title: "Buying a home",
    body: "Check the price and mortgage against the retirement date.",
    href: "/use-cases/home-buying",
  },
  {
    number: "03",
    title: "Taking parental leave",
    body: "See how time away changes cash flow and savings.",
    href: "/use-cases/family-planning",
  },
  {
    number: "04",
    title: "Changing jobs",
    body: "See whether your savings can cover an income gap before you move.",
    href: "/use-cases/career-change",
  },
] as const;

export function RetirementDecisionCrossSell() {
  return (
    <section className="retirement-cross-sell">
      <div className="shell">
        <div className="retirement-cross-sell-heading">
          <div>
            <p className="section-kicker">BEFORE RETIREMENT</p>
            <h2>Retirement starts with the decisions before it.</h2>
          </div>
          <p>Try Coast FIRE, a home, leave, or job change in the context of the same long-term plan.</p>
        </div>
        <div className="retirement-cross-sell-grid">
          {decisions.map((decision) => (
            <Link href={decision.href} key={decision.href}>
              <span>{decision.number}</span>
              <h3>{decision.title}</h3>
              <p>{decision.body}</p>
              <strong>Explore the decision <i aria-hidden="true">→</i></strong>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
