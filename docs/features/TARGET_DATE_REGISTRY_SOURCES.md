# Target-Date Registry Sources

`src/services/target-date-fund-registry.ts` holds asset-class weights for
target-date funds the classifier would otherwise be unable to place. The
weights are **hand-transcribed from provider publications**, because no data
vendor sells them: the underlying sleeves are Collective Investment Trusts,
which are not registered under the Investment Company Act, file no N-PORT, and
disclose no public holdings. FMP was probed directly against the five State
Street share classes and returns nothing for any of them, while returning full
data for SPY, VTI, AGG and VFIAX — the gap is the instrument class, not the
vendor.

Hand-transcription is therefore the only option, which makes provenance the
whole problem. A `sourceUrl` alone does not reproduce the figure it supports:
provider pages are mutable and republished on the provider's own cadence
(State Street monthly). So every entry also carries a `sourceFingerprint`
recording what its source said when it was read.

## Fingerprints

| Field | Meaning |
|---|---|
| `kind` | `published-values` for HTML pages, `document-sha256` for PDFs |
| `value` | sha256 — of `observed` for HTML, of the raw bytes for a PDF |
| `observed` | The human-readable string an auditor compares to the live page |
| `sourceAsOf` | The holdings date the source advertises |
| `observedAt` | When it was read |

HTML pages fingerprint their **published values**, not their markup — hashing
markup would report drift on every unrelated site rebuild. They cover the
component holdings rather than an aggregate `Asset Allocation` summary, because
an equity total is unchanged when a provider shifts weight between US and
international, so an aggregate fingerprint would report `unchanged` while the
simulation's inputs had moved.

Invariants on all of this are enforced in
`src/__tests__/unit/target-date-registry-provenance.test.ts`, so a new entry
cannot be added with a citation nobody can check later.

## Checking sources

Three ways to reach the same `checkRegistrySources()` result, so a check cannot
mean one thing on the command line and something else in the UI:

```bash
npx ts-node scripts/verify-registry-sources.ts           # report
npx ts-node scripts/verify-registry-sources.ts --emit    # print TS to paste back
npm run notify:registry-drift -- --dry-run               # what the alert would send
```

