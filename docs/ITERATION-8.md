# Iteration 8: flood-alerts record shape + two more curated datasets

2026-11-25, checked around 08:52 Asia/Singapore.

## Delivered

- Flood-alerts record shape, from the official OpenAPI spec embedded in the
  PUB dataset page (extracted from the page itself; no alternate host). Each
  record has `datetime`, `updatedTimestamp` and `item` (CAP-style alert
  envelope: type, identifier, msgType, sender, scope, status, references)
  with `item.readings[]` entries carrying `area` (street names plus a
  `circle` of lat/lng/radius-km, where the radius is the broadcasting
  radius, not flood extent), `headline`, `description`, `instruction`,
  `category`, `certainty`, `severity`, `urgency`, `responseType`, `event`
  (always "Flood"), `eventCode` (default OET-081) and `senderName`
  (always "PUB"). The `sg_flood_alerts` description now names these fields
  so clients know what to read when an alert is active.
- Registry extended from 4 to 6 entries, each verified live once:
  - SingStat Consumer Price Index (CPI), 2024 As Base Year, Monthly
    (d_bdaff844e3ef89d39fceb962ff8f0791) - wide table, one column per
    month; 207 rows at verification.
  - NEA Rainfall - Monthly Total (d_b16d06b83473fdfcc92ed9d37b66ba58) -
    columns month, total_rainfall; 538 rows at verification.
- 25 tools total (registry content and a source description changed; no new
  endpoints).

## Verification

- The two new registry IDs were verified live once each with a bounded
  schema query (`datastore_search` limit=1) on the official data.gov.sg
  route, paced 4s apart, inside the 3/10s client cap.
- `npm test`: 60/60 offline tests pass (spec fixture shape, description
  fields, registry assertions).
- `npm run test:live`: 18/18 checks pass. No 429 observed or provoked.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. The flood-alerts spec lives inside the official dataset page's own
   embedded data; the separate "Download API Specs" signed link was not
   needed and no alternate host was touched.
2. Per the spec, `area.circle` radius is the alert's broadcasting radius,
   NOT the extent of flooding - callers must not read it as flood size.
3. Flood warning notices are not part of this feed (dataset page note).
4. Mailbox checked: no LTA correspondence. Per the parent decision of
   2026-11-24, iteration 8 used no-token options only; OneMap
   population/themes were not attempted (token lapsed, no new credential
   copy requested).

## Not done / next

- OneMap population/themes still deferred until an owner-approved
  credential copy exists.
- More curated datasets as useful IDs surface (URA once token rules allow).
- Confirm the flood-alerts record shape against a live active alert when
  one occurs (the fixture records the empty state).
