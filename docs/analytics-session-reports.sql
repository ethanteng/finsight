-- Ask Linc: exact observed-session conversion reports (BigQuery Standard SQL).
-- Reporting timezone is America/Los_Angeles; verify against GA4 property before first live run.
-- Set this to the FIRST COMPLETE day after the frontend GA4 bridge is deployed
-- and collection verified. Do not interpret missing pre-deployment events as abandonment.
DECLARE first_full_tracking_date DATE DEFAULT NULL;
DECLARE report_start DATE DEFAULT DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 28 DAY);
-- Three-day reporting lag allows GA4 late-arriving events to settle.
DECLARE report_end DATE DEFAULT DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 3 DAY);
ASSERT first_full_tracking_date IS NOT NULL AS 'Set first_full_tracking_date after deployment and collection verification.';
SET report_start = GREATEST(report_start, first_full_tracking_date);
ASSERT report_start <= report_end AS 'No complete post-deployment reporting days yet.';

CREATE TEMP FUNCTION clean_path(value STRING) AS (
  CASE WHEN value IS NULL OR value = '' THEN NULL
    ELSE COALESCE(NULLIF(REGEXP_REPLACE(
      REGEXP_EXTRACT(REGEXP_REPLACE(value, r'^https?://[^/]+', ''), r'^([^?#]*)'),
      r'/+$', ''), ''), '/') END
);

