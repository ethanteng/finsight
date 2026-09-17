-- Saved in BigQuery as: Ask Linc — calculator signup routes and limits
-- Observed sessions, not cohort rates; daily export through yesterday.
-- Missing new-event rows are not verified zeros. Handoff is not app load or verified email.
-- PR264 direct-save and limit events cannot be backfilled. Other bot filters differ from /admin/marketing.
WITH raw AS (
 SELECT event_date,event_timestamp,event_name,user_pseudo_id,device.category AS device,device.web_info.hostname AS hostname,
 (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS session_id,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS page_location,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='traffic_type') AS traffic_type,
 (SELECT COALESCE(value.string_value,CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key='debug_mode') AS debug_mode,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='calculator_type') AS calculator_type,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='signup_flow') AS signup_flow,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='signup_origin') AS signup_origin,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='signup_entry') AS signup_entry
 FROM `gen-lang-client-0360308471.analytics_519498279.events_*`
 WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d',DATE_SUB(CURRENT_DATE('America/Los_Angeles'),INTERVAL 29 DAY))
 AND FORMAT_DATE('%Y%m%d',CURRENT_DATE('America/Los_Angeles')) AND platform='WEB'
), eligible AS (
 SELECT user_pseudo_id,session_id FROM raw
 WHERE user_pseudo_id IS NOT NULL AND session_id IS NOT NULL
 AND DATE(TIMESTAMP_SECONDS(session_id),'America/Los_Angeles') BETWEEN DATE_SUB(CURRENT_DATE('America/Los_Angeles'),INTERVAL 28 DAY)
 AND DATE_SUB(CURRENT_DATE('America/Los_Angeles'),INTERVAL 1 DAY)
 GROUP BY 1,2 HAVING COUNTIF(traffic_type='internal' OR LOWER(COALESCE(debug_mode,'')) IN ('1','true')
 OR REGEXP_CONTAINS(COALESCE(page_location,''),r'^https?://[^/]+/admin(?:/|[?#]|$)'))=0
), outcomes AS (
 SELECT r.*,
 CASE WHEN event_name='retirement_results_emailed' THEN 'retirement'
 WHEN event_name='coast_fire_results_emailed' THEN 'coast_fire'
 WHEN event_name IN ('calculator_results_page_cta_opened','calculator_results_email_cta_opened','calculator_run_limit_reached') THEN calculator_type
 WHEN signup_origin='retirement_calculator' THEN 'retirement'
 WHEN signup_origin='coast_fire_calculator' THEN 'coast_fire' END AS calculator,
 CASE WHEN event_name='calculator_run_limit_reached' THEN 'limit_exposure'
 WHEN event_name IN ('retirement_results_emailed','coast_fire_results_emailed') THEN 'save_request'
 WHEN event_name='calculator_results_page_cta_opened' THEN 'results_page'
 WHEN event_name='calculator_results_email_cta_opened' THEN 'results_email'
 ELSE COALESCE(signup_entry,'unknown') END AS route
 FROM raw r JOIN eligible USING(user_pseudo_id,session_id)
 WHERE hostname IN ('asklinc.com','www.asklinc.com')
 AND (event_name IN ('calculator_results_page_cta_opened','calculator_results_email_cta_opened','calculator_run_limit_reached','retirement_results_emailed','coast_fire_results_emailed')
 OR (signup_flow='free_trial' AND event_name IN ('trial_signup_viewed','sign_up','trial_signup_completed')))
)
SELECT calculator,route,device,event_name,
COUNT(DISTINCT TO_JSON_STRING(STRUCT(user_pseudo_id,session_id))) AS observed_sessions,
COUNT(*) AS event_occurrences,MIN(PARSE_DATE('%Y%m%d',event_date)) AS first_observed_day,MAX(PARSE_DATE('%Y%m%d',event_date)) AS last_observed_day
FROM outcomes WHERE calculator IN ('retirement','coast_fire')
GROUP BY 1,2,3,4 ORDER BY calculator,route,device,event_name;
