/**
 * `csOverrideId` is the Contentsquare `data-cs-override-id` for the link.
 * It pins the element's identity independent of its position in the DOM, so
 * a markup change cannot silently unbind the goal or heatmap zone attached
 * to it. The desktop nav and the mobile menu render this list twice, so the
 * mobile copies get their own suffixed values — one value per placement,
 * never shared, or the two placements' data merges.
 */
export const PRIMARY_NAV_LINKS = [
  { href: '/features', label: 'How It Works', csOverrideId: 'nav-features' },
  { href: '/use-cases', label: 'What You Can Ask', csOverrideId: 'nav-what-you-can-ask' },
  { href: '/retirement-answers', label: 'Retirement', csOverrideId: 'nav-retirement' },
  { href: '/vs', label: 'Compare', csOverrideId: 'nav-compare' },
  { href: '/pricing', label: 'Pricing', csOverrideId: 'nav-pricing' },
];

export const USE_CASE_LINKS = [
  { href: '/use-cases/home-buying', label: 'Buying a Home' },
  { href: '/use-cases/family-planning', label: 'Growing a Family' },
  { href: '/use-cases/career-change', label: 'Career Change & Time Off' },
  { href: '/use-cases/retirement', label: 'Retirement' },
  { href: '/use-cases/portfolio-analysis', label: 'Investments' },
];

export const COMPARE_LINKS = [
  { href: '/vs/monarch', label: 'vs Monarch' },
  { href: '/vs/origin', label: 'vs Origin' },
  { href: '/vs/chatgpt', label: 'vs ChatGPT' },
  { href: '/vs/portfoliopilot', label: 'vs PortfolioPilot' },
  { href: '/vs/boldin', label: 'vs Boldin' },
];
