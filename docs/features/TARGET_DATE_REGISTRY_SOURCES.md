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

Plus the **Data Gaps** tab of the admin panel (`GET /admin/registry-sources`).

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

**Nothing is automated.** The job never edits the registry. Deciding that new
published weights should replace transcribed ones is a human judgment, and an
auto-updating registry would defeat the point of citing evidence at all.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | unless `--dry-run` | Reuses the existing Resend account |
| `REGISTRY_ALERT_EMAIL_TO` | unless `--dry-run` | Where drift alerts are sent |
| `REGISTRY_ALERT_EMAIL_FROM` | no | Defaults to `Ask Linc <noreply@asklinc.com>` |

Both required values are GitHub Actions **secrets**, not Render or Vercel
environment variables — this runs in CI, not in the app.

## Responding to drift

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
