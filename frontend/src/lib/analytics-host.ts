import {
  INTERNAL_ANALYTICS_BROWSER_KEY,
  isInternalAnalyticsBrowser,
} from './internal-analytics';

/**
 * Analytics is production-only.
 *
 * The GTM container carries the Contentsquare tag, so any environment that
 * loads GTM records itself into the production analytics project. Dev servers
 * and preview deploys were doing exactly that, inflating session counts and
 * polluting heatmaps and goal conversions with traffic that is not real users.
 */

/** The only registrable domain whose traffic belongs in analytics. */
export const ANALYTICS_DOMAIN = "asklinc.com";

/**
 * True only for the production site: `asklinc.com` and its subdomains.
 *
 * Stated as an allowlist rather than a blocklist so it excludes `localhost`,
 * `127.0.0.1`, and `*.vercel.app` previews without enumerating them — and
 * excludes the next preview host nobody thought of, too. Suffix matching is
 * anchored on a leading dot, so lookalikes like `notasklinc.com` and
 * `asklinc.com.example.net` do not qualify.
 */
export function isAnalyticsHost(hostname: string): boolean {
  return hostname === ANALYTICS_DOMAIN || hostname.endsWith(`.${ANALYTICS_DOMAIN}`);
}

/**
 * The GTM loader, with the host check built in.
 *
 * The check has to live inside the injected script rather than around it:
 * pages are prerendered at build time, so the server does not know which host
 * will serve them, and the tag must still load in `<head>` before hydration to
 * capture the start of the session. The condition below is the inline
 * equivalent of isAnalyticsHost(), built from the same constant.
 */
export function buildGoogleTagManagerSnippet(containerId: string): string {
  return `
(function(w,d,s,l,i,h,k){
var n=w.location.hostname;if(n!==h&&!n.endsWith('.'+h))return;
try{if(w.localStorage&&w.localStorage.getItem(k)==='1')return;}catch(e){}
w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(containerId)},${JSON.stringify(ANALYTICS_DOMAIN)},${JSON.stringify(INTERNAL_ANALYTICS_BROWSER_KEY)});
`.trim();
}

/**
 * Whether to emit the GTM `<noscript>` iframe.
 *
 * A noscript fallback cannot run the hostname check — not running scripts is
 * the entire point of it — so the build environment decides instead. Vercel
 * sets VERCEL_ENV on every deploy and only the production one gets
 * "production", so preview builds omit the iframe. Deliberately fail-closed:
 * an unrecognised environment loses noscript-only pageviews (visitors with
 * JavaScript disabled, who record nothing else anyway) rather than leaking
 * into the production project.
 */
export function shouldRenderNoscriptFallback(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}

/**
 * Paths that belong to the product, not the website.
 *
 * Vercel Web Analytics is here to measure the marketing site — what people
 * read before they sign up. Once someone is inside the product, their
 * pageviews say nothing about that, and the URLs start carrying things worth
 * keeping out of a third-party store: `/reset-password` puts a live
 * single-use token in the query string, and `/app` and `/finances` name what
 * a signed-in person is looking at.
 *
 * `/register` and `/getstarted` are deliberately NOT here. They are noindexed,
 * but they are the website's conversion point — measuring the site without
 * them would leave out the only pageview that matters.
 */
export const PRODUCT_PATH_PREFIXES = [
  "/admin",
  "/app",
  "/finances",
  "/forgot-password",
  "/login",
  "/payment-success",
  "/profile",
  "/reset-password",
  "/transactions",
  "/verify-email",
] as const;

/**
 * True for a path on the marketing site rather than inside the product.
 *
 * Prefixes match a whole segment: `/app` covers `/app` and `/app/settings`
 * but not `/apply`, so a future marketing page is not silently swallowed by
 * a product prefix it happens to start with.
 */
export function isMarketingPath(pathname: string): boolean {
  return !PRODUCT_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Query parameters that may ride along with a measured pageview.
 *
 * An allowlist for the same reason isAnalyticsHost() is one. The marketing
 * site's own links put a customer's email address on `/register`
 * (src/services/stripe-email.ts) and a Stripe checkout session id beside it
 * (src/routes/stripe.ts), and Vercel records the whole URL, query string
 * included. A blocklist would have to name `email` and `session_id` today
 * and the next such parameter before anyone adds it; this way the default
 * for an unrecognised parameter is to drop it.
 *
 * Campaign attribution is the only thing measuring a marketing site needs
 * from a query string, so that is all this lists. Add a parameter here only
 * once it is clear it can never carry anything about a specific person.
 *
 * `ref` is deliberately absent despite looking like attribution. It is the
 * name the calculator results-email handover uses for its one-time bearer
 * token (lib/calculator-handover.ts), and the homepage's own `ref` is a
 * legacy parameter that is read and discarded rather than attributed. So it
 * would record nothing we use while standing ready to record a token the
 * moment one reaches a rendered URL.
 */
export const MEASURED_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
] as const;

/**
 * The URL to report for a pageview: the origin and path as visited, the
 * allowlisted query parameters, and nothing else — no other parameters and
 * no fragment.
 */
export function redactAnalyticsUrl(url: URL): string {
  const redacted = new URL(`${url.origin}${url.pathname}`);
  for (const param of MEASURED_QUERY_PARAMS) {
    const value = url.searchParams.get(param);
    if (value !== null) redacted.searchParams.set(param, value);
  }
  return redacted.toString();
}

/**
 * How much of the site a Vercel component is meant to report on.
 *
 * Web Analytics answers "how is the website doing", so the product is noise
 * in it. Speed Insights answers "how fast is this page", which is worth
 * knowing for the signed-in app too — a slow `/finances` is a real problem,
 * and dropping it would measure only the half of the site that is already
 * static. The two differ here and nowhere else.
 */
export type TelemetrySurface = "marketing-only" | "whole-site";

/**
 * The URL a Vercel component should report for an event, or null to drop it.
 *
 * Both components ask the same three questions — is this the production
 * site, is this a surface we measure, is this browser marked internal — and
 * report the same redacted URL, so they ask them through one function rather
 * than two `beforeSend` bodies that can drift apart. Only `surface` differs.
 *
 * A URL that will not parse is dropped rather than reported: a value this
 * code cannot inspect is exactly the one not to hand to a third party.
 */
export function measuredUrl(href: string, surface: TelemetrySurface): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // Same allowlist as the GTM snippet, so dev servers and *.vercel.app
  // previews never record into the production project.
  if (!isAnalyticsHost(url.hostname)) return null;

  if (surface === "marketing-only" && !isMarketingPath(url.pathname)) return null;

  // The same opt-out that keeps our own browsing out of GTM and Contentsquare.
  if (isInternalAnalyticsBrowser()) return null;

  return redactAnalyticsUrl(url);
}
