'use client'

import { useEffect } from 'react'
import { startClicksTracker } from '../lib/clicks-analytics'

/**
 * clicks.page, gated to the production marketing site.
 *
 * Rendered in the root layout, which stays mounted across client-side
 * navigation, so the effect runs once per document: the decision is made from
 * the URL the page was loaded at. See lib/clicks-analytics.ts.
 */
export default function ClicksAnalytics() {
  useEffect(() => {
    startClicksTracker(window, document)
  }, [])

  return null
}
