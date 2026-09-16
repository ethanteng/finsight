# Calculator repeat use in /admin/marketing

The “Do people run the calculators again?” section uses the existing GA4
BigQuery session adapter. No additional browser events or queries are needed.
Deploy both the backend and frontend to expose the new report field and UI.

- Retirement success: `retirement_model_run`.
- Coast FIRE success: `coast_fire_calculated` with `calculation_trigger=submitted`.
- Session identity: `user_pseudo_id` plus `ga_session_id`, already grouped by
  the adapter; one visitor can have multiple separately counted sessions.
- Repeat rate: sessions with 2+ successful runs of that calculator / sessions
  with at least one successful run. Average runs uses the same denominator.
- Distribution: sessions with 1, 2, 3, or 4+ successful runs.
- Start-free rate: calculating sessions with any `start_free_click` in that
  same session / calculating sessions, split into single-run and repeat-run
  groups. This does not require CTA-after-result ordering and is not causal.
- Both calculators: sessions with at least one successful run of each. These
  sessions also appear in each calculator's own counts, unlike the existing
  mutually exclusive beachhead/baseline journey cohorts.

The section inherits report dates and server-side traffic/acquisition filters,
including default bot/internal exclusions, with an additional local device
selector. It does not use the trial-funnel tracking-start guard because these
are result-event metrics rather than completed signup attribution.

Counts describe observed events, not verified complete instrumentation across
the whole period. Default Coast FIRE examples, failures, and raw clicks do not
count. Repeated submissions with identical inputs do count. Zero-denominator
rates are null, not 0%. Missing/configuration-failed/truncated exports are
unavailable, not zero. Daily export delay and late arrivals still apply, as do
the existing adapter's export-coverage limits. No financial inputs are added to
tracking, and duplicate/missing events can affect the observed counts.