CREATE TEMP TABLE raw_events AS
SELECT PARSE_DATE('%Y%m%d', event_date) AS event_day, event_timestamp,
  batch_page_id, batch_ordering_id, batch_event_index, event_name,
  user_pseudo_id,
  (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
  device.category AS device_category,
  clean_path((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location')) AS page_path,
  clean_path((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source_page')) AS source_path,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'signup_flow') AS signup_flow
FROM `gen-lang-client-0360308471.analytics_519498279.events_*`
WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(report_start, INTERVAL 1 DAY))
  AND FORMAT_DATE('%Y%m%d', DATE_ADD(report_end, INTERVAL 1 DAY))
  AND platform = 'WEB';

-- Include next-day events so a session crossing midnight is not prematurely abandoned.
-- GA session IDs are session-start Unix seconds; exclude sessions without usable IDs.
CREATE TEMP TABLE events AS
SELECT *, ROW_NUMBER() OVER (
  PARTITION BY user_pseudo_id, session_id
  ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index, event_name
) AS event_order
FROM raw_events
WHERE user_pseudo_id IS NOT NULL AND session_id IS NOT NULL
  AND DATE(TIMESTAMP_SECONDS(session_id), 'America/Los_Angeles') BETWEEN report_start AND report_end;

CREATE TEMP TABLE sessions AS
SELECT user_pseudo_id, session_id,
  ARRAY_AGG(device_category IGNORE NULLS ORDER BY event_order LIMIT 1)[SAFE_OFFSET(0)] AS device_category,
  ARRAY_AGG(IF(event_name = 'page_view', page_path, NULL) IGNORE NULLS ORDER BY event_order LIMIT 1)[SAFE_OFFSET(0)] AS landing_page,
  MIN(IF(event_name = 'page_view', event_order, NULL)) AS landing_order,
  MIN(IF(event_name = 'page_view' AND page_path = '/getstarted', event_order, NULL)) AS signup_page_order,
  MIN(IF(event_name = 'retirement_calculator_field_edited' AND COALESCE(source_path, page_path) = '/retirement-calculator', event_order, NULL)) AS edit_order,
  MIN(IF(event_name = 'retirement_model_clicked' AND COALESCE(source_path, page_path) = '/retirement-calculator', event_order, NULL)) AS run_order,
  MIN(IF(event_name = 'retirement_model_requested' AND COALESCE(source_path, page_path) = '/retirement-calculator', event_order, NULL)) AS request_order,
  MIN(IF(event_name = 'retirement_model_run' AND COALESCE(source_path, page_path) = '/retirement-calculator', event_order, NULL)) AS result_order
FROM events GROUP BY user_pseudo_id, session_id;

-- 0. Coverage checks. Missing IDs/paths and ordering ties are NOT conversions or zero abandonment.
SELECT 'coverage' AS report, COUNT(*) AS events_in_reporting_days,
  COUNTIF(user_pseudo_id IS NULL OR session_id IS NULL) AS events_without_session_identity,
  COUNTIF(event_name = 'start_free_click' AND COALESCE(source_path, page_path) IS NULL) AS clicks_without_source,
  COUNTIF(event_name = 'retirement_calculator_field_edited') AS field_edit_events,
  COUNTIF(event_name = 'retirement_model_clicked') AS run_click_events
FROM raw_events WHERE event_day BETWEEN report_start AND report_end;

SELECT 'ordering_quality' AS report, COUNT(*) AS tied_ordering_groups
FROM (SELECT user_pseudo_id, session_id, event_timestamp, batch_page_id, batch_ordering_id, batch_event_index
  FROM events GROUP BY 1,2,3,4,5,6 HAVING COUNT(*) > 1);
-- Investigate ties before claiming exact ordering; event-name tie-breaks are deterministic, not evidence.

-- 1. Source-page Start free CTR. One session per page in denominator, one clicking session in numerator.
-- The click must occur ON that page after its first page_view, not elsewhere later in the session.
CREATE TEMP TABLE page_visits AS
SELECT user_pseudo_id, session_id, page_path, MIN(event_order) AS first_view
FROM events WHERE event_name = 'page_view' AND page_path IS NOT NULL GROUP BY 1,2,3;
CREATE TEMP TABLE page_rates AS
SELECT v.page_path, s.device_category, COUNT(*) AS page_sessions,
  COUNTIF(EXISTS(SELECT 1 FROM events c WHERE c.user_pseudo_id=v.user_pseudo_id AND c.session_id=v.session_id
    AND c.event_name='start_free_click' AND COALESCE(c.source_path,c.page_path)=v.page_path AND c.event_order>v.first_view)) AS clicking_sessions,
  SUM((SELECT COUNT(*) FROM events c WHERE c.user_pseudo_id=v.user_pseudo_id AND c.session_id=v.session_id
    AND c.event_name='start_free_click' AND COALESCE(c.source_path,c.page_path)=v.page_path AND c.event_order>v.first_view)) AS click_events
FROM page_visits v JOIN sessions s USING(user_pseudo_id,session_id)
GROUP BY 1,2;
SELECT 'start_free_by_source_page' AS report, *,
  ROUND(100 * SAFE_DIVIDE(clicking_sessions,page_sessions),2) AS click_rate_pct
FROM page_rates ORDER BY clicking_sessions DESC, page_sessions DESC;

-- 2. Percentage-point differences between pages, within each device category.
SELECT 'page_rate_comparison' AS report, a.device_category, a.page_path AS page_a, b.page_path AS page_b,
  a.page_sessions AS page_a_sessions,b.page_sessions AS page_b_sessions,
  ROUND(100*(SAFE_DIVIDE(a.clicking_sessions,a.page_sessions)-SAFE_DIVIDE(b.clicking_sessions,b.page_sessions)),2) AS a_minus_b_percentage_points
FROM page_rates a JOIN page_rates b ON a.device_category=b.device_category AND a.page_path<b.page_path
WHERE a.clicking_sessions>0 OR b.clicking_sessions>0;

-- 3. /getstarted observed-session drop-off: no later confirmed sign_up in the same session.
WITH signup AS (
  SELECT s.*, EXISTS(SELECT 1 FROM events e WHERE e.user_pseudo_id=s.user_pseudo_id AND e.session_id=s.session_id
    AND e.event_name='sign_up' AND e.event_order>s.signup_page_order) AS registered
  FROM sessions s WHERE signup_page_order IS NOT NULL
)
SELECT 'signup_dropoff' AS report, device_category, COUNT(*) AS signup_page_sessions,
  COUNTIF(registered) AS registered_sessions, COUNTIF(NOT registered) AS no_registration_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(NOT registered),COUNT(*)),2) AS dropoff_pct
FROM signup GROUP BY 2;

CREATE TEMP TABLE calculator AS
SELECT s.*,
  COUNTIF(e.event_name='start_free_click' AND e.event_order>s.landing_order)>0 AS any_start_free,
  COUNTIF(e.event_name='start_free_click' AND COALESCE(e.source_path,e.page_path)='/retirement-calculator'
    AND e.event_order>s.landing_order)>0 AS calculator_start_free,
  COUNTIF(e.event_name='start_free_click' AND e.event_order>s.run_order)>0 AS start_free_after_run,
  ARRAY_AGG(IF(e.event_name='page_view' AND e.event_order>s.landing_order
    AND e.page_path!='/retirement-calculator',e.page_path,NULL)
    IGNORE NULLS ORDER BY e.event_order LIMIT 1)[SAFE_OFFSET(0)] AS next_different_page
FROM sessions s LEFT JOIN events e USING(user_pseudo_id,session_id)
WHERE s.landing_page='/retirement-calculator' GROUP BY ALL;

-- 4. Calculator landing-session conversion and abandonment. No Run anywhere in session = abandoned edit.
SELECT 'calculator_landing_outcomes' AS report, device_category, COUNT(*) AS landing_sessions,
  COUNTIF(run_order IS NOT NULL) AS run_click_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(run_order IS NOT NULL),COUNT(*)),2) AS landing_to_run_pct,
  COUNTIF(edit_order IS NOT NULL) AS field_edit_sessions,
  COUNTIF(edit_order IS NOT NULL AND run_order IS NULL) AS edit_without_run_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(edit_order IS NOT NULL AND run_order IS NULL),COUNTIF(edit_order IS NOT NULL)),2) AS field_edit_abandonment_pct,
  COUNTIF(request_order IS NOT NULL) AS requested_sessions, COUNTIF(result_order IS NOT NULL) AS result_sessions,
  COUNTIF(any_start_free) AS start_free_any_page_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(any_start_free),COUNT(*)),2) AS landing_to_start_free_pct,
  COUNTIF(calculator_start_free) AS start_free_on_calculator_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(calculator_start_free),COUNT(*)),2) AS calculator_page_start_free_pct
