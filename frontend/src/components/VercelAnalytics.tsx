'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'
import { isAnalyticsHost, isMarketingPath, redactAnalyticsUrl } from '../lib/analytics-host'
import { isInternalAnalyticsBrowser } from '../lib/internal-analytics'

/**
 * Vercel Web Analytics, gated the same way every other tag on this site is.
 *
 * The gate has to run in `beforeSend` rather than around the component: the
 * root layout is a server component, so it cannot pass a function prop, and
 * it is prerendered at build time, so it does not know the host or the path
 * that will be served. `beforeSend` runs in the browser on every pageview,
 * which is the only place all three answers exist.
 *
 * Dropping an event returns null, which is the package's documented way to
 * discard it — nothing is sent for that pageview.
 */
export default function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        const url = new URL(event.url)

        // Same allowlist as the GTM snippet: the production site only, so dev
        // servers and *.vercel.app previews never record into the real
        // project. See lib/analytics-host.ts.
        if (!isAnalyticsHost(url.hostname)) return null

        // The website is what we measure; the signed-in product is not.
        if (!isMarketingPath(url.pathname)) return null

        // Honours the same opt-out that keeps our own browsing out of GTM
        // and Contentsquare. See lib/internal-analytics.ts.
        if (isInternalAnalyticsBrowser()) return null

        // A measured path can still be reached by a URL carrying a customer's
        // email address or a Stripe session id, so the query string is
        // rebuilt from an allowlist rather than passed through.
        return { ...event, url: redactAnalyticsUrl(url) }
      }}
    />
  )
}
