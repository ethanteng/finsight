'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'
import { measuredUrl } from '../lib/analytics-host'

/**
 * Vercel Web Analytics, gated the same way every other tag on this site is.
 *
 * The gate runs in `beforeSend` rather than around the component: the root
 * layout is a server component, so it cannot pass a function prop, and it is
 * prerendered at build time, so it does not know the host or the path that
 * will be served. `beforeSend` runs in the browser on every pageview, which
 * is the only place those answers exist.
 *
 * "marketing-only" because this measures how the website is doing; the
 * signed-in product is not what it is for. See lib/analytics-host.ts.
 */
export default function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        const url = measuredUrl(event.url, 'marketing-only')
        return url === null ? null : { ...event, url }
      }}
    />
  )
}
