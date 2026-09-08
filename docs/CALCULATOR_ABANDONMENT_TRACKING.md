# Calculator abandonment tracking

Contentsquare custom page events on the retirement calculator:

- `retirement_calculator_field_edited`: once per component mount, on the first actual change to a numeric input, claiming-age selection, or allocation. Prefills, focus, unchanged normalized values, validation, and submission alone do not qualify. No field names or entered values are sent.
- `retirement_model_clicked`: each activation of the enabled Run button, before browser validation. Invalid attempts therefore count as clicks, not as abandonment without a click.
- `retirement_model_requested`: existing event for a valid submission starting a request.
- `retirement_model_run`: existing event for displayed results, not button clicks.

For sessions landing on `/retirement-calculator`, calculate field-edit abandonment as sessions with `retirement_calculator_field_edited` and no `retirement_model_clicked`, divided by sessions with `retirement_calculator_field_edited`. Deduplicate by session and split desktop/mobile. Do not use raw event counts or the broader `retirement_calculator_started` event as the denominator. A reload can produce another field-edit event in the same session.

Measure only completed, post-deployment sessions. No unload/exit event is needed: abandonment is the absence of a Run click in a completed session, not a browser-close beacon. This measures any field edit, not whether all fields were completed. Keep successful calculations and validation failures separate.

These events use the existing Contentsquare helper and host gate. No GA4/GTM tags or dashboard segments are added by this code change. After deployment, verify ingestion before enabling the corresponding report; data before deployment cannot be backfilled by these events.
