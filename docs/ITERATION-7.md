# Iteration 7: curated featured-datasets registry (MOM/SingStat labour)

2026-11-24, checked around 08:48 Asia/Singapore.

## Delivered

- `sg_featured_datasets`: a curated registry of individually verified
  tabular datasets (dataset ID, title, agency, update cadence, notes). No
  network call; it exists because the data.gov.sg catalogue/metadata API
  returns 403, leaving no programmatic discovery path. 25 tools total.
- Initial registry (4 entries):
  - HDB Resale Flat Prices (d_8b84c4ee58e3cfc0ece0d773c8ca6abc) - carried
    over from iteration 2 verification.
  - MOM Resident Labour Force Participation Rate by Age and Sex
    (d_4ed91a4ac48c9cf0c2bbcf93a7067d74) - 768 rows, columns
    year/sex/age/lfpr.
  - SingStat Labour Force Aged 15 Years And Over, End June, Annual
    (d_f8940ce770d7506567a7579712eedff2) - wide table, one column per year.
  - MOM Employed Residents Aged 15 Years & Over by Occupation, Age And Sex
    (d_9392faa714d5e5809b07b10fbff2993e) - 3456 rows.

## Verification

- Each new registry ID was verified live once with a bounded schema query
  (`datastore_search` limit=1) on the official data.gov.sg route, paced
  seconds apart, inside the 3/10s client cap. All returned success with
  row counts above.
- `npm test`: 58/58 offline tests pass (registry shape/uniqueness, tool
  schema, fixture match).
- `npm run test:live`: 18/18 checks pass, including the registry tool
  (asserts no upstream call) and a live schema check of the MOM occupation
  dataset. No 429 observed or provoked.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. Curation is the workaround-free answer to the blocked catalogue API:
   registry entries come from official dataset pages found by ordinary web
   search, then each ID is verified on the official datastore route.
2. SingStat's annual labour table is wide (59 year columns); the notes field
   tells callers to project with `fields`.
3. Mailbox checked: no LTA correspondence. OneMap live checks skipped; the
   REST token lapses ~today and renewal needs another owner-approved
   one-time credential copy when next required.
4. The flood-alerts API spec download (for per-record shape) needs the
   client-rendered page's signed link; deferred rather than reverse-
   engineered.

## Not done / next

- OneMap population/themes after a response-size review (needs a fresh
  token via the owner-approved credential copy).
- Flood-alerts record shape confirmation from the API spec or a future
  active alert.
- More curated datasets as useful IDs surface (URA once token rules allow,
  more MOM/SingStat series).
