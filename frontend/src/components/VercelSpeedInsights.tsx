'use client'

import { SpeedInsights } from '@vercel/speed-insights/next'
import { measuredUrl } from '../lib/analytics-host'

/**
 * Vercel Speed Insights, behind the same gate as Web Analytics.
 *
 * It reports the page URL with every vital, so before this wrapper existed a
 * visit to `/reset-password` handed Vercel the live single-use token in its
 * query string. The redaction in `measuredUrl` is the point of gating it.
 *
 * "whole-site", not "marketing-only": a slow `/finances` is a real problem
 * and worth measuring, and unlike a pageview a vital says nothing about who
 * was looking — only how long the page took. Restricting it to the marketing
 * site would measure the half that is already static and miss the half that
 * actually does work.
 */
export default function VercelSpeedInsights() {
  return (
    <SpeedInsights
      beforeSend={event => {
        const url = measuredUrl(event.url, 'whole-site')
        return url === null ? null : { ...event, url }
      }}
    />
  )
}
