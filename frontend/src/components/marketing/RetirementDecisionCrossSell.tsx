import Link from "next/link";

const decisions = [
  {
    number: "01",
    title: "Buying a home",
    body: "Check the price and mortgage against the retirement date.",
    href: "/use-cases/home-buying",
  },
  {
    number: "02",
    title: "Taking parental leave",
    body: "See how time away changes cash flow and savings.",
    href: "/use-cases/family-planning",
  },
  {
    number: "03",
    title: "Changing jobs",
    body: "See whether your savings can cover an income gap before you move.",
    href: "/use-cases/financial-stress-testing",
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
          <p>Try a home, leave, or job change using the same accounts and goals.</p>
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
