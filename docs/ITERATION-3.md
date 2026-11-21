# Iteration 3: SingStat Table Builder (keyless breadth)

2026-11-21, checked around 08:38-08:48 Asia/Singapore.

## Delivered

- Three SingStat Table Builder tools (Department of Statistics), all keyless:
  - `sg_singstat_search`: keyword search over ~2,800 tables from 70 public
    agencies; `all` / `title` / `variable` scopes; output capped at 20 records.
  - `sg_singstat_metadata`: title, frequency, source agency, coverage period,
    last-updated date and the series/row list, without data values.
  - `sg_singstat_table`: bounded table slice with limit 1-500 (upstream allows
    5000), explicit offset, whitelisted sort orders, time filter, inclusive
    value range and substring search. No automatic pagination.
- 19 tools total. Client-side bucket 20 req/min per process for
  tablebuilder.singstat.gov.sg, under the documented 100 calls/min per IP.
- Transient transport failures (timeout, connection drop) now get one paced
  retry through the same quota bucket, then surface as errors. 403 and
  upstream error bodies (including SingStat `StatusCode` >= 400) are never
  retried or cached.
- New captured fixtures: SingStat search (trimmed to 3 records), metadata and
  tabledata excerpts for table M650681 (Car Population By CC Rating, Annual;
  source agency: Land Transport Authority).

## Verification

- `npm test`: 42/42 offline tests pass, including SingStat URL building,
  resource-ID injection rejection, sort whitelist, filter character
  restrictions, fixture parsing, truncation, error-status rejection, the
  transient-retry paths and the offline stdio handshake (19 tools).
- `npm run test:live`: 12/12 checks pass on the final run: handshake,
  discovery, PSI, taxi, diagnostics, cache hit, HDB dataset rows/schema,
  SingStat metadata, sorted SingStat table slice, SingStat search. Seven
  upstream requests total, within all documented limits.
- No live request was designed to trigger 429; none was observed.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. Official docs: https://www.tablebuilder.singstat.gov.sg/view-api/for-developers
   and its OpenAPI spec. Documented limit: 100 calls/minute per IP address.
   No key or signup. Terms link points to data.gov.sg's API terms.
2. `tabledata` `limit` semantics shift with `sortBy`: unsorted, limit bounds
   columns per series row (limit=3 gave 1 row x 3 time points); sorted, it
   bounds series rows (limit=3 gave 3 rows x 1 column). Callers should not
   assume one fixed meaning; metadata `total` is the reliable size signal.
3. The host (behind Azure Application Gateway) intermittently hangs requests:
   bursts of 10s+ stalls with zero bytes, then fast recoveries, observed with
   both curl and Node. Not a 429 and not quota-shaped; the server's 15s
   timeout plus one paced retry absorbed it during the final run. If hangs
   persist, back off longer rather than adding parallelism.
4. Detailed-trade-data-only parameters (cursor, markets, tradeTypes,
   searchoption) are intentionally not exposed yet; no cursor auto-following.
5. Search responses are unpaginated upstream and can be large (~100 KB for a
   common keyword); output is capped at 20 records with a truncation flag.
6. SingStat data is Department of Statistics / source-agency content under
   the Singapore Open Data Licence; fixtures retain attribution.

## Not done / next

- OneMap auth/geocoding still awaits secure programmatic credential access.
- LTA DataMall: per owner decision 2026-11-20, do not resubmit the signup.
  If a key arrives by email, store it in the vault only.
- data.gov.sg catalogue/metadata routes (403) remain unimplemented.
- URA, PUB, MOM candidates from PLAN.md Phase 5 remain open.
