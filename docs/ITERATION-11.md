# Iteration 11: two more curated datasets (COE results, HDB carparks)

2026-11-28, checked around 09:06 Asia/Singapore.

## Delivered

- Registry extended 9 to 11 entries, each verified live once:
  - LTA COE Bidding Results / Prices (d_69b3380ad7e51aff3a7dcc84eba52b8a) -
    columns month, bidding_no, vehicle_class, quota, bids_success,
    bids_received, premium; 2000 rows at verification. Keyless via
    data.gov.sg; no DataMall key needed.
  - HDB Carpark Information (d_23f946fa557947f93a8043bbef41dd09) - static
    carpark directory: number, address, coordinates, type, parking system,
    free/night parking, decks; 2273 rows at verification.
- 25 tools total (registry content only; no new endpoints).

## Verification

- One bounded schema query per new ID on the official datastore route,
  paced 4s apart, inside the 3/10s client cap.
- `npm test`: 62/62 offline tests pass. `npm run test:live`: 18/18 checks
  pass. No 429 observed or provoked.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. Mailbox checked: no LTA correspondence.
2. OneMap untouched per the 2026-11-24 parent decision.
3. The workspace box had been reset overnight again; the repo was
   re-cloned from GitHub before work started.

## Not done / next

- Confirm populated flood-alerts readings during an actual alert.
- More curated datasets as useful IDs surface (URA once token rules allow).
- OneMap population/themes once an owner-approved credential copy exists.