FROM calculator GROUP BY 2;

-- 5. First DIFFERENT tracked page after calculator landing (reloads ignored).
-- No other page observed is not proof of browser close; includes single-page results and untracked exits.
SELECT 'calculator_next_destination' AS report, device_category,
  COALESCE(next_different_page,'[No other tracked page / exit]') AS destination, COUNT(*) AS sessions,
  ROUND(100*SAFE_DIVIDE(COUNT(*),SUM(COUNT(*)) OVER(PARTITION BY device_category)),2) AS share_of_landing_sessions_pct
FROM calculator GROUP BY 2,3 ORDER BY device_category,sessions DESC;

-- 6. Same-session Run cohorts. The Run group's conversion numerator requires CTA AFTER Run.
-- Also show any-CTA rate and CTA-only-before-Run count so chronology cannot be mistaken.
-- This is descriptive, not proof that running the model causes more signups.
SELECT 'calculator_run_cohorts' AS report, device_category,
  IF(run_order IS NULL,'No Run in session','Run in session') AS cohort,
  COUNT(*) AS landing_sessions, COUNTIF(any_start_free) AS any_start_free_sessions,
  COUNTIF(IF(run_order IS NULL,any_start_free,start_free_after_run)) AS sequence_qualified_start_free_sessions,
  ROUND(100*SAFE_DIVIDE(COUNTIF(IF(run_order IS NULL,any_start_free,start_free_after_run)),COUNT(*)),2) AS sequence_qualified_start_free_pct,
  ROUND(100*SAFE_DIVIDE(COUNTIF(any_start_free),COUNT(*)),2) AS any_start_free_pct,
  COUNTIF(run_order IS NOT NULL AND any_start_free AND NOT start_free_after_run) AS cta_only_before_run_sessions
FROM calculator GROUP BY 2,3;
