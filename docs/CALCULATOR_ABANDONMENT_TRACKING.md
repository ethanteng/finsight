# Calculator abandonment tracking

Contentsquare custom page events and GA4 data-layer events on the retirement calculator:

- `retirement_calculator_field_edited`: once per component mount, on the first actual change to a numeric input, claiming-age selection, or allocation. Prefills, focus, unchanged normalized values, validation, and submission alone do not qualify. No field names or entered values are sent.
- `retirement_model_clicked`: each activation of the enabled Run button, before browser validation. Invalid attempts therefore count as clicks, not as abandonment without a click.
- `retirement_model_requested`: existing event for a valid submission starting a request.
- `retirement_model_run`: existing event for displayed results, not button clicks.

For sessions landing on `/retirement-calculator`, calculate field-edit abandonment as sessions with `retirement_calculator_field_edited` and no `retirement_model_clicked`, divided by sessions with `retirement_calculator_field_edited`. Deduplicate by session and split desktop/mobile. Do not use raw event counts or the broader `retirement_calculator_started` event as the denominator. A reload can produce another field-edit event in the same session.

Measure only completed, post-deployment sessions. No unload/exit event is needed: abandonment is the absence of a Run click in a completed session, not a browser-close beacon. This measures any field edit, not whether all fields were completed. Keep successful calculations and validation failures separate.

These events use the existing Contentsquare helper and host gate. `pushRetirementInteraction` also sends the seven interaction/error events to the data layer, with only `source_page` and `content_type` parameters. No field names or financial inputs are included. The existing `retirement_model_run` result event remains separate.

GTM container `GTM-PL362L36` version 16 was published September 7, 2026. It adds only `GA4 - calculator interactions` and `CE - calculator interactions`, forwarding the seven allowlisted events to `G-0QBF34C7VK`. Existing result, signup, Start free and Ads tags are unchanged. The frontend bridge still requires deployment; GTM publication alone does not make the new events collect.

Contentsquare collector delivery was verified, but custom-event segmentation remains unavailable in the account. Its page-progression dashboard must not be labeled as event abandonment or confirmed signup.

GA4 native funnels count users, may span sessions, and measure whether a later step follows an earlier step. They are a directional report, not the exact completed-session/no-click definition above. Exact session reporting needs an event-level session export or equivalent validated session-level implementation. After deployment, verify GA4 collection before interpreting rates; data before deployment cannot be backfilled by these events.