Plus the **Data Gaps** tab of the admin panel (`GET /admin/registry-sources`),
whose **Update** button applies a moved source's current publication — see
[Updating from the admin panel](#updating-from-the-admin-panel).

Only each fund's newest row is checked. A row an update superseded still
describes the publication it was transcribed from, which the provider no longer
serves, so checking it would report drift for as long as the history is kept.

With `DATABASE_URL` set, the scripts load applied rows exactly as production
does; without it, they check the code rows alone and say so.

Each source lands in one of four states:

| Status | Meaning |
|---|---|
| `unchanged` | The source still publishes what the entry recorded |
| `drifted` | It publishes something else — the citation no longer reproduces the weights |
| `baseline` | No fingerprint to compare against yet |
| `error` | The source could not be read at all |

`drifted` and `error` are deliberately **not** merged. A provider behind a WAF
is an availability problem; a republished page is a data problem. They need
different responses, and conflating them trains the reader to ignore the alert.

## Drift alerting

`.github/workflows/registry-drift.yml` runs `scripts/notify-registry-drift.ts`
every Monday at 13:00 UTC — half State Street's monthly cadence, so detection
lag stays under a fortnight.

It emails in two cases:

- **A source drifted.** The body names each moved entry and shows recorded-vs-now,
  holding by holding.
- **Every source was unreadable.** One unreadable provider is availability noise
  and stays silent. All of them unreadable is a different claim — not "the
  providers are flaky" but "this check is blind" — and a blind check produces
  exactly the inbox silence that otherwise means all-clear. That case is said
  out loud rather than left to be discovered.

A clean run sends nothing, so anything arriving is actionable. Neither case
fails the job: the schedule going red for a provider outage would be noise.

Sends carry a Resend idempotency key derived from what was observed, so the
weekly cron and a same-day manual dispatch do not both land in the inbox. The
key window lapses after 24 hours, so an unresolved drift still repeats the
following week.

**Nothing updates on its own.** The job never edits the registry. Deciding that
new published weights should replace the recorded ones is a human judgment, made
with the admin panel's Update button or by re-transcribing by hand. An
auto-updating registry would defeat the point of citing evidence at all.

The job reads the production database (`DATABASE_URL_PROD`, the secret
`migrate-prod` already uses), because publications applied from the admin panel
live there. A check that could not see them would email every week about funds
that were already updated.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | unless `--dry-run` | Reuses the existing Resend account |
| `REGISTRY_ALERT_EMAIL_TO` | unless `--dry-run` | Where drift alerts are sent |
| `DATABASE_URL` | unless `--dry-run` | Applied publications; the workflow passes `DATABASE_URL_PROD` |
| `REGISTRY_ALERT_EMAIL_FROM` | no | Defaults to `Ask Linc <noreply@asklinc.com>` |

The required values are GitHub Actions **secrets**, not Render or Vercel
environment variables — this runs in CI, not in the app.

## Updating from the admin panel

The registry's rows are code, and a deployed build cannot edit its own source.
So **Update** records a newer publication in Postgres
(`target_date_registry_publications`), and the registry reads those rows
alongside the code rows (`src/services/target-date-registry-store.ts`).

Each update **appends** a row; nothing is overwritten. The new row carries the
publication's own holdings date as `allocationAsOf` and the day it was observed
as `availableFrom`, so an analysis of an earlier snapshot still resolves to the
weights published then, and nothing sees figures before they existed.

The weights are derived from the fingerprint the row records
(`src/services/registry-source-update.ts`), so the two cannot disagree — the
state hand edits could reach, a fingerprint re-baselined over weights nobody
re-read. The rule is the one the State Street rows were transcribed under:

- each holding goes to the sleeve its name is mapped to, from an exact-name
  table of every holding the registry has placed;
- high yield and short-term corporate bonds are credit, and commodities and
  real estate have no sleeve, so all are left out of the weights;
- cash is the money-market line plus any U.S.-dollar balance, less whatever the
  rounded lines total above 100%.

A test derives every existing State Street row from its own fingerprint, so the
rule cannot quietly diverge from the transcriptions. (It found one: the 2025
row's cash had been transcribed 0.01 points high.)

Update refuses, and the panel says why, when:

- a holding is not in the table — a new or renamed instrument is the case a
  person should place, by hand or by adding it to the table;
- the lines do not total within 0.25 points of 100%, which is a partial table
  rather than rounding;
- the cash line is too small to absorb the rounding;
- the source advertises an older holdings date than the entry records;
- the source is a PDF (BlackRock, UC). The holdings are inside the document and
  nothing here reads them, so those still follow
  [Responding to drift](#responding-to-drift).

Before anything is written, the panel shows the weights each entry would get
and how each was derived. Pressing Update sends the observation on screen;
the server observes every source again and applies only those still publishing
exactly that, so a provider republishing between the check and the click is
reported as changed rather than applied unseen. Applied rows are re-validated
against the provenance invariants whenever they are loaded, and a row that
fails is left out and logged rather than fed to a projection.

Analyses pick up applied rows within a minute (a short in-memory TTL, like the
prompt config), and the admin endpoints always read the database directly.

## Responding to drift

For a State Street entry, use **Update** in the admin panel (above). For a PDF
source, or anything Update refuses:

1. Open the `sourceUrl` from the alert and read the current publication.
2. Decide whether the new weights should replace the transcribed ones. They
   usually should, but this is the judgment the tooling deliberately does not make.
3. If re-transcribing, update `weights` **and** `allocationAsOf` together.
4. Re-baseline: `npx ts-node scripts/verify-registry-sources.ts --emit` prints
   fingerprint blocks to paste back.
5. Run the provenance tests before committing.

Re-baselining without re-reading the weights records that the source moved
while leaving the stored numbers unverified, which is precisely the state the
fingerprints exist to make impossible to reach silently.

## Adding an entry

Fund arrives in the **Data Gaps** admin tab, which aggregates what the
classifier could not place across users (by security, never by user). Then:
find a provider publication with component holdings, transcribe the weights,
derive the asset-class buckets, and record a fingerprint via `--emit`.

Do **not** check provider fact sheets into the repo — they are third-party
copyrighted material. The fingerprint exists so the citation is verifiable
without redistributing the document.
