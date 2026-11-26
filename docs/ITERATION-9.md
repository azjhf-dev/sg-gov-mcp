# Iteration 9: flood-alerts semantics correction + LTA vehicle population

2026-11-26, checked around 09:02 Asia/Singapore.

## Delivered

- Flood-alerts semantics correction. A live check at ~09:00 found
  `data.records` holding 25 entries with NO active flood: each record is a
  rolling ~2-minute observation window (datetime/updatedTimestamp,
  `item.type: "observation"`, `isStationData: false`) whose `readings` list
  is populated only during an active alert. Iteration 6-8 described records
  as the alert list itself; that was wrong and is corrected in the source
  description, RATE-LIMITS.md and tests. Live fixture saved.
- Registry extended 6 to 7: LTA Annual Motor Vehicle Population by Vehicle
  Type (d_2873f3b1b2a836103f51f696350b98fa) - columns year, category,
  type, number; 412 rows at verification. LTA data keyless via data.gov.sg,
  no DataMall key needed.
- 25 tools total (no new endpoints; one description correction, one
  registry entry).

## Verification

- Two upstream calls for the flood-alerts finding (check + fixture capture,
  seconds apart, inside the 5/10s v2 cap) and one bounded schema query for
  the LTA dataset (inside the 3/10s datastore cap). No 429 observed or
  provoked.
- `npm test`: 62/62 offline tests pass (observation-window fixture shape,
  corrected description, registry assertions).
- `npm run test:live`: 18/18 checks pass.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. `data.records` on flood-alerts is a rolling window of ~2-minute
   observation ticks, NOT a list of active alerts. To detect an active
   flood, look for records whose `item.readings` is non-empty.
2. Live records carry a slimmer `item` than the spec's full CAP envelope
   (no identifier/msgType/sender/scope/status observed); the spec fields
   may appear only when readings are populated.
3. Mailbox checked: no LTA correspondence. OneMap untouched per the
   2026-11-24 parent decision.

## Not done / next

- Confirm populated readings shape during an actual flood alert.
- More curated datasets as useful IDs surface (URA once token rules allow).
- OneMap population/themes once an owner-approved credential copy exists.
