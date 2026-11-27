# Iteration 10: two more curated datasets (HDB RPI, MOE schools)

2026-11-27, checked around 09:29 Asia/Singapore.

## Delivered

- Registry extended 7 to 9 entries, each verified live once:
  - HDB Resale Price Index (1Q2009 = 100), Quarterly
    (d_14f63e595975691e7c24a27ae4c07c79) - columns quarter, index; 147 rows
    at verification.
  - MOE General information of schools (d_688b934f82c1059ed0a6993d2a829089)
    - school directory: name, address, postal code, phone, email, nearest
    MRT and more; 337 rows at verification.
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
3. Flood alerts were not re-checked for active readings this iteration
   beyond the standard live suite call; records remained observation
   windows.

## Not done / next

- Confirm populated flood-alerts readings during an actual alert.
- More curated datasets as useful IDs surface (URA once token rules allow).
- OneMap population/themes once an owner-approved credential copy exists.
