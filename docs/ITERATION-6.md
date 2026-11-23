# Iteration 6: PUB flood alerts (v2 real-time)

2026-11-23, checked around 09:19 Asia/Singapore.

## Delivered

- `sg_flood_alerts`: PUB real-time flood alert events across Singapore via
  the official data.gov.sg v2 real-time endpoint
  `GET /v2/real-time/api/weather/flood-alerts`. Flood warning notices are
  not part of this feed (per the dataset page).
- 24 tools total. The source joins the measured v2 keyless bucket
  (5 requests/10s per process, under the measured 6/10s) with a 2-minute
  cache, matching the feed's documented "updated every 2 minutes".

## Verification

- Source discovery from official pages only: the PUB flood alerts dataset
  page (d_f1404e08587ce555b9ea3f565e2eb9a3, "Updated every 2 minutes")
  and the real-time API guide. One gentle live check: HTTP 200, `code: 0`,
  `data.records` list (empty at check time, no active alerts) plus a
  `paginationToken` field.
- `npm test`: 55/55 offline tests pass, including the new fixture shape and
  bucket/TTL assertions.
- `npm run test:live`: 16/16 checks pass, including a live
  `sg_flood_alerts` call. Upstream requests this iteration: one endpoint
  check plus the live test call, minutes apart, within self-imposed caps.
  No 429 observed or provoked.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. The flood-alerts response uses a `records` array (not the `items` shape
   of the NEA weather endpoints); tools return the JSON as-is, so clients
   should read `data.records`.
2. No active flood alerts at check time, so per-record fields (location,
   severity, timestamps) are not yet observed live; the fixture records the
   empty-state shape. Record-level shape will be confirmed from an active
   alert or the downloadable API spec in a later iteration.
3. PUB "Water Level Sensors" (d_31333fa5cf0834f012d840365b336610) is a
   bulk `poll-download` dataset, not a real-time endpoint; bulk downloads
   remain deferred pending a conservative resolution of their documented
   limits (Phase 2 boundary).
4. Mailbox checked: no LTA correspondence. OneMap live checks skipped (no
   ONEMAP_TOKEN; token lapses ~Nov 24 and renewal needs another
   owner-approved one-time credential copy).

## Not done / next

- data.gov.sg catalogue/metadata routes (403) remain unimplemented.
- Phase 5 candidates: datastore-backed statistics curation (e.g. MOM/labour
  via the existing dataset tools), OneMap population/themes after a
  response-size review, flood-alerts record-shape confirmation.
